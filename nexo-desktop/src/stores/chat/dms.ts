import { ref, type Ref } from 'vue';
import type { Socket } from 'socket.io-client';
import { useAuthStore } from '../auth';
import { useCommunityStore } from '../community';
import api from '../../api/axios';
import type { ChatMessage, DMConversation, DMFriend, LastMessage } from './types';

export interface DMStateDeps {
    activeChannelId: Ref<string>;
    homeView: Ref<'friends' | 'requests'>;
    shouldShowFriends: Ref<boolean>;
    socket: Ref<Socket | null>;
    fetchMessages: (channelId: string) => Promise<void>;
}

// DM conversation list, unread/preview state and typing indicators.
// Extracted verbatim from stores/chat.ts.
export function useDMState(deps: DMStateDeps) {
    const { activeChannelId, homeView, shouldShowFriends, socket, fetchMessages } = deps;

    const activeDMUser = ref<DMFriend | null>(null);

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

    const clearTyping = () => {
        typingUsers.value.clear();
        typingTimers.forEach(t => clearTimeout(t));
        typingTimers.clear();
    };

    // Called from the `user_typing` socket handler (channel/DM-agnostic —
    // gated by activeChannelId there).
    const noteTyping = (userId: string, username: string) => {
        typingUsers.value.set(userId, username);
        // Re-disparar la expiración de este usuario
        const existingTimer = typingTimers.get(userId);
        if (existingTimer) clearTimeout(existingTimer);
        typingTimers.set(userId, setTimeout(() => {
            typingUsers.value.delete(userId);
            typingTimers.delete(userId);
        }, 3000));
    };

    // Sets the preview for the currently-open DM (no-op if none is open).
    const setActiveDMLastMessage = (entry: LastMessage) => {
        if (activeDMUser.value) {
            lastMessages.value.set(activeDMUser.value.id, entry);
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
            // Equivalent to chat.ts's leaveChannel() for the OLD channel: the
            // immediate `activeChannelId.value = channelId` right below makes
            // leaveChannel's own activeChannelId reset a no-op here, so only
            // the socket leave + typing clear matter.
            if (socket.value) socket.value.emit('leave_channel', activeChannelId.value);
            clearTyping();
        }

        activeChannelId.value = channelId;
        if (socket.value) {
            socket.value.emit('join_channel', channelId);
        }

        void fetchMessages(channelId);
    };

    // Bumped on every openDM call. A cache-miss POST that resolves after a
    // newer openDM (any friend) must not activate its now-stale DM on top.
    let openDMSeq = 0;

    const openDM = async (friend: DMFriend) => {
        const authStore2 = useAuthStore();
        if (!authStore2.token) return;
        const seq = ++openDMSeq;

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

            // The mapping is still valid knowledge even if the user moved on.
            dmChannels.value.set(friend.id, data.channelId);
            channelToFriend.value.set(data.channelId, friend.id);

            if (!conversations.value.some(c => c.channelId === data.channelId)) {
                conversations.value.push({ channelId: data.channelId, friend });
            }

            // Superseded by a newer openDM while this request was in flight.
            if (seq !== openDMSeq) return;

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

    // Called from the `new_message` socket handler for the DM/unread side of
    // things (the cache splice itself is messageCache.applyIncomingMessage).
    const handleIncomingMessage = (message: ChatMessage & { clientNonce?: string }) => {
        const authStore2 = useAuthStore();

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
        }
    };

    // `friend_status` socket handler: reflect status on DM conversations/active DM.
    const updateFriendStatusInConversations = (userId: string, status: string) => {
        conversations.value.forEach(conv => {
            if (conv.friend.id === userId) {
                conv.friend.status = status;
            }
        });
        if (activeDMUser.value?.id === userId) {
            activeDMUser.value.status = status;
        }
    };

    // `user_updated` socket handler: patch active DM + DM list entries.
    const applyUserUpdateToConversations = (
        u: { id: string; username: string; avatarUrl: string | null },
        applyRichFields: (target: {
            bio?: string | null;
            bannerUrl?: string | null;
            bannerColor?: string | null;
            accentColor?: string | null;
            pronouns?: string | null;
            customStatus?: string | null;
        }) => void
    ) => {
        if (activeDMUser.value?.id === u.id) {
            activeDMUser.value.username = u.username;
            activeDMUser.value.avatarUrl = u.avatarUrl;
            applyRichFields(activeDMUser.value);
        }

        conversations.value.forEach(conv => {
            if (conv.friend.id === u.id) {
                conv.friend.username = u.username;
                conv.friend.avatarUrl = u.avatarUrl;
                applyRichFields(conv.friend);
            }
        });
    };

    // `dm_created` socket handler.
    const addDMConversationIfMissing = (channelId: string, friend: DMFriend) => {
        dmChannels.value.set(friend.id, channelId);
        channelToFriend.value.set(channelId, friend.id);

        if (!conversations.value.some(c => c.channelId === channelId)) {
            conversations.value.push({ channelId, friend });
        }
    };

    // Clear all per-user DM state (memory only — DMs are not persisted).
    const reset = () => {
        clearTyping();
        isResyncingConversations = false;

        conversations.value = [];
        dmChannels.value.clear();
        channelToFriend.value.clear();
        unreadCounts.value.clear();
        lastMessages.value.clear();
        activeDMUser.value = null;
    };

    return {
        activeDMUser,
        conversations,
        dmChannels,
        channelToFriend,
        unreadCounts,
        lastMessages,
        typingUsers,
        getUnreadCount,
        getLastMessage,
        clearUnread,
        clearTyping,
        noteTyping,
        setActiveDMLastMessage,
        fetchDMConversations,
        activateDM,
        openDM,
        closeDM,
        closeDMAndGoToFriends,
        goToRequests,
        hideConversation,
        handleIncomingMessage,
        updateFriendStatusInConversations,
        applyUserUpdateToConversations,
        addDMConversationIfMissing,
        reset,
    };
}

export type ChatDMState = ReturnType<typeof useDMState>;
