import type { Ref } from 'vue';
import type { Socket } from 'socket.io-client';
import { useAuthStore } from '../auth';
import { useFriendsStore } from '../friends';
import { useCommunityStore } from '../community';
import { useVoiceStore } from '../voice';
import router from '../../router';
import { resetSessionState } from '../../composables/useSessionReset';
import { dialog } from '../../composables/useDialog';
import type { ChatMessage } from './types';
import type { ChatMessageCache } from './messageCache';
import type { ChatDMState } from './dms';

export interface ChatSocketContext {
    activeChannelId: Ref<string>;
    cache: ChatMessageCache;
    dms: ChatDMState;
    leaveChannel: () => void;
}

// Removes a community's local state after the user lost access to it (left,
// kicked, banned, or the community itself was deleted). Shared by
// `community_deleted` and `removed_from_community`.
function handleCommunityRemoved(communityId: string, notice: string, ctx: ChatSocketContext) {
    const communityStore = useCommunityStore();
    const wasActive = communityStore.activeCommunityId === communityId;
    // Collect this community's channel ids BEFORE the store drops it.
    const community = communityStore.communities.find(c => c.id === communityId);
    const channelIds = community
        ? community.categories.flatMap(cat => cat.channels.map(ch => ch.id))
        : null;
    communityStore.removeCommunityLocally(communityId);
    // Permission hygiene: drop the cached messages of the channels that were
    // just lost so stale entries cannot leak after access is revoked. DMs and
    // other communities stay warm. If the community object was already gone
    // (unknown channel set) fall back to a full clear.
    ctx.cache.purgeChannels(channelIds);
    // Persisted copy is rewritten immediately (not debounced) so a pending
    // write from before the removal can't resurrect it on next launch.
    ctx.cache.persistNow();
    if (wasActive) {
        ctx.leaveChannel();
        void dialog.alert({ message: notice });
    }
}

