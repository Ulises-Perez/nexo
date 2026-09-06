import { computed, ref, type Ref } from 'vue';
import { useAuthStore } from '../auth';
import api from '../../api/axios';
import { hydrateCache, persistCache, clearPersistedCache, MESSAGE_CACHE_KEY } from '../../composables/persistedCache';
import type { ChatMessage, LastMessage } from './types';

export interface MessageCacheDeps {
    activeChannelId: Ref<string>;
    activeDMUser: Ref<{ id: string } | null>;
    // Bound to dms.setActiveDMLastMessage — kept as a callback so this module
    // never needs to know about DM state internals.
    setActiveDMLastMessage: (entry: LastMessage) => void;
}

// LRU per-channel message cache (stale-while-revalidate), plus everything
// that touches it: fetch/revalidate/paginate, optimistic-send bookkeeping and
// author-profile patching. Extracted verbatim from stores/chat.ts.
export function useMessageCache(deps: MessageCacheDeps) {
    const { activeChannelId, activeDMUser, setActiveDMLastMessage } = deps;

    // LRU per-channel message cache (stale-while-revalidate).
    // Keyed by channelId. Insertion order encodes recency: the most recently
    // touched channel is re-inserted at the end, so the first key is the LRU
    // eviction candidate. The active channel is never evicted.
    const MAX_CACHED_CHANNELS = 15;
    // Arranque en frío: hidratar desde localStorage para tener algo que pintar
    // antes de que resuelva cualquier request (ver persistedCache.ts).
    // v2: v1 podía persistir ecos optimistas (pending/failed) sin resolver —
    // al recargar quedaban zombis para siempre, sin ningún nonce vivo en
    // pendingSends que los reconcilie. Se sube la versión para descartar
    // cualquier cache v1 arrastrado por una instalación anterior.
    const messageCache = ref<Map<string, ChatMessage[]>>(
        new Map(hydrateCache<Array<[string, ChatMessage[]]>>(MESSAGE_CACHE_KEY, 2) ?? [])
    );

    // Tamaño de página de mensajes (debe coincidir con el clamp del backend).
    const PAGE_SIZE = 50;

    // Tope de mensajes en memoria por canal, aplicado SOLO al paginar hacia
    // atrás (loadOlderMessages) para acotar el peor caso de un usuario que
    // scrollea mucho historial en una sesión larga. Generoso a propósito
    // (20 páginas de PAGE_SIZE): recortar por el extremo reciente deja un
    // "agujero" entre lo cacheado y el presente si el usuario luego vuelve a
    // bajar del todo (no hay loadNewerMessages para rellenarlo, solo
    // fetchMessages/revalidateMessages que traen la última página). Un límite
    // alto hace ese caso extremadamente infrecuente en uso normal.
    const MAX_MESSAGES_IN_MEMORY = 1000;

    // Persistir el cache de mensajes es debounced (no write-through): el
    // socket puede mutarlo varias veces por segundo y esto es una app de
    // escritorio, no un browser limitado por batería — perder los últimos
    // ~400ms ante un crash no importa porque todo revalida al reabrir.
    let persistMessagesTimer: ReturnType<typeof setTimeout> | null = null;
    const buildPersistEntries = (): Array<[string, ChatMessage[]]> => {
        // Solo la última página por canal: el historial más viejo paginado
        // no vale la pena persistir, igual se recarga con loadOlderMessages.
        // Los ecos optimistas (pending) o fallidos (failed) nunca se
        // persisten: pendingSends es memoria pura y se reinicia en cada
        // arranque, así que un pending hidratado jamás se reconciliaría.
        const entries: Array<[string, ChatMessage[]]> = [];
        messageCache.value.forEach((msgs, channelId) => {
            entries.push([channelId, msgs.filter(m => !m.pending && !m.failed).slice(-PAGE_SIZE)]);
        });
        return entries;
    };
    const schedulePersistMessages = () => {
        if (persistMessagesTimer) clearTimeout(persistMessagesTimer);
        persistMessagesTimer = setTimeout(() => {
            persistMessagesTimer = null;
            persistCache(MESSAGE_CACHE_KEY, 2, buildPersistEntries());
        }, 400);
    };
    // Persistencia inmediata (no debounced): usada cuando el cache acaba de
    // perder acceso a canales (comunidad eliminada/expulsión) y un write
    // pendiente del debounce podría resucitarlos en el próximo arranque.
    const persistNow = () => {
        if (persistMessagesTimer) {
            clearTimeout(persistMessagesTimer);
            persistMessagesTimer = null;
        }
        persistCache(MESSAGE_CACHE_KEY, 2, buildPersistEntries());
    };

    // Por canal: ¿quedan mensajes más antiguos por cargar? Una página está
    // "llena" (puede haber más) cuando el server devolvió exactamente PAGE_SIZE.
    const hasMoreOlder = ref<Map<string, boolean>>(new Map());
    const getHasMoreOlder = (channelId: string): boolean => {
        return hasMoreOlder.value.get(channelId) ?? false;
    };
    // Guard contra cargas concurrentes de páginas más antiguas (por canal).
    const loadingOlder = new Set<string>();

    // Envíos optimistas en vuelo, por clientNonce. Permite reconciliar (o marcar
    // como fallido) el eco local cuando llega el ack o el evento new_message.
    const pendingSends = new Map<string, { channelId: string }>();

    // Merges two message lists that are each already sorted ascending by
    // createdAt (the server returns pages that way and the cache keeps that
    // invariant) into one ascending list, deduplicating by id. When both lists
    // carry the same id the entry from `b` wins. Linear: each createdAt is
    // parsed exactly once instead of twice per comparison inside a sort.
    const mergeById = (a: ChatMessage[], b: ChatMessage[]): ChatMessage[] => {
        if (a.length === 0) return b.slice();
        if (b.length === 0) return a.slice();

        const idsInB = new Set<string>();
        for (const m of b) idsInB.add(m.id);

        const timesA = a.map(m => Date.parse(m.createdAt));
        const timesB = b.map(m => Date.parse(m.createdAt));

        const out: ChatMessage[] = [];
        let i = 0;
        let j = 0;
        while (i < a.length || j < b.length) {
            if (i < a.length && idsInB.has(a[i].id)) {
                // Superseded by the copy in `b`; it is emitted from there.
                i++;
                continue;
            }
            if (j >= b.length || (i < a.length && timesA[i] <= timesB[j])) {
                out.push(a[i]);
                i++;
            } else {
                out.push(b[j]);
                j++;
            }
        }
        return out;
    };

    // Un eco optimista en vuelo tiene id sintético (`pending-<nonce>`) que
    // nunca va a coincidir con el id real que asigna el servidor — el REST no
    // conoce el clientNonce, solo viaja por socket y no se persiste. Si se lo
    // deja pasar a un merge contra una página fresca del servidor, el mensaje
    // real y su eco quedan como dos entradas distintas (duplicado visible solo
    // para quien lo envió). Se excluye acá; su reconciliación la hace
    // exclusivamente el evento new_message o el timeout del ack.
    const withoutPendingEchoes = (list: ChatMessage[]): ChatMessage[] => list.filter(m => !m.pending);

    // The visible message list is derived from the active channel's cache entry.
    // When no channel is active (or it has no cache entry yet) the view is empty,
    // which replaces the previous imperative clearMessages() behavior.
    const messages = computed<ChatMessage[]>(() => {
        if (!activeChannelId.value) return [];
        return messageCache.value.get(activeChannelId.value) ?? [];
    });

    // Touch a channel as most-recently-used and enforce the LRU bound.
    // Never evicts the active channel.
    const touchCacheEntry = (channelId: string, entry: ChatMessage[]) => {
        messageCache.value.delete(channelId);
        messageCache.value.set(channelId, entry);

        if (messageCache.value.size > MAX_CACHED_CHANNELS) {
            for (const key of messageCache.value.keys()) {
                if (messageCache.value.size <= MAX_CACHED_CHANNELS) break;
                if (key === activeChannelId.value) continue;
                messageCache.value.delete(key);
            }
        }
        schedulePersistMessages();
    };

    // Canales cuya primera página de mensajes está en vuelo. Por-canal (no un
    // solo booleano) para que cambiar de canal mientras carga uno no borre el
    // loading del otro.
    const loadingChannels = ref(new Set<string>());
    const isLoadingHistory = computed(() =>
        !!activeChannelId.value && loadingChannels.value.has(activeChannelId.value)
    );

    // Author profile patches (username/avatar from `user_updated`) are applied
    // eagerly only to the ACTIVE channel's list. Every other cached list gets
    // them lazily the next time it is served, so a profile change costs O(one
    // list) instead of O(every cached message). `userPatchVersion` bumps on
    // each patch; a channel whose recorded version is behind re-applies the
    // latest patch of every user in one pass.
    const pendingUserPatches = new Map<string, { username: string; avatarUrl: string | null }>();
    let userPatchVersion = 0;
    const channelPatchVersion = new Map<string, number>();

    const applyUserPatchToList = (list: ChatMessage[], userId: string, patch: { username: string; avatarUrl: string | null }) => {
        for (const m of list) {
            if (m.userId === userId && m.user) {
                m.user.username = patch.username;
                m.user.avatarUrl = patch.avatarUrl;
            }
        }
    };

    const applyPendingUserPatches = (channelId: string, list: ChatMessage[]) => {
        if ((channelPatchVersion.get(channelId) ?? 0) === userPatchVersion) return;
        if (pendingUserPatches.size > 0) {
            for (const m of list) {
                if (!m.user) continue;
                const patch = pendingUserPatches.get(m.userId);
                if (patch) {
                    m.user.username = patch.username;
                    m.user.avatarUrl = patch.avatarUrl;
                }
            }
        }
        channelPatchVersion.set(channelId, userPatchVersion);
    };

    // Called from the `user_updated` socket handler: registers the patch for
    // every cached list and applies it eagerly to the active one.
    const applyUserUpdate = (userId: string, patch: { username: string; avatarUrl: string | null }) => {
        pendingUserPatches.set(userId, patch);
        userPatchVersion++;
        const activeList = activeChannelId.value ? messageCache.value.get(activeChannelId.value) : undefined;
        if (activeList) {
            applyUserPatchToList(activeList, userId, patch);
            channelPatchVersion.set(activeChannelId.value, userPatchVersion);
        }
    };

    // Apply a freshly-fetched message list to the cache and the DM preview.
    const applyFetchedMessages = (channelId: string, data: ChatMessage[]) => {
        // Freshly fetched rows already carry current author data, and any
        // older rows merged in were patched when the channel was served.
        channelPatchVersion.set(channelId, userPatchVersion);
        touchCacheEntry(channelId, data);

        // Update last message preview from fetched messages (active DM only)
        if (data.length > 0 && activeDMUser.value && channelId === activeChannelId.value) {
            const lastMsg = data[data.length - 1];
            const authStore2 = useAuthStore();
            setActiveDMLastMessage({
                content: lastMsg.content,
                isMine: lastMsg.userId === authStore2.user?.id,
                createdAt: lastMsg.createdAt
            });
        }
    };

    // Stale-while-revalidate: if the channel is already cached, serve it
    // immediately (the computed `messages` reflects it as soon as the channel is
    // active) and refresh in the background. On a cache miss, show the loading
    // state and await the fetch.
    const fetchMessages = async (channelId: string) => {
        const authStore = useAuthStore();
        if (!authStore.token) return;

        const cached = messageCache.value.get(channelId);

        if (cached) {
            // Cache hit: keep the entry warm and revalidate detached.
            applyPendingUserPatches(channelId, cached);
            touchCacheEntry(channelId, cached);
            void revalidateMessages(channelId);
            return;
        }

        loadingChannels.value.add(channelId);
        try {
            // Página más reciente: el server ya devuelve orden ascendente.
            const response = await api.get(`/channels/${channelId}/messages?limit=${PAGE_SIZE}`);
            const data = response.data as ChatMessage[];
            if (import.meta.env.DEV) console.log('[FETCH] messages received:', channelId, data.length);
            // Re-leer el cache DESPUÉS del await: un envío optimista pudo haberse
            // agregado mientras esta primera página estaba en vuelo. Sin este merge,
            // el fetch reemplazaría el array entero y borraría ese eco.
            const existing = withoutPendingEchoes(messageCache.value.get(channelId) ?? []);
            applyFetchedMessages(channelId, existing.length ? mergeById(existing, data) : data);
            hasMoreOlder.value.set(channelId, data.length === PAGE_SIZE);
        } catch (error: any) {
            console.error('[FETCH] Error:', error.response?.status, error);
        } finally {
            loadingChannels.value.delete(channelId);
        }
    };

    // Background refresh for an already-cached channel. Errors keep the stale
    // entry intact and are only logged. La página más reciente se FUSIONA con lo
    // cacheado (no se reemplaza) para no descartar páginas más antiguas ya
    // cargadas ni resetear el scroll.
    const revalidateMessages = async (channelId: string) => {
        try {
            const response = await api.get(`/channels/${channelId}/messages?limit=${PAGE_SIZE}`);
            const data = response.data as ChatMessage[];
            const existing = withoutPendingEchoes(messageCache.value.get(channelId) ?? []);
            const merged = mergeById(existing, data);
            applyFetchedMessages(channelId, merged);
            // Solo se reevalúa hasMoreOlder cuando no había nada cacheado; si ya
            // hay páginas antiguas cargadas, la página reciente no informa sobre ellas.
            if (existing.length === 0) {
                hasMoreOlder.value.set(channelId, data.length === PAGE_SIZE);
            }
        } catch (error: any) {
            console.error('[REVALIDATE] Error:', error.response?.status, error);
        }
    };

    // Carga la página de mensajes inmediatamente anterior a la más antigua
    // cacheada. Devuelve cuántos mensajes se antepusieron (el caller lo usa para
    // restaurar el scroll). Retorna 0 si no hay más, ya está cargando, o falla.
    const loadOlderMessages = async (channelId: string): Promise<number> => {
        if (!getHasMoreOlder(channelId)) return 0;
        if (loadingOlder.has(channelId)) return 0;

        const cached = messageCache.value.get(channelId);
        if (!cached || cached.length === 0) return 0;
        const oldestId = cached[0].id;

        loadingOlder.add(channelId);
        try {
            const response = await api.get(
                `/channels/${channelId}/messages?before=${oldestId}&limit=${PAGE_SIZE}`
            );
            const data = response.data as ChatMessage[];

            const current = withoutPendingEchoes(messageCache.value.get(channelId) ?? []);
            const merged = mergeById(data, current);
            const prepended = merged.length - current.length;
            // `merged` está ascendente (más viejo -> más nuevo, ver mergeById):
            // el índice 0 es el mensaje más viejo, que es justo el que el
            // usuario acaba de pedir viendo. Si excede el tope, se recorta por
            // el extremo MÁS RECIENTE (el final del array) para conservar
            // siempre lo que el usuario está mirando ahora; lo recortado hacia
            // el presente puede volver a pedirse (fetch/revalidate) si hace falta.
            // `prepended` se calcula ANTES de recortar: cuenta mensajes viejos
            // realmente agregados al frente y no lo afecta un recorte del final.
            const capped = merged.length > MAX_MESSAGES_IN_MEMORY
                ? merged.slice(0, MAX_MESSAGES_IN_MEMORY)
                : merged;
            touchCacheEntry(channelId, capped);
            hasMoreOlder.value.set(channelId, data.length === PAGE_SIZE);
            return prepended;
        } catch (error: any) {
            console.error('[LOAD_OLDER] Error:', error.response?.status, error);
            return 0;
        } finally {
            loadingOlder.delete(channelId);
        }
    };

    // Adds a locally-sent optimistic echo to a channel's cache entry.
    const addOptimisticMessage = (channelId: string, message: ChatMessage) => {
        const cached = messageCache.value.get(channelId);
        if (cached) cached.push(message);
        else touchCacheEntry(channelId, [message]);
    };

    const registerPendingSend = (nonce: string, channelId: string) => {
        pendingSends.set(nonce, { channelId });
    };
    const isPendingSend = (nonce: string): boolean => pendingSends.has(nonce);

    // Un envío que ni siquiera obtuvo un ack a tiempo (desconexión, etc.):
    // apaga el "pending" del eco y lo marca como fallido.
    const markSendFailed = (nonce: string) => {
        const pend = pendingSends.get(nonce);
        if (!pend) return; // ya reconciliado por new_message
        pendingSends.delete(nonce);
        const msg = messageCache.value.get(pend.channelId)?.find(m => m.id === `pending-${nonce}`);
        if (msg) {
            msg.pending = false;
            msg.failed = true;
        }
    };

    // Applies an incoming `new_message` socket event to the cache: swaps the
    // optimistic echo for the real message (or appends it if unknown), guarded
    // against redelivery duplicates. DM/unread side effects are handled
    // separately (see dms.handleIncomingMessage).
    const applyIncomingMessage = (message: ChatMessage & { clientNonce?: string }) => {
        const cached = messageCache.value.get(message.channelId);

        if (cached) {
            // One scan resolves both questions: is the real id already
            // present (redelivery), and where is the optimistic echo.
            const pendingId = message.clientNonce ? `pending-${message.clientNonce}` : null;
            let realIndex = -1;
            let echoIndex = -1;
            for (let k = 0; k < cached.length; k++) {
                const id = cached[k].id;
                if (id === message.id) realIndex = k;
                else if (pendingId !== null && id === pendingId) echoIndex = k;
                if (realIndex !== -1 && (pendingId === null || echoIndex !== -1)) break;
            }

            if (echoIndex !== -1) {
                // Own send confirmed: swap the optimistic echo for the real
                // message in place (keeps position/scroll). Late acks that
                // already failed by timeout are healed here too.
                if (realIndex !== -1) cached.splice(echoIndex, 1);
                else cached.splice(echoIndex, 1, message);
            } else if (realIndex === -1) {
                // Guard by id so a redelivered event never duplicates.
                cached.push(message);
            }
        }
        if (message.clientNonce) pendingSends.delete(message.clientNonce);
    };

    const applyMessageUpdated = (message: ChatMessage) => {
        const cached = messageCache.value.get(message.channelId);
        if (!cached) return;
        const index = cached.findIndex(m => m.id === message.id);
        if (index !== -1) {
            cached[index] = message;
        }
    };

    const applyMessageDeleted = (data: { messageId: string; channelId: string }) => {
        const cached = messageCache.value.get(data.channelId);
        if (!cached) return;
        const next = cached.filter(m => m.id !== data.messageId);
        touchCacheEntry(data.channelId, next);
    };

    // Used by the `community_updated` handler when the active channel just
    // disappeared: drops only the message cache entry (matches the original
    // behavior — hasMoreOlder/channelPatchVersion are intentionally left, this
    // is a lighter cleanup than `purgeChannels`).
    const deleteChannelCache = (channelId: string) => {
        messageCache.value.delete(channelId);
    };

    // Used when a community is removed/left/deleted: drops full cache state for
    // the given channel ids (or clears everything when the channel set is
    // unknown) — permission hygiene so stale entries can't leak after access
    // is revoked.
    const purgeChannels = (channelIds: string[] | null) => {
        if (channelIds) {
            for (const id of channelIds) {
                messageCache.value.delete(id);
                hasMoreOlder.value.delete(id);
                channelPatchVersion.delete(id);
            }
        } else {
            messageCache.value.clear();
        }
    };

    // Wipe every piece of cache state (memory and persisted) so nothing from
    // one account survives into the next login on the same machine.
    const reset = () => {
        if (persistMessagesTimer) {
            clearTimeout(persistMessagesTimer);
            persistMessagesTimer = null;
        }
        pendingSends.clear();
        loadingOlder.clear();

        messageCache.value.clear();
        hasMoreOlder.value.clear();
        loadingChannels.value.clear();
        pendingUserPatches.clear();
        channelPatchVersion.clear();
        userPatchVersion = 0;

        clearPersistedCache(MESSAGE_CACHE_KEY);
    };

    return {
        messageCache,
        messages,
        hasMoreOlder,
        getHasMoreOlder,
        isLoadingHistory,
        fetchMessages,
        revalidateMessages,
        loadOlderMessages,
        addOptimisticMessage,
        registerPendingSend,
        isPendingSend,
        markSendFailed,
        applyIncomingMessage,
        applyMessageUpdated,
        applyMessageDeleted,
        applyUserUpdate,
        deleteChannelCache,
        purgeChannels,
        schedulePersistMessages,
        persistNow,
        reset,
    };
}

export type ChatMessageCache = ReturnType<typeof useMessageCache>;
