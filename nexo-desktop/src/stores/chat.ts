import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from './auth';
import { useCommunityStore } from './community';
import { useMessageCache } from './chat/messageCache';
import { useDMState } from './chat/dms';
import { useAttachments } from './chat/attachments';
import { registerChatSocketHandlers } from './chat/socketHandlers';
import type { ChatMessage, MessageAttachment } from './chat/types';

// Re-exported wholesale so existing imports like
// `import type { MessageAttachment } from '../stores/chat'` keep working
// unchanged after the split (see stores/chat/types.ts).
export type { ChatMessage, MessageAttachment, PendingAttachment, DMFriend, LastMessage, DMConversation } from './chat/types';

// Environment-based URLs
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

export const useChatStore = defineStore('chat', () => {
    const socket = shallowRef<Socket | null>(null);
    const activeChannelId = ref<string>('');
    const shouldShowFriends = ref(false);
    // Vista del panel de inicio (sin comunidad ni DM activos): la lista de
    // amigos (HomeMain) o la vista dedicada de solicitudes (FriendRequests).
    const homeView = ref<'friends' | 'requests'>('friends');

    // `cache` is referenced here before its own declaration below — safe
    // because this callback is only invoked later (from dms.activateDM/openDM),
    // by which point `cache` has been assigned.
    const dms = useDMState({
        activeChannelId,
        homeView,
        shouldShowFriends,
        socket,
        fetchMessages: (channelId: string) => cache.fetchMessages(channelId),
    });

    const cache = useMessageCache({
        activeChannelId,
        activeDMUser: dms.activeDMUser,
        setActiveDMLastMessage: dms.setActiveDMLastMessage,
    });

    const attachments = useAttachments();

    let lastTypingEmit = 0;

    const leaveChannel = () => {
        if (!socket.value || !activeChannelId.value) return;
        socket.value.emit('leave_channel', activeChannelId.value);
        activeChannelId.value = '';
        dms.clearTyping();
    };

    const joinChannel = (channelId: string) => {
        if (!socket.value) return;

        if (activeChannelId.value && activeChannelId.value !== channelId) {
            socket.value.emit('leave_channel', activeChannelId.value);
        }

        activeChannelId.value = channelId;
        dms.clearTyping();
        // Salir de la vista de solicitudes al entrar a un canal de comunidad.
        homeView.value = 'friends';
        socket.value.emit('join_channel', channelId);

        // Marcar como leído al abrir el canal (cubre la navegación programática).
        useCommunityStore().clearChannelUnread(channelId);
    };

    const sendMessage = (content: string, messageAttachments?: Array<{
        objectKey: string;
        cdnUrl: string;
        name: string;
        size: number;
        mimeType: string;
        type: string;
    }>) => {
        if (!socket.value || !activeChannelId.value) return;
        if (!content.trim() && (!messageAttachments || messageAttachments.length === 0)) return;

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
                attachments: (messageAttachments ?? []).map((a, i) => ({
                    id: `pending-${clientNonce}-att-${i}`,
                    type: (['image', 'video', 'audio', 'file'].includes(a.type) ? a.type : 'file') as MessageAttachment['type'],
                    url: a.cdnUrl,
                    name: a.name,
                    size: a.size,
                    mimeType: a.mimeType,
                })),
                user: { id: me.id, username: me.username, avatarUrl: me.avatarUrl, status: me.status },
            };
            cache.addOptimisticMessage(channelId, optimistic);
            cache.registerPendingSend(clientNonce, channelId);
        }

        socket.value.timeout(10000).emit(
            'send_message',
            { channelId, content: content.trim(), attachments: messageAttachments || [], clientNonce },
            (err: Error | null, res?: { ok: boolean }) => {
                if (!cache.isPendingSend(clientNonce)) return; // ya reconciliado por new_message
                if (err || !res?.ok) cache.markSendFailed(clientNonce);
                // res.ok === true: no hacer nada — el evento new_message hace el swap.
            }
        );

        // Update last message for active DM
        dms.setActiveDMLastMessage({
            content: content.trim(),
            isMine: true,
            createdAt: new Date().toISOString()
        });
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

        registerChatSocketHandlers(socket.value, {
            activeChannelId,
            cache,
            dms,
            leaveChannel,
        });
    };

    const disconnectSocket = () => {
        if (socket.value) {
            socket.value.disconnect();
            socket.value = null;
        }
    };

    // Wipe every piece of per-user state (memory and persisted) so nothing
    // from one account survives into the next login on the same machine.
    // Disconnects the socket first so no late event repopulates the maps.
    const reset = () => {
        disconnectSocket();

        cache.reset();
        dms.reset();
        lastTypingEmit = 0;

        activeChannelId.value = '';
        shouldShowFriends.value = false;
        homeView.value = 'friends';

        attachments.reset();
    };

    return {
        reset,
        socket,
        messages: cache.messages,
        activeChannelId,
        activeDMUser: dms.activeDMUser,
        conversations: dms.conversations,
        isLoadingHistory: cache.isLoadingHistory,
        shouldShowFriends,
        homeView,
        unreadCounts: dms.unreadCounts,
        lastMessages: dms.lastMessages,
        typingUsers: dms.typingUsers,
        getUnreadCount: dms.getUnreadCount,
        getLastMessage: dms.getLastMessage,
        clearUnread: dms.clearUnread,
        fetchMessages: cache.fetchMessages,
        loadOlderMessages: cache.loadOlderMessages,
        hasMoreOlder: cache.hasMoreOlder,
        getHasMoreOlder: cache.getHasMoreOlder,
        fetchDMConversations: dms.fetchDMConversations,
        connectSocket,
        leaveChannel,
        joinChannel,
        sendMessage,
        editMessage,
        deleteMessage,
        emitTyping,
        disconnectSocket,
        openDM: dms.openDM,
        closeDM: dms.closeDM,
        closeDMAndGoToFriends: dms.closeDMAndGoToFriends,
        goToRequests: dms.goToRequests,
        hideConversation: dms.hideConversation,
        pendingAttachments: attachments.pendingAttachments,
        uploadFile: attachments.uploadFile,
        removePendingAttachment: attachments.removePendingAttachment,
        clearCompletedAttachments: attachments.clearCompletedAttachments
    };
});