// Registers every `socket.on(...)` handler that used to live inside
// stores/chat.ts's connectSocket(). Called once per socket instance (i.e.
// once per connectSocket() call), delegating to messageCache/dms and to the
// other stores exactly as before. Other stores are resolved lazily (useXStore()
// called inside each handler body) to stay safe against import cycles, same
// as the pre-split code.
export function registerChatSocketHandlers(socket: Socket, ctx: ChatSocketContext): void {
    const { activeChannelId, cache, dms, leaveChannel } = ctx;

    // Scoped to this socket instance: a fresh connectSocket() call starts
    // over, so the first 'connect' of a new instance is never a re-join.
    let hasConnectedBefore = false;

    socket.on('connect', () => {
        console.log('🔗 Conectado al servidor de Sockets de Nexo', socket.id);

        if (hasConnectedBefore) {
            // Every reconnection arrives with a brand-new socket id and the
            // server only puts a socket in a channel room on 'join_channel'.
            // Without re-joining, the open channel silently stops receiving
            // new_message / user_typing / message_updated until the user
            // switches channels. Revalidate to fill the gap missed offline
            // and refresh DM conversations to recover unread counters.
            const channelId = activeChannelId.value;
            if (channelId) {
                socket.emit('join_channel', channelId);
                void cache.revalidateMessages(channelId);
            }
            void dms.fetchDMConversations();
        }
        hasConnectedBefore = true;
    });

    socket.on('connect_error', (error) => {
        console.error('❌ Error de conexión al socket:', error.message);

        // socket.io-client stops retrying (active === false) when the server
        // middleware rejected the handshake, e.g. an expired or invalid JWT.
        // Left alone the UI would look alive with nothing arriving in real
        // time; treat it like a REST 401 and send the user back to login.
        if (!socket.active) {
            resetSessionState();
            useAuthStore().removeToken();
            router.push('/login');
        }
    });

    socket.on('new_message', (message: ChatMessage & { clientNonce?: string }) => {
        if (import.meta.env.DEV) console.log('[SOCKET] new_message:', message.channelId, message.id);
        cache.applyIncomingMessage(message);
        dms.handleIncomingMessage(message);
    });

    // Notificación SIN contenido de un mensaje nuevo en un canal de comunidad.
    // Llega a todos los miembros (sala community:<id>) para alimentar el
    // contador de no leídos sin filtrar el contenido del mensaje.
    socket.on('channel_unread', (data: { channelId: string; communityId: string; senderId: string }) => {
        const authStore = useAuthStore();
        if (data.channelId === activeChannelId.value) return; // viéndolo: no contar
        if (data.senderId === authStore.user?.id) return; // mensaje propio: no contar en otras pestañas
        const communityStore = useCommunityStore();
        communityStore.incrementChannelUnread(data.channelId);
    });

    socket.on('friend_status', (data: { userId: string; status: string }) => {
        console.log('[SOCKET] friend_status:', data);
        const friendsStore = useFriendsStore();
        friendsStore.updateFriendStatus(data.userId, data.status);

        // Reflejar el estado en las conversaciones DM (incluye partners que no son amigos)
        // y en el DM activo si corresponde.
        dms.updateFriendStatusInConversations(data.userId, data.status);
    });

    socket.on('my_status', (data: { status: string }) => {
        console.log('[SOCKET] my_status:', data);
        const authStore = useAuthStore();
        if (authStore.user) {
            authStore.user.status = data.status;
        }
    });

    // Un usuario cambió su perfil (nombre/avatar y campos enriquecidos):
    // actualizar todo lo que esté en pantalla.
    socket.on('user_updated', (data: {
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

        // Message authors: patch the visible (active) list now; every
        // other cached list is patched lazily when it is next served.
        cache.applyUserUpdate(u.id, { username: u.username, avatarUrl: u.avatarUrl });

        // Mi propio usuario (cambio hecho desde otra sesión)
        const authStore = useAuthStore();
        if (authStore.user?.id === u.id) {
            authStore.user.username = u.username;
            authStore.user.avatarUrl = u.avatarUrl;
            applyRichFields(authStore.user);
        }

        // Lista de amigos
        const friendsStore = useFriendsStore();
        const friend = friendsStore.friends.find(f => f.id === u.id);
        if (friend) {
            friend.username = u.username;
            friend.avatarUrl = u.avatarUrl;
        }

        // Conversación DM activa y conversaciones DM en la lista.
        dms.applyUserUpdateToConversations(u, applyRichFields);

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

    socket.on('message_updated', (message: ChatMessage) => {
        cache.applyMessageUpdated(message);
    });

    socket.on('message_deleted', (data: { messageId: string; channelId: string }) => {
        cache.applyMessageDeleted(data);
    });

    socket.on('user_typing', (data: { channelId: string; userId: string; username: string }) => {
        const authStore = useAuthStore();
        if (data.channelId !== activeChannelId.value) return;
        if (data.userId === authStore.user?.id) return;
        dms.noteTyping(data.userId, data.username);
    });

    // La estructura de la comunidad cambió (canales, roles, nombre...) -> refrescar
    socket.on('community_updated', async (_data: { communityId: string }) => {
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
                cache.deleteChannelCache(goneChannelId);
                cache.schedulePersistMessages();
            }
        }
    });

    socket.on('community_deleted', (data: { communityId: string }) => {
        handleCommunityRemoved(data.communityId, 'La comunidad fue eliminada por su dueño.', ctx);
    });

    socket.on('removed_from_community', (data: { communityId: string; reason: 'kick' | 'ban' | 'deleted' }) => {
        const messagesByReason: Record<string, string> = {
            kick: 'Has sido expulsado de la comunidad.',
            ban: 'Has sido baneado de la comunidad.',
            deleted: 'La comunidad ya no existe.'
        };
        handleCommunityRemoved(data.communityId, messagesByReason[data.reason] ?? 'Ya no perteneces a esta comunidad.', ctx);
    });

    // ===================== Social event listeners =====================

    socket.on('friend_request_received', (payload: {
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

    socket.on('friend_request_accepted', (payload: {
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
    socket.on('friend_request_rejected', (_payload: { friendshipId: string }) => {
        // Intentionally empty: outgoing requests are not tracked in friendsStore
    });

    socket.on('friend_removed', (payload: { userId: string }) => {
        const friendsStore = useFriendsStore();
        friendsStore.removeFriendLocally(payload.userId);
    });

    socket.on('dm_created', (payload: {
        conversationId: string;
        channelId: string;
        friend: { id: string; username: string; tag: string; avatarUrl: string | null; status: string };
    }) => {
        dms.addDMConversationIfMissing(payload.channelId, payload.friend);
    });

    socket.on('member_joined', (payload: {
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
    socket.on('member_unbanned', (_payload: { communityId: string }) => {
        // Intentionally empty: unbanned user client receives event but needs no store update
    });
}
