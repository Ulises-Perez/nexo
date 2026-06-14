import { Server } from 'socket.io';
import { socketAuth, AuthenticatedSocket } from '../middlewares/socketAuth';
import { prisma } from '../db/prisma';
import { Permissions, getMemberContext, hasPermission, getCommunityIdOfChannel } from '../lib/permissions';
import {
    addVoiceParticipant,
    removeVoiceParticipant,
    getVoiceParticipants,
    findVoiceChannelOfSocket,
    setParticipantMuted,
    getVoiceStates,
} from './voiceState';

const userSockets = new Map<string, Set<string>>();

// Sanitización básica de contenido para prevenir XSS
function sanitizeContent(content: string): string {
    if (!content) return '';
    return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

// Verificar si el usuario es miembro de la comunidad del canal
async function isUserMemberOfChannel(userId: string, channelId: string): Promise<boolean> {
    try {
        const channel = await prisma.channel.findUnique({
            where: { id: channelId },
            include: {
                category: {
                    include: {
                        community: {
                            include: {
                                members: {
                                    where: { userId }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!channel) return false;

        // Es un canal DM: solo los dos participantes de la conversación pueden acceder
        if (channel.type === 'dm') {
            const conversation = await prisma.conversation.findUnique({
                where: { channelId },
                select: { userAId: true, userBId: true }
            });
            if (!conversation) return false;
            return conversation.userAId === userId || conversation.userBId === userId;
        }

        // Verificar si es miembro de la comunidad
        return channel.category?.community?.members?.some(m => m.userId === userId) ?? false;
    } catch {
        return false;
    }
}

const updateUserStatus = async (userId: string, status: string) => {
    await prisma.user.update({
        where: { id: userId },
        data: { status },
    });
};

const getFriendsOfUser = async (userId: string): Promise<string[]> => {
    const friendships = await prisma.friendship.findMany({
        where: {
            OR: [{ userAId: userId }, { userBId: userId }],
        },
    });
    return friendships.map(f => f.userAId === userId ? f.userBId : f.userAId);
};

// IDs de los usuarios con los que se comparte una conversación DM
const getDMPartnersOfUser = async (userId: string): Promise<string[]> => {
    const conversations = await prisma.conversation.findMany({
        where: {
            OR: [{ userAId: userId }, { userBId: userId }],
        },
        select: { userAId: true, userBId: true },
    });
    return conversations.map(c => c.userAId === userId ? c.userBId : c.userAId);
};

// Notifica el cambio de estado (online/offline) a amigos y a partners de DM.
// Los partners de DM se deduplican contra los amigos ya notificados para no
// emitir el evento dos veces al mismo usuario.
const emitStatusToFriends = async (io: Server, userId: string, status: string) => {
    const [friendIds, dmPartnerIds] = await Promise.all([
        getFriendsOfUser(userId),
        getDMPartnersOfUser(userId),
    ]);

    const notified = new Set<string>();
    [...friendIds, ...dmPartnerIds].forEach(contactId => {
        if (notified.has(contactId)) return;
        notified.add(contactId);
        io.to(`user:${contactId}`).emit('friend_status', { userId, status });
    });
};

const getCommunityIdsOfUser = async (userId: string): Promise<string[]> => {
    const memberships = await prisma.communityMember.findMany({
        where: { userId },
        select: { communityId: true },
    });
    return memberships.map(m => m.communityId);
};

// Route a message event to the right realtime audience.
// DM channels deliver to both participants' personal rooms (`user:<id>`) so the
// message arrives even when the recipient does not have the conversation open;
// the recipient only joins a channel room while actively viewing it. Community
// channels keep broadcasting to the channel room as before.
const emitToChannelMembers = async (io: Server, channelId: string, event: string, payload: unknown) => {
    const conversation = await prisma.conversation.findUnique({
        where: { channelId },
        select: { userAId: true, userBId: true },
    });
    if (conversation) {
        io.to(`user:${conversation.userAId}`).emit(event, payload);
        io.to(`user:${conversation.userBId}`).emit(event, payload);
        return;
    }
    io.to(channelId).emit(event, payload);
};

// Entrega un mensaje NUEVO al público correcto. En DMs va a las salas
// personales de ambos participantes. En canales de comunidad, el contenido va
// a la sala del canal (quienes lo están viendo) y, además, se notifica a toda
// la comunidad con un evento SIN contenido (`channel_unread`) para que los
// miembros que NO tienen el canal abierto incrementen su contador de no leídos.
const deliverNewMessage = async (io: Server, channelId: string, message: unknown, senderId: string) => {
    const conversation = await prisma.conversation.findUnique({
        where: { channelId },
        select: { userAId: true, userBId: true },
    });
    if (conversation) {
        io.to(`user:${conversation.userAId}`).emit('new_message', message);
        io.to(`user:${conversation.userBId}`).emit('new_message', message);
        return;
    }
    // Canal de comunidad: el contenido va a la sala del canal (quienes lo
    // están viendo); además se notifica a toda la comunidad para que los
    // miembros que NO lo tienen abierto incrementen su contador de no leídos.
    // Se incluye senderId para que el autor no sume no leídos en sus otras pestañas.
    io.to(channelId).emit('new_message', message);
    const communityId = await getCommunityIdOfChannel(channelId);
    if (communityId) {
        io.to(`community:${communityId}`).emit('channel_unread', { channelId, communityId, senderId });
    }
};

// Emite el estado actual de un canal de voz a la sala de su comunidad
const emitVoiceStateUpdate = async (io: Server, channelId: string) => {
    const communityId = await getCommunityIdOfChannel(channelId);
    if (!communityId) return;
    io.to(`community:${communityId}`).emit('voice_state_update', {
        channelId,
        participants: getVoiceParticipants(channelId),
    });
};

export const setupSockets = (io: Server) => {
    io.use(socketAuth as any);

    io.on('connection', async (socket) => {
        const authSocket = socket as AuthenticatedSocket;
        const userId = authSocket.data.userId;

        console.log(`[Socket.io] Usuario Conectado. Socket ID: ${socket.id} - User ID: ${userId}`);

        if (!userSockets.has(userId)) {
            userSockets.set(userId, new Set());
        }
        userSockets.get(userId)!.add(socket.id);

        if (userSockets.get(userId)!.size === 1) {
            await updateUserStatus(userId, 'online');
            await emitStatusToFriends(io, userId, 'online');
            console.log(`[Socket.io] User ${userId} está online`);
        }

        socket.join(`user:${userId}`);

        // Unirse a las salas de todas sus comunidades (para eventos en tiempo real)
        const communityIds = await getCommunityIdsOfUser(userId);
        communityIds.forEach(id => socket.join(`community:${id}`));

        // Datos básicos del usuario (para typing y voz)
        const me = await prisma.user.findUnique({
            where: { id: userId },
            select: { username: true, avatarUrl: true },
        });

        socket.emit('my_status', { status: 'online' });

        // El cliente lo emite tras crear o unirse a una comunidad
        socket.on('join_community_room', async (communityId: string) => {
            const ctx = await getMemberContext(userId, communityId);
            if (!ctx) return;
            socket.join(`community:${communityId}`);
        });

        socket.on('join_channel', async (channelId: string) => {
            // Verificar que el usuario tiene acceso al canal
            const hasAccess = await isUserMemberOfChannel(userId, channelId);
            if (!hasAccess) {
                console.log(`[Socket.io] User ${userId} intentó unirse a canal no autorizado: ${channelId}`);
                return;
            }
            socket.join(channelId);
            console.log(`[Socket.io] User ${userId} se unión al canal: ${channelId}`);
        });

        socket.on('leave_channel', (channelId: string) => {
            socket.leave(channelId);
            console.log(`[Socket.io] User ${userId} abandonó el canal: ${channelId}`);
        });

        socket.on('send_message', async (data: { channelId: string; content: string; attachments?: Array<{ objectKey: string; cdnUrl: string; name: string; size: number; mimeType: string; type: string }> }) => {
            try {
                const { channelId, content, attachments } = data;

                if (!channelId || (!content && (!attachments || attachments.length === 0))) {
                    console.log(`[Socket.io] send_message cancelado: datos vacíos`);
                    return;
                }

                // Verificar acceso al canal
                const hasAccess = await isUserMemberOfChannel(userId, channelId);
                if (!hasAccess) {
                    console.log(`[Socket.io] User ${userId} intentó enviar mensaje a canal no autorizado: ${channelId}`);
                    return;
                }

                const newMessage = await prisma.message.create({
                    data: {
                        content: sanitizeContent(content || ''),
                        channelId,
                        userId,
                        attachments: attachments && attachments.length > 0 ? {
                            create: attachments.map(att => ({
                                name: sanitizeContent(att.name),
                                size: att.size,
                                mimeType: att.mimeType,
                                url: att.cdnUrl,
                                type: att.type
                            }))
                        } : undefined
                    },
                    include: {
                        user: {
                            select: { id: true, username: true, avatarUrl: true, status: true }
                        },
                        attachments: true
                    }
                });

                // Si el canal es un DM, reaparece para quien lo hubiese ocultado.
                // updateMany es un no-op en canales de comunidad (ninguna Conversation coincide).
                await prisma.conversation.updateMany({
                    where: { channelId },
                    data: { hiddenForA: false, hiddenForB: false }
                });

                // El color de rol se resuelve en el cliente vía
                // communityStore.getMemberRoleColor; no se adjunta aquí
                // para evitar dos queries por mensaje en la ruta más caliente.
                await deliverNewMessage(io, channelId, newMessage, userId);

            } catch (error) {
                console.error('[Socket.io] Error guardando mensaje:', error);
            }
        });

        // Editar un mensaje propio
        socket.on('edit_message', async (data: { messageId: string; content: string }) => {
            try {
                const { messageId, content } = data;
                if (!messageId || !content || content.trim() === '') return;

                const message = await prisma.message.findUnique({ where: { id: messageId } });
                if (!message || message.userId !== userId) return;

                const updated = await prisma.message.update({
                    where: { id: messageId },
                    data: { content: sanitizeContent(content.trim()), isEdited: true },
                    include: {
                        user: {
                            select: { id: true, username: true, avatarUrl: true, status: true }
                        },
                        attachments: true
                    }
                });

                await emitToChannelMembers(io, message.channelId, 'message_updated', updated);
            } catch (error) {
                console.error('[Socket.io] Error editando mensaje:', error);
            }
        });

        // Eliminar un mensaje (autor, o moderador con MANAGE_MESSAGES en la comunidad)
        socket.on('delete_message', async (data: { messageId: string }) => {
            try {
                const { messageId } = data;
                if (!messageId) return;

                const message = await prisma.message.findUnique({ where: { id: messageId } });
                if (!message) return;

                if (message.userId !== userId) {
                    const communityId = await getCommunityIdOfChannel(message.channelId);
                    if (!communityId) return; // En DMs solo el autor puede borrar
                    const ctx = await getMemberContext(userId, communityId);
                    if (!hasPermission(ctx, Permissions.MANAGE_MESSAGES)) return;
                }

                await prisma.message.delete({ where: { id: messageId } });
                await emitToChannelMembers(io, message.channelId, 'message_deleted', { messageId, channelId: message.channelId });
            } catch (error) {
                console.error('[Socket.io] Error eliminando mensaje:', error);
            }
        });

        // Indicador de "escribiendo..."
        socket.on('typing', (data: { channelId: string }) => {
            if (!data?.channelId) return;
            socket.to(data.channelId).emit('user_typing', {
                channelId: data.channelId,
                userId,
                username: me?.username ?? 'Usuario',
            });
        });

        // ===================== Canales de Voz (señalización WebRTC) =====================

        const leaveVoice = async (notify = true) => {
            const channelId = findVoiceChannelOfSocket(socket.id);
            if (!channelId) return;

            removeVoiceParticipant(channelId, socket.id);
            socket.leave(`voice:${channelId}`);

            if (notify) {
                io.to(`voice:${channelId}`).emit('voice_peer_left', { socketId: socket.id, channelId });
                await emitVoiceStateUpdate(io, channelId);
            }
        };

        socket.on('join_voice', async (data: { channelId: string }) => {
            try {
                const { channelId } = data;
                if (!channelId) return;

                const channel = await prisma.channel.findUnique({ where: { id: channelId } });
                if (!channel || channel.type !== 'voice') return;

                const hasAccess = await isUserMemberOfChannel(userId, channelId);
                if (!hasAccess) return;

                // Si ya estaba en otro canal de voz, salir primero
                await leaveVoice();

                const existingPeers = getVoiceParticipants(channelId);

                addVoiceParticipant(channelId, {
                    socketId: socket.id,
                    userId,
                    username: me?.username ?? 'Usuario',
                    avatarUrl: me?.avatarUrl ?? null,
                    muted: false,
                });

                socket.join(`voice:${channelId}`);

                // El que entra recibe la lista de peers existentes (él inicia las ofertas WebRTC)
                socket.emit('voice_joined', { channelId, peers: existingPeers });

                // Los demás se enteran del nuevo peer (esperan su oferta)
                socket.to(`voice:${channelId}`).emit('voice_peer_joined', {
                    channelId,
                    peer: {
                        socketId: socket.id,
                        userId,
                        username: me?.username ?? 'Usuario',
                        avatarUrl: me?.avatarUrl ?? null,
                        muted: false,
                    }
                });

                await emitVoiceStateUpdate(io, channelId);
            } catch (error) {
                console.error('[Socket.io] Error en join_voice:', error);
            }
        });

        socket.on('leave_voice', async () => {
            await leaveVoice();
        });

        // Relay de señalización WebRTC (ofertas, respuestas y candidatos ICE)
        socket.on('voice_signal', (data: { to: string; signal: any }) => {
            if (!data?.to || !data?.signal) return;
            io.to(data.to).emit('voice_signal', {
                from: socket.id,
                userId,
                signal: data.signal,
            });
        });

        socket.on('voice_mute', async (data: { muted: boolean }) => {
            const channelId = findVoiceChannelOfSocket(socket.id);
            if (!channelId) return;
            setParticipantMuted(channelId, socket.id, !!data?.muted);
            await emitVoiceStateUpdate(io, channelId);
        });

        // El cliente pide el estado de voz de los canales de una comunidad
        socket.on('get_voice_states', (data: { channelIds: string[] }, callback?: (states: any) => void) => {
            if (!Array.isArray(data?.channelIds)) return;
            const states = getVoiceStates(data.channelIds);
            if (typeof callback === 'function') {
                callback(states);
            } else {
                socket.emit('voice_states', states);
            }
        });

        socket.on('disconnect', async () => {
            console.log(`[Socket.io] Usuario Desconectado. Socket ID: ${socket.id} - User ID: ${userId}`);

            await leaveVoice();

            userSockets.get(userId)?.delete(socket.id);

            if (userSockets.get(userId)?.size === 0) {
                userSockets.delete(userId);
                await updateUserStatus(userId, 'offline');
                await emitStatusToFriends(io, userId, 'offline');
                socket.to(`user:${userId}`).emit('my_status', { status: 'offline' });
                console.log(`[Socket.io] User ${userId} está offline`);
            }
        });
    });
};
