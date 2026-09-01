import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './auth';
import { useFriendsStore } from './friends';
import { useCommunityStore } from './community';
import { useVoiceStore } from './voice';
import api from '../api/axios';
import { hydrateCache, persistCache, MESSAGE_CACHE_KEY } from '../composables/persistedCache';

export interface MessageAttachment {
    id: string;
    type: 'image' | 'video' | 'audio' | 'file';
    url: string;
    name?: string;
    size?: number;        // bytes
    width?: number;       // for images/videos
    height?: number;      // for images/videos
    duration?: number;    // seconds, for audio/video
    mimeType?: string;
}

export interface PendingAttachment {
    id: string;
    file: File;
    type: 'image' | 'video' | 'audio' | 'file';
    status: 'pending' | 'uploading' | 'completed' | 'error';
    uploadUrl?: string;
    objectKey?: string;
    cdnUrl?: string;
    error?: string;
    // Object URL local para previsualizar antes de subir (solo image/video).
    // Se crea una vez al agregar el adjunto y se reutiliza en todos los
    // estados (pending/uploading/completed) — nunca se recrea en cada
    // render. Debe revocarse explícitamente (removePendingAttachment /
    // clearCompletedAttachments) para no filtrar memoria.
    previewUrl?: string;
}

export interface ChatMessage {
    id: string;
    content: string;
    userId: string;
    channelId: string;
    createdAt: string;
    isEdited?: boolean;
    attachments?: MessageAttachment[];
    user?: {
        id: string;
        username: string;
        avatarUrl: string | null;
        status: string;
        roleColor?: string | null;
    };
    // Frontend-only: set on a message's local optimistic echo before the
    // server confirms it. Server-sourced messages never set these.
    pending?: boolean;
    failed?: boolean;
}

export interface DMFriend {
    id: string;
    username: string;
    tag: string;
    avatarUrl: string | null;
    status: string;
    // Rich profile fields (optional — patched live by `user_updated`).
    bio?: string | null;
    bannerUrl?: string | null;
    bannerColor?: string | null;
    accentColor?: string | null;
    pronouns?: string | null;
    customStatus?: string | null;
}

export interface LastMessage {
    content: string;
    isMine: boolean;
    createdAt: string;
}

export interface DMConversation {
    channelId: string;
    friend: DMFriend;
}

// Environment-based URLs
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';
const UPLOAD_URL = import.meta.env.VITE_UPLOAD_URL || 'https://nexo-upload-worker.devk.workers.dev';

export const useChatStore = defineStore('chat', () => {
    const socket = ref<Socket | null>(null);
    const activeChannelId = ref<string>('');

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
    const schedulePersistMessages = () => {
        if (persistMessagesTimer) clearTimeout(persistMessagesTimer);
        persistMessagesTimer = setTimeout(() => {
            persistMessagesTimer = null;
            // Solo la última página por canal: el historial más viejo paginado
            // no vale la pena persistir, igual se recarga con loadOlderMessages.
            // Los ecos optimistas (pending) o fallidos (failed) nunca se
            // persisten: pendingSends es memoria pura y se reinicia en cada
            // arranque, así que un pending hidratado jamás se reconciliaría.
            const entries: Array<[string, ChatMessage[]]> = [];
            messageCache.value.forEach((msgs, channelId) => {
                entries.push([channelId, msgs.filter(m => !m.pending && !m.failed).slice(-PAGE_SIZE)]);
            });
            persistCache(MESSAGE_CACHE_KEY, 2, entries);
        }, 400);
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

    // Une dos listas de mensajes deduplicando por id y ordenando por createdAt asc.
    const mergeById = (a: ChatMessage[], b: ChatMessage[]): ChatMessage[] => {
        const byId = new Map<string, ChatMessage>();
        for (const m of a) byId.set(m.id, m);
        for (const m of b) byId.set(m.id, m);
        return Array.from(byId.values()).sort(
            (x, y) => new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime()
        );
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
    const activeDMUser = ref<DMFriend | null>(null);
    // Canales cuya primera página de mensajes está en vuelo. Por-canal (no un
    // solo booleano) para que cambiar de canal mientras carga uno no borre el
    // loading del otro.
    const loadingChannels = ref(new Set<string>());
    const isLoadingHistory = computed(() =>
        !!activeChannelId.value && loadingChannels.value.has(activeChannelId.value)
    );
    const shouldShowFriends = ref(false);
    // Vista del panel de inicio (sin comunidad ni DM activos): la lista de
    // amigos (HomeMain) o la vista dedicada de solicitudes (FriendRequests).
    const homeView = ref<'friends' | 'requests'>('friends');
    
    // Fuente de verdad de la lista de DMs (desacoplada del array de amigos):
    // cada entrada referencia el canal y el otro participante.
    const conversations = ref<DMConversation[]>([]);
    // DM tracking: friendId -> channelId
    const dmChannels = ref<Map<string, string>>(new Map());
    // Reverse: channelId -> friendId
    const channelToFriend = ref<Map<string, string>>(new Map());
    // Unread counts: friendId -> count
    const unreadCounts = ref<Map<string, number>>(new Map());
    // Last messages: friendId -> LastMessage
    const lastMessages = ref<Map<string, LastMessage>>(new Map());

    // Usuarios escribiendo en el canal activo: userId -> username
    const typingUsers = ref<Map<string, string>>(new Map());
    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
    let lastTypingEmit = 0;
    // Evita refetches redundantes de la lista de DMs ante ráfagas de mensajes.
    let isResyncingConversations = false;

    const getUnreadCount = (friendId: string): number => {
        return unreadCounts.value.get(friendId) || 0;
    };

    const getLastMessage = (friendId: string): LastMessage | null => {
        return lastMessages.value.get(friendId) || null;
    };

    const clearUnread = (friendId: string) => {
        unreadCounts.value.set(friendId, 0);
    };

    // Apply a freshly-fetched message list to the cache and the DM preview.
    const applyFetchedMessages = (channelId: string, data: ChatMessage[]) => {
        touchCacheEntry(channelId, data);

        // Update last message preview from fetched messages (active DM only)
        if (data.length > 0 && activeDMUser.value && channelId === activeChannelId.value) {
            const lastMsg = data[data.length - 1];
            const authStore2 = useAuthStore();
            lastMessages.value.set(activeDMUser.value.id, {
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
            touchCacheEntry(channelId, cached);
            void revalidateMessages(channelId);
            return;
        }

        console.log('[FETCH] Obteniendo mensajes para canal:', channelId);
        loadingChannels.value.add(channelId);
        try {
            // Página más reciente: el server ya devuelve orden ascendente.
            const response = await api.get(`/channels/${channelId}/messages?limit=${PAGE_SIZE}`);
            console.log('[FETCH] Status:', response.status);
            const data = response.data as ChatMessage[];
            console.log('[FETCH] Mensajes recibidos:', data.length, data);
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

    const connectSocket = () => {
        const authStore = useAuthStore();

        if (!authStore.token) {
            console.error('Cannot connect to socket: No auth token');
            return;
        }

        socket.value = io(SOCKET_URL, {
            auth: {
                token: authStore.token
            }
        });

        socket.value.on('connect', () => {
            console.log('🔗 Conectado al servidor de Sockets de Nexo', socket.value?.id);
        });

        socket.value.on('connect_error', (error) => {
            console.error('❌ Error de conexión al socket:', error.message);
        });

        socket.value.on('new_message', (message: ChatMessage & { clientNonce?: string }) => {
            console.log('[SOCKET] new_message recibido:', message);
            const authStore2 = useAuthStore();

            // Append to the channel's cache entry if we have one (active or not).
            // The computed `messages` reflects this for the active channel.
            const cached = messageCache.value.get(message.channelId);

            if (message.clientNonce) {
                // Propio envío confirmado: reemplazar el eco optimista por el
                // mensaje real (in-place, para no mover su posición/scroll).
                // Late acks que ya fallaron por timeout también se curan acá.
                pendingSends.delete(message.clientNonce);
                if (cached) {
                    const i = cached.findIndex(m => m.id === `pending-${message.clientNonce}`);
                    if (i !== -1) {
                        if (cached.some(m => m.id === message.id)) cached.splice(i, 1);
                        else cached.splice(i, 1, message);
                    }
                }
            }

            // Guard by id so a redelivered event (or one already merged above)
            // never duplicates a message.
            if (cached && !cached.some(m => m.id === message.id)) {
                cached.push(message);
            }

            if (message.channelId === activeChannelId.value) {
                // Update last message if this is the active DM
                if (activeDMUser.value) {
                    lastMessages.value.set(activeDMUser.value.id, {
                        content: message.content,
                        isMine: message.userId === authStore2.user?.id,
                        createdAt: message.createdAt
                    });
                }
            } else {
                // Check if this message is from a DM channel we know
                const friendId = channelToFriend.value.get(message.channelId);

                // Only count messages authored by the other participant. The
                // sender also receives the event in their own user room (DM
                // delivery is per-participant), so guarding on the author keeps
                // a user's own messages from inflating unread on other tabs.
                if (friendId && message.userId !== authStore2.user?.id) {
                    // Increment unread if we're not in this DM
                    const current = unreadCounts.value.get(friendId) || 0;
                    unreadCounts.value.set(friendId, current + 1);

                    // Update last message
                    lastMessages.value.set(friendId, {
                        content: message.content,
                        isMine: false,
                        createdAt: message.createdAt
                    });
                }

                // Un new_message en un canal no activo siempre es un DM (los
                // mensajes de comunidad solo llegan al canal abierto). Si no está
                // en la lista, el backend acaba de remostrarlo (estaba oculto):
                // resincronizar para que reaparezca, incluso tras recargar cuando
                // channelToFriend aún no tiene la entrada.
                const inList = conversations.value.some(c => c.channelId === message.channelId);
                if (!inList && !isResyncingConversations) {
                    isResyncingConversations = true;
                    void fetchDMConversations().finally(() => {
                        isResyncingConversations = false;
                    });
                }
                console.log('[SOCKET] Mensaje en canal no activo');
            }
        });

        // Notificación SIN contenido de un mensaje nuevo en un canal de comunidad.
        // Llega a todos los miembros (sala community:<id>) para alimentar el
        // contador de no leídos sin filtrar el contenido del mensaje.
        socket.value.on('channel_unread', (data: { channelId: string; communityId: string; senderId: string }) => {
            if (data.channelId === activeChannelId.value) return; // viéndolo: no contar
            if (data.senderId === authStore.user?.id) return; // mensaje propio: no contar en otras pestañas
            const communityStore = useCommunityStore();
            communityStore.incrementChannelUnread(data.channelId);
        });

        socket.value.on('friend_status', (data: { userId: string; status: string }) => {
            console.log('[SOCKET] friend_status:', data);
            const friendsStore = useFriendsStore();
            friendsStore.updateFriendStatus(data.userId, data.status);

            // Reflejar el estado en las conversaciones DM (incluye partners que no son amigos)
            conversations.value.forEach(conv => {
                if (conv.friend.id === data.userId) {
                    conv.friend.status = data.status;
                }
            });

            // Reflejar el estado en el DM activo si corresponde
            if (activeDMUser.value?.id === data.userId) {
                activeDMUser.value.status = data.status;
            }
        });

        socket.value.on('my_status', (data: { status: string }) => {
            console.log('[SOCKET] my_status:', data);
            if (authStore.user) {
                authStore.user.status = data.status;
            }
        });

        // Un usuario cambió su perfil (nombre/avatar y campos enriquecidos):
        // actualizar todo lo que esté en pantalla.
        socket.value.on('user_updated', (data: {
            user: {
                id: string;
                username: string;
                tag: string;
                avatarUrl: string | null;
                bio?: string | null;
                bannerUrl?: string | null;
                bannerColor?: string | null;
                accentColor?: string | null;
                pronouns?: string | null;
                customStatus?: string | null;
            };
        }) => {
            const u = data.user;

            // Aplica los campos enriquecidos del perfil a un destino que los
            // soporta (auth user, DMFriend). Solo escribe los que vinieron en el
            // evento para no pisar datos con `undefined`.
            const applyRichFields = (target: {
                bio?: string | null;
                bannerUrl?: string | null;
                bannerColor?: string | null;
                accentColor?: string | null;
                pronouns?: string | null;
                customStatus?: string | null;
            }) => {
                if ('bio' in u) target.bio = u.bio;
                if ('bannerUrl' in u) target.bannerUrl = u.bannerUrl;
                if ('bannerColor' in u) target.bannerColor = u.bannerColor;
                if ('accentColor' in u) target.accentColor = u.accentColor;
                if ('pronouns' in u) target.pronouns = u.pronouns;
                if ('customStatus' in u) target.customStatus = u.customStatus;
            };

            // Autores de los mensajes cargados (en todos los canales cacheados)
            messageCache.value.forEach(list => {
                list.forEach(m => {
                    if (m.userId === u.id && m.user) {
                        m.user.username = u.username;
                        m.user.avatarUrl = u.avatarUrl;
                    }
                });
            });

            // Mi propio usuario (cambio hecho desde otra sesión)
            const authStore2 = useAuthStore();
            if (authStore2.user?.id === u.id) {
                authStore2.user.username = u.username;
                authStore2.user.avatarUrl = u.avatarUrl;
                applyRichFields(authStore2.user);
            }

            // Lista de amigos
            const friendsStore = useFriendsStore();
            const friend = friendsStore.friends.find(f => f.id === u.id);
            if (friend) {
                friend.username = u.username;
                friend.avatarUrl = u.avatarUrl;
            }

            // Conversación DM activa
            if (activeDMUser.value?.id === u.id) {
                activeDMUser.value.username = u.username;
                activeDMUser.value.avatarUrl = u.avatarUrl;
                applyRichFields(activeDMUser.value);
            }

            // Conversaciones DM en la lista (también refresca tarjetas abiertas)
            conversations.value.forEach(conv => {
                if (conv.friend.id === u.id) {
                    conv.friend.username = u.username;
                    conv.friend.avatarUrl = u.avatarUrl;
                    applyRichFields(conv.friend);
                }
            });

            // Miembros de la comunidad activa (lista de miembros y colores)
            const communityStore = useCommunityStore();
            const member = communityStore.activeMembers.find(m => m.userId === u.id);
            if (member) {
                member.user.username = u.username;
                member.user.avatarUrl = u.avatarUrl;
            }

            // Participantes en canales de voz
            const voiceStore = useVoiceStore();
            Object.values(voiceStore.voiceStates).forEach(participants => {
                participants.forEach(p => {
                    if (p.userId === u.id) {
                        p.username = u.username;
                        p.avatarUrl = u.avatarUrl;
                    }
                });
            });
        });

        socket.value.on('message_updated', (message: ChatMessage) => {
            const cached = messageCache.value.get(message.channelId);
            if (!cached) return;
            const index = cached.findIndex(m => m.id === message.id);
            if (index !== -1) {
                cached[index] = message;
            }
        });

        socket.value.on('message_deleted', (data: { messageId: string; channelId: string }) => {
            const cached = messageCache.value.get(data.channelId);
            if (!cached) return;
            const next = cached.filter(m => m.id !== data.messageId);
            touchCacheEntry(data.channelId, next);
        });

        socket.value.on('user_typing', (data: { channelId: string; userId: string; username: string }) => {
            const authStore2 = useAuthStore();
            if (data.channelId !== activeChannelId.value) return;
            if (data.userId === authStore2.user?.id) return;

            typingUsers.value.set(data.userId, data.username);
            // Re-disparar la expiración de este usuario
            const existingTimer = typingTimers.get(data.userId);
            if (existingTimer) clearTimeout(existingTimer);
            typingTimers.set(data.userId, setTimeout(() => {
                typingUsers.value.delete(data.userId);
                typingTimers.delete(data.userId);
            }, 3000));
        });

        // La estructura de la comunidad cambió (canales, roles, nombre...) -> refrescar
        socket.value.on('community_updated', async (_data: { communityId: string }) => {
            const communityStore = useCommunityStore();
            await communityStore.fetchCommunities();

            // Si el canal activo ya no existe, limpiar la vista
            if (communityStore.activeCommunityId && communityStore.activeChannelId) {
                const community = communityStore.communities.find(c => c.id === communityStore.activeCommunityId);
                const stillExists = community?.categories.some(cat =>
                    cat.channels.some(ch => ch.id === communityStore.activeChannelId)
                );
                if (!stillExists) {
                    const goneChannelId = communityStore.activeChannelId;
                    leaveChannel();
                    communityStore.setActiveChannel('');
                    messageCache.value.delete(goneChannelId);
                    schedulePersistMessages();
                }
            }
        });

        socket.value.on('community_deleted', (data: { communityId: string }) => {
            handleCommunityRemoved(data.communityId, 'La comunidad fue eliminada por su dueño.');
        });

        socket.value.on('removed_from_community', (data: { communityId: string; reason: 'kick' | 'ban' | 'deleted' }) => {
            const messagesByReason: Record<string, string> = {
                kick: 'Has sido expulsado de la comunidad.',
                ban: 'Has sido baneado de la comunidad.',
                deleted: 'La comunidad ya no existe.'
            };
            handleCommunityRemoved(data.communityId, messagesByReason[data.reason] ?? 'Ya no perteneces a esta comunidad.');
        });

        // ===================== Social event listeners =====================

        socket.value.on('friend_request_received', (payload: {
            id: string;
            senderId: string;
            receiverId: string;
            status: string;
            sender: { id: string; username: string; tag: string; avatarUrl: string | null; status: string };
        }) => {
            const friendsStore = useFriendsStore();
            friendsStore.addPendingRequest({
                id: payload.id,
                senderId: payload.senderId,
                receiverId: payload.receiverId,
                status: payload.status,
                createdAt: new Date().toISOString(),
                sender: payload.sender
            });
        });

        socket.value.on('friend_request_accepted', (payload: {
            friendshipId: string;
            friend: { id: string; username: string; tag: string; avatarUrl: string | null; status: string };
        }) => {
            const friendsStore = useFriendsStore();
            friendsStore.addFriend(payload.friend);
            friendsStore.pendingRequests = friendsStore.pendingRequests.filter(
                r => r.id !== payload.friendshipId
            );
        });

        // friend_request_rejected: no-op — no outgoing-request state tracked on the frontend
        socket.value.on('friend_request_rejected', (_payload: { friendshipId: string }) => {
            // Intentionally empty: outgoing requests are not tracked in friendsStore
        });

        socket.value.on('friend_removed', (payload: { userId: string }) => {
            const friendsStore = useFriendsStore();
            friendsStore.removeFriendLocally(payload.userId);
        });

        socket.value.on('dm_created', (payload: {
            conversationId: string;
            channelId: string;
            friend: { id: string; username: string; tag: string; avatarUrl: string | null; status: string };
        }) => {
            dmChannels.value.set(payload.friend.id, payload.channelId);
            channelToFriend.value.set(payload.channelId, payload.friend.id);

            // Reflejar el nuevo DM en la lista si todavía no está presente
            if (!conversations.value.some(c => c.channelId === payload.channelId)) {
                conversations.value.push({ channelId: payload.channelId, friend: payload.friend });
            }
        });

        socket.value.on('member_joined', (payload: {
            communityId: string;
            member: {
                userId: string;
                username: string;
                tag: string;
                avatarUrl: string | null;
                roles: Array<{ id: string; name: string; color: string; position: number }>;
                isOwner: boolean;
            };
        }) => {
            const communityStore = useCommunityStore();
            communityStore.addActiveMember(payload.communityId, {
                id: payload.member.userId,
                userId: payload.member.userId,
                joinedAt: new Date().toISOString(),
                isOwner: payload.member.isOwner,
                user: {
                    id: payload.member.userId,
                    username: payload.member.username,
                    tag: payload.member.tag,
                    avatarUrl: payload.member.avatarUrl,
                    status: 'online'
                },
                roles: payload.member.roles.map(r => ({
                    ...r,
                    communityId: payload.communityId,
                    permissions: 0
                }))
            });
        });

        // member_unbanned: no-op — informational event, no store mutation required
        socket.value.on('member_unbanned', (_payload: { communityId: string }) => {
            // Intentionally empty: unbanned user client receives event but needs no store update
        });
    };

    const handleCommunityRemoved = (communityId: string, notice: string) => {
        const communityStore = useCommunityStore();
        const wasActive = communityStore.activeCommunityId === communityId;
        communityStore.removeCommunityLocally(communityId);
        // Permission hygiene: drop all cached messages when leaving/losing a
        // community so stale entries cannot leak after access is revoked.
        // Persisted copy is wiped immediately (not debounced) so a pending
        // write from before the clear can't resurrect it on next launch.
        messageCache.value.clear();
        if (persistMessagesTimer) {
            clearTimeout(persistMessagesTimer);
            persistMessagesTimer = null;
        }
        persistCache(MESSAGE_CACHE_KEY, 2, []);
        if (wasActive) {
            leaveChannel();
            alert(notice);
        }
    };

    const clearTyping = () => {
        typingUsers.value.clear();
        typingTimers.forEach(t => clearTimeout(t));
        typingTimers.clear();
    };

    const leaveChannel = () => {
        if (!socket.value || !activeChannelId.value) return;
        socket.value.emit('leave_channel', activeChannelId.value);
        activeChannelId.value = '';
        clearTyping();
    };

    const joinChannel = (channelId: string) => {
        if (!socket.value) return;

        if (activeChannelId.value && activeChannelId.value !== channelId) {
            socket.value.emit('leave_channel', activeChannelId.value);
        }

        activeChannelId.value = channelId;
        clearTyping();
        // Salir de la vista de solicitudes al entrar a un canal de comunidad.
        homeView.value = 'friends';
        socket.value.emit('join_channel', channelId);

        // Marcar como leído al abrir el canal (cubre la navegación programática).
        useCommunityStore().clearChannelUnread(channelId);
    };

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

    const sendMessage = (content: string, attachments?: Array<{
        objectKey: string;
        cdnUrl: string;
        name: string;
        size: number;
        mimeType: string;
        type: string;
    }>) => {
        if (!socket.value || !activeChannelId.value) return;
        if (!content.trim() && (!attachments || attachments.length === 0)) return;

        const channelId = activeChannelId.value; // capturado ya: puede cambiar de canal antes del ack
        const me = useAuthStore().user;
        const clientNonce = crypto.randomUUID();

        if (me) {
            // Eco optimista: aparece de inmediato, se reconcilia con el mensaje
            // real (o se marca fallido) cuando responde el servidor.
            const optimistic: ChatMessage = {
                id: `pending-${clientNonce}`,
                content: content.trim(),
                userId: me.id,
                channelId,
                createdAt: new Date().toISOString(),
                pending: true,
                attachments: (attachments ?? []).map((a, i) => ({
                    id: `pending-${clientNonce}-att-${i}`,
                    type: (['image', 'video', 'audio', 'file'].includes(a.type) ? a.type : 'file') as MessageAttachment['type'],
                    url: a.cdnUrl,
                    name: a.name,
                    size: a.size,
                    mimeType: a.mimeType,
                })),
                user: { id: me.id, username: me.username, avatarUrl: me.avatarUrl, status: me.status },
            };
            const cached = messageCache.value.get(channelId);
            if (cached) cached.push(optimistic);
            else touchCacheEntry(channelId, [optimistic]);
            pendingSends.set(clientNonce, { channelId });
        }

        socket.value.timeout(10000).emit(
            'send_message',
            { channelId, content: content.trim(), attachments: attachments || [], clientNonce },
            (err: Error | null, res?: { ok: boolean }) => {
                if (!pendingSends.has(clientNonce)) return; // ya reconciliado por new_message
                if (err || !res?.ok) markSendFailed(clientNonce);
                // res.ok === true: no hacer nada — el evento new_message hace el swap.
            }
        );

        // Update last message for active DM
        if (activeDMUser.value) {
            lastMessages.value.set(activeDMUser.value.id, {
                content: content.trim(),
                isMine: true,
                createdAt: new Date().toISOString()
            });
        }
    };

    // Editar un mensaje propio
    const editMessage = (messageId: string, content: string) => {
        if (!socket.value || !content.trim()) return;
        socket.value.emit('edit_message', { messageId, content: content.trim() });
    };

    // Eliminar un mensaje (propio o con permiso de moderación)
    const deleteMessage = (messageId: string) => {
        if (!socket.value) return;
        socket.value.emit('delete_message', { messageId });
    };

    // Avisar que estoy escribiendo (con throttle de 2s)
    const emitTyping = () => {
        if (!socket.value || !activeChannelId.value) return;
        const now = Date.now();
        if (now - lastTypingEmit < 2000) return;
        lastTypingEmit = now;
        socket.value.emit('typing', { channelId: activeChannelId.value });
    };

    const disconnectSocket = () => {
        if (socket.value) {
            socket.value.disconnect();
            socket.value = null;
        }
    };

    const fetchDMConversations = async () => {
        try {
            const response = await api.get('/friends/dm/conversations');

            if (response.status === 200) {
                const data = response.data;
                console.log('[FETCH] Conversaciones DM received:', data);

                // La respuesta del backend es la fuente de verdad de la lista de DMs.
                const nextConversations: DMConversation[] = [];

                data.forEach((conv: any) => {
                    const friendId = conv.friend.id;
                    const channelId = conv.channelId;

                    dmChannels.value.set(friendId, channelId);
                    channelToFriend.value.set(channelId, friendId);

                    nextConversations.push({ channelId, friend: conv.friend });

                    // Use lastUnreadMessage as preview if there are unreads, otherwise use lastMessage
                    const previewMessage = conv.unreadCount > 0 && conv.lastUnreadMessage
                        ? conv.lastUnreadMessage
                        : conv.lastMessage;

                    if (previewMessage) {
                        lastMessages.value.set(friendId, {
                            content: previewMessage.content,
                            isMine: previewMessage.isMine,
                            createdAt: previewMessage.createdAt
                        });
                    }

                    // Set unread count from backend
                    if (conv.unreadCount > 0) {
                        unreadCounts.value.set(friendId, conv.unreadCount);
                    }
                });

                conversations.value = nextConversations;
            }
        } catch (error: any) {
            console.error('[FETCH] Error fetching DM conversations:', error.response?.status, error);
        }
    };

    // Trabajo común a ambas rutas de openDM: cambia el canal activo, une el
    // socket y dispara la carga de mensajes (ya cache-aware vía fetchMessages).
    const activateDM = (friend: DMFriend, channelId: string) => {
        clearUnread(friend.id);
        homeView.value = 'friends';
        activeDMUser.value = friend;

        // Abrir un DM siempre saca de la vista de comunidad activa — si no se
        // limpia, el Dashboard sigue mostrando el sidebar/layout de esa
        // comunidad encima del DM (p. ej. al abrir un DM desde el perfil de
        // un miembro dentro de una comunidad).
        const communityStore = useCommunityStore();
        communityStore.activeCommunityId = '';

        if (activeChannelId.value && activeChannelId.value !== channelId) {
            leaveChannel();
        }

        activeChannelId.value = channelId;
        if (socket.value) {
            socket.value.emit('join_channel', channelId);
        }

        void fetchMessages(channelId);
    };

    const openDM = async (friend: DMFriend) => {
        const authStore2 = useAuthStore();
        if (!authStore2.token) return;

        // Canal ya conocido (p. ej. un DM que ya está en el sidebar): activar
        // de inmediato sin esperar red. El POST igual se dispara en segundo
        // plano solo por su efecto de "des-ocultar" el DM en el backend si el
        // usuario lo había cerrado antes — no bloquea la UI.
        const knownChannelId = dmChannels.value.get(friend.id);
        if (knownChannelId) {
            activateDM(friend, knownChannelId);
            api.post(`/friends/dm/${friend.id}`).catch(error => {
                console.error('[OPENDM] Error re-sincronizando DM:', error.response?.status, error);
            });
            return;
        }

        try {
            const response = await api.post(`/friends/dm/${friend.id}`);
            const data = response.data;

            dmChannels.value.set(friend.id, data.channelId);
            channelToFriend.value.set(data.channelId, friend.id);

            if (!conversations.value.some(c => c.channelId === data.channelId)) {
                conversations.value.push({ channelId: data.channelId, friend });
            }

            activateDM(friend, data.channelId);
        } catch (error: any) {
            console.error('[OPENDM] Error:', error.response?.status, error);
        }
    };

    const closeDM = () => {
        if (activeChannelId.value && socket.value) {
            socket.value.emit('leave_channel', activeChannelId.value);
        }
        activeChannelId.value = '';
        activeDMUser.value = null;
        shouldShowFriends.value = false;
        // DM cache is kept warm for instant re-open (stale-while-revalidate).
    };

    const closeDMAndGoToFriends = () => {
        homeView.value = 'friends';
        shouldShowFriends.value = true;
        closeDM();
    };

    // Abrir la vista dedicada de solicitudes de amistad desde el sidebar.
    const goToRequests = () => {
        homeView.value = 'requests';
        closeDM();
    };

    // Ocultar una conversación DM solo para el usuario actual (persistente en backend).
    // Reaparece cuando llega un nuevo mensaje (el backend resetea los flags).
    const hideConversation = async (channelId: string) => {
        try {
            await api.patch(`/friends/dm/conversations/${channelId}/hide`);
            conversations.value = conversations.value.filter(c => c.channelId !== channelId);

            // Si era la conversación activa, cerrarla
            if (activeChannelId.value === channelId) {
                closeDM();
            }
        } catch (error: any) {
            console.error('[HIDE] Error ocultando conversación:', error.response?.status, error);
        }
    };

    // Pending attachments for upload
    const pendingAttachments = ref<PendingAttachment[]>([]);

    // Mutates an attachment through the reactive array (by id) instead of a
    // detached object reference, so Vue's Proxy set trap actually fires and
    // the UI (MessageInput's v-for, canSend) picks up the change. Mutating a
    // raw closure variable after push() is invisible to Vue's reactivity.
    function updateAttachment(id: string, patch: Partial<PendingAttachment>) {
        const target = pendingAttachments.value.find(a => a.id === id);
        if (target) Object.assign(target, patch);
    }

    async function uploadFile(file: File): Promise<PendingAttachment> {
        const id = crypto.randomUUID();
        const type = getFileType(file);

        const attachment: PendingAttachment = {
            id,
            file,
            type,
            status: 'pending',
            // Solo image/video muestran <img>/<video src>; audio y file
            // genéricos no usan previewUrl, así que no vale la pena crear
            // (y tener que revocar) un object URL para ellos.
            previewUrl: (type === 'image' || type === 'video') ? URL.createObjectURL(file) : undefined
        };

        pendingAttachments.value.push(attachment);

        try {
            // Request presigned URL from upload worker
            const authStore = useAuthStore();
            const response = await fetch(`${UPLOAD_URL}/api/upload/presign`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-ID': authStore.user?.id ?? ''
                },
                body: JSON.stringify({
                    fileName: file.name,
                    fileSize: file.size,
                    mimeType: file.type
                })
            });

            if (!response.ok) {
                const message = await response.json().then(body => body.error).catch(() => null);
                updateAttachment(id, { status: 'error', error: message ?? 'Failed to get upload URL' });
                throw new Error(message ?? 'Failed to get upload URL');
            }

            const { uploadUrl, objectKey, cdnUrl } = await response.json();
            updateAttachment(id, { uploadUrl, objectKey, cdnUrl, status: 'uploading' });

            // Upload file directly to presigned URL
            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                body: file,
                headers: {
                    'Content-Type': file.type
                }
            });

            if (!uploadResponse.ok) {
                updateAttachment(id, { status: 'error', error: 'Upload failed' });
                throw new Error('Upload failed');
            }

            updateAttachment(id, { status: 'completed' });
            return attachment;
        } catch (error) {
            // A network-level failure (e.g. the upload worker unreachable) throws
            // before either branch above runs, leaving the attachment stuck at
            // 'pending'/'uploading' forever with no error surfaced. Catch-all so
            // the UI always resolves to a visible state instead of hanging.
            const current = pendingAttachments.value.find(a => a.id === id);
            if (current && current.status !== 'error') {
                updateAttachment(id, { status: 'error', error: 'Network error while uploading' });
            }
            throw error;
        }
    }

    function getFileType(file: File): 'image' | 'video' | 'audio' | 'file' {
        if (file.type.startsWith('image/')) return 'image';
        if (file.type.startsWith('video/')) return 'video';
        if (file.type.startsWith('audio/')) return 'audio';
        return 'file';
    }

    function removePendingAttachment(id: string) {
        const index = pendingAttachments.value.findIndex(a => a.id === id);
        if (index !== -1) {
            const [removed] = pendingAttachments.value.splice(index, 1);
            if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
        }
    }

    function clearCompletedAttachments() {
        for (const a of pendingAttachments.value) {
            if (a.status === 'completed' && a.previewUrl) URL.revokeObjectURL(a.previewUrl);
        }
        pendingAttachments.value = pendingAttachments.value.filter(a => a.status !== 'completed');
    }

    return {
        socket,
        messages,
        activeChannelId,
        activeDMUser,
        conversations,
        isLoadingHistory,
        shouldShowFriends,
        homeView,
        unreadCounts,
        lastMessages,
        typingUsers,
        getUnreadCount,
        getLastMessage,
        clearUnread,
        fetchMessages,
        loadOlderMessages,
        hasMoreOlder,
        getHasMoreOlder,
        fetchDMConversations,
        connectSocket,
        leaveChannel,
        joinChannel,
        sendMessage,
        editMessage,
        deleteMessage,
        emitTyping,
        disconnectSocket,
        openDM,
        closeDM,
        closeDMAndGoToFriends,
        goToRequests,
        hideConversation,
        pendingAttachments,
        uploadFile,
        removePendingAttachment,
        clearCompletedAttachments
    };
});
