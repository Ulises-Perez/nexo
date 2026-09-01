import { Request, Response } from 'express';
import { prisma } from '../db/prisma';
import {
    emitFriendRequestReceived,
    emitFriendRequestAccepted,
    emitFriendRequestRejected,
    emitFriendRemoved,
    emitDMCreated,
    FriendRequestPayload,
    FriendAcceptedPayload,
    DMCreatedPayload
} from '../sockets/io';

type FriendRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export class FriendController {
    /**
     * POST /friends/request
     * Enviar solicitud de amistad
     */
    public static async sendRequest(req: Request, res: Response): Promise<void> {
        try {
            const senderId = req.user?.id;
            const { receiverId } = req.body;

            if (!senderId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            if (!receiverId) {
                res.status(400).json({ error: 'receiverId is required' });
                return;
            }

            // No enviar solicitud a uno mismo
            if (senderId === receiverId) {
                res.status(400).json({ error: 'Cannot send a friend request to yourself' });
                return;
            }

            // Verificar que el receptor existe
            const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
            if (!receiver) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            // Verificar si ya existe una solicitud entre estos usuarios
            const existingRequest = await prisma.friendRequest.findFirst({
                where: {
                    OR: [
                        { senderId, receiverId },
                        { senderId: receiverId, receiverId: senderId }
                    ]
                }
            });

            if (existingRequest) {
                // Las solicitudes rechazadas no deben bloquear un nuevo intento
                if (existingRequest.status === 'REJECTED') {
                    await prisma.friendRequest.delete({ where: { id: existingRequest.id } });
                } else {
                    res.status(400).json({ error: 'A friend request already exists between you and this user' });
                    return;
                }
            }

            // Verificar si ya son amigos
            const existingFriendship = await prisma.friendship.findFirst({
                where: {
                    OR: [
                        { userAId: senderId, userBId: receiverId },
                        { userAId: receiverId, userBId: senderId }
                    ]
                }
            });

            if (existingFriendship) {
                res.status(400).json({ error: 'You are already friends with this user' });
                return;
            }

            // Create the friend request
            const friendRequest = await prisma.friendRequest.create({
                data: {
                    senderId,
                    receiverId,
                    status: 'PENDING'
                },
                include: {
                    sender: { select: { id: true, username: true, tag: true, avatarUrl: true, status: true } },
                    receiver: { select: { id: true, username: true, tag: true, avatarUrl: true } }
                }
            });

            // Emit to receiver and sender rooms so both tabs update immediately
            const requestPayload: FriendRequestPayload = {
                id: friendRequest.id,
                senderId: friendRequest.senderId,
                receiverId: friendRequest.receiverId,
                status: 'PENDING',
                sender: friendRequest.sender
            };
            emitFriendRequestReceived(receiverId, requestPayload);
            emitFriendRequestReceived(senderId, requestPayload);

            res.status(201).json(friendRequest);
        } catch (error) {
            console.error('[FriendController - sendRequest Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    /**
     * PATCH /friends/request/:id/accept
     * Aceptar solicitud de amistad
     */
    public static async acceptRequest(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const requestId = req.params.id as string;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            // Buscar la solicitud
            const friendRequest = await prisma.friendRequest.findUnique({
                where: { id: requestId }
            });

            if (!friendRequest) {
                res.status(404).json({ error: 'Friend request not found' });
                return;
            }

            // Solo el receptor puede aceptar
            if (friendRequest.receiverId !== userId) {
                res.status(403).json({ error: 'Only the receiver can accept this request' });
                return;
            }

            // Solo se pueden aceptar solicitudes PENDING
            if (friendRequest.status !== 'PENDING') {
                res.status(400).json({ error: `Cannot accept a request that is ${friendRequest.status}` });
                return;
            }

            // Use a transaction to create the friendship and update the request atomically
            const result = await prisma.$transaction(async (tx) => {
                // Create the bidirectional friendship
                const friendship = await tx.friendship.create({
                    data: {
                        userAId: friendRequest.senderId,
                        userBId: friendRequest.receiverId
                    }
                });

                // Update the request status to ACCEPTED, include status for socket payload
                const updatedRequest = await tx.friendRequest.update({
                    where: { id: requestId },
                    data: { status: 'ACCEPTED' },
                    include: {
                        sender: { select: { id: true, username: true, tag: true, avatarUrl: true, status: true } },
                        receiver: { select: { id: true, username: true, tag: true, avatarUrl: true, status: true } }
                    }
                });

                return { friendship, updatedRequest };
            });

            // Emit to sender: their friend is the receiver
            const senderPayload: FriendAcceptedPayload = {
                friendshipId: result.friendship.id,
                friend: result.updatedRequest.receiver
            };
            emitFriendRequestAccepted(friendRequest.senderId, senderPayload);

            // Emit to receiver: their friend is the sender
            const receiverPayload: FriendAcceptedPayload = {
                friendshipId: result.friendship.id,
                friend: result.updatedRequest.sender
            };
            emitFriendRequestAccepted(friendRequest.receiverId, receiverPayload);

            res.status(200).json(result.updatedRequest);
        } catch (error) {
            console.error('[FriendController - acceptRequest Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    /**
     * PATCH /friends/request/:id/reject
     * Rechazar solicitud de amistad
     */
    public static async rejectRequest(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const requestId = req.params.id as string;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            // Buscar la solicitud
            const friendRequest = await prisma.friendRequest.findUnique({
                where: { id: requestId }
            });

            if (!friendRequest) {
                res.status(404).json({ error: 'Friend request not found' });
                return;
            }

            // Solo el receptor puede rechazar
            if (friendRequest.receiverId !== userId) {
                res.status(403).json({ error: 'Only the receiver can reject this request' });
                return;
            }

            // Solo se pueden rechazar solicitudes PENDING
            if (friendRequest.status !== 'PENDING') {
                res.status(400).json({ error: `Cannot reject a request that is ${friendRequest.status}` });
                return;
            }

            // Update the status to REJECTED
            const updatedRequest = await prisma.friendRequest.update({
                where: { id: requestId },
                data: { status: 'REJECTED' },
                include: {
                    sender: { select: { id: true, username: true, tag: true, avatarUrl: true } },
                    receiver: { select: { id: true, username: true, tag: true, avatarUrl: true } }
                }
            });

            // Notify the requester so their outgoing request disappears silently
            emitFriendRequestRejected(friendRequest.senderId, requestId);

            res.status(200).json(updatedRequest);
        } catch (error) {
            console.error('[FriendController - rejectRequest Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    /**
     * GET /friends/requests/pending
     * Listar solicitudes pendientes recibidas por el usuario
     */
    public static async getPendingRequests(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const pendingRequests = await prisma.friendRequest.findMany({
                where: {
                    receiverId: userId,
                    status: 'PENDING'
                },
                include: {
                    sender: { select: { id: true, username: true, tag: true, avatarUrl: true } }
                },
                orderBy: { createdAt: 'desc' }
            });

            res.status(200).json(pendingRequests);
        } catch (error) {
            console.error('[FriendController - getPendingRequests Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    /**
     * GET /friends
     * Listar amigos del usuario actual
     */
    public static async getFriends(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            // Buscar amistades donde el usuario es userA o userB
            const friendships = await prisma.friendship.findMany({
                where: {
                    OR: [
                        { userAId: userId },
                        { userBId: userId }
                    ]
                },
                include: {
                    userA: { select: { id: true, username: true, tag: true, avatarUrl: true, status: true } },
                    userB: { select: { id: true, username: true, tag: true, avatarUrl: true, status: true } }
                },
                orderBy: { createdAt: 'desc' }
            });

            // Transformar para devolver el amigo directo
            const friends = friendships.map((f) => {
                const friend = f.userAId === userId ? f.userB : f.userA;
                return friend;
            });

            res.status(200).json(friends);
        } catch (error) {
            console.error('[FriendController - getFriends Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    /**
     * GET /friends/status/:userId
     * Estado de la relación con otro usuario (para el modal de perfil)
     */
    public static async getFriendStatus(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const otherUserId = req.params.userId as string;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            if (userId === otherUserId) {
                res.status(200).json({ status: 'self' });
                return;
            }

            const friendship = await prisma.friendship.findFirst({
                where: {
                    OR: [
                        { userAId: userId, userBId: otherUserId },
                        { userAId: otherUserId, userBId: userId }
                    ]
                }
            });

            if (friendship) {
                res.status(200).json({ status: 'friends' });
                return;
            }

            const pendingRequest = await prisma.friendRequest.findFirst({
                where: {
                    status: 'PENDING',
                    OR: [
                        { senderId: userId, receiverId: otherUserId },
                        { senderId: otherUserId, receiverId: userId }
                    ]
                }
            });

            if (pendingRequest) {
                res.status(200).json({
                    status: pendingRequest.senderId === userId ? 'pending_sent' : 'pending_received',
                    requestId: pendingRequest.id
                });
                return;
            }

            res.status(200).json({ status: 'none' });
        } catch (error) {
            console.error('[FriendController - getFriendStatus Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    /**
     * DELETE /friends/:userId
     * Eliminar a un amigo (borra la amistad y las solicitudes previas para poder re-agregar)
     */
    public static async removeFriend(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const otherUserId = req.params.userId as string;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const friendship = await prisma.friendship.findFirst({
                where: {
                    OR: [
                        { userAId: userId, userBId: otherUserId },
                        { userAId: otherUserId, userBId: userId }
                    ]
                }
            });

            if (!friendship) {
                res.status(404).json({ error: 'You are not friends with this user' });
                return;
            }

            await prisma.$transaction([
                prisma.friendship.delete({ where: { id: friendship.id } }),
                prisma.friendRequest.deleteMany({
                    where: {
                        OR: [
                            { senderId: userId, receiverId: otherUserId },
                            { senderId: otherUserId, receiverId: userId }
                        ]
                    }
                })
            ]);

            // Notify both parties so each removes the other from their friends list
            emitFriendRemoved(otherUserId, userId);
            emitFriendRemoved(userId, otherUserId);

            res.status(200).json({ success: true });
        } catch (error) {
            console.error('[FriendController - removeFriend Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    /**
     * POST /friends/dm/:userId
     * Obtener o crear conversación DM con otro usuario
     */
    public static async getOrCreateDM(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const otherUserId = req.params.userId as string;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            if (!otherUserId) {
                res.status(400).json({ error: 'otherUserId is required' });
                return;
            }

            if (userId === otherUserId) {
                res.status(400).json({ error: 'Cannot create a DM with yourself' });
                return;
            }

            // Verificar que el otro usuario existe
            const otherUser = await prisma.user.findUnique({
                where: { id: otherUserId },
                select: { id: true, username: true, tag: true, avatarUrl: true, status: true }
            });

            if (!otherUser) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            // Cualquier usuario autenticado puede iniciar un DM con otro usuario,
            // sin necesidad de ser amigos.

            // Look up existing conversation
            let conversation = await prisma.conversation.findFirst({
                where: {
                    OR: [
                        { userAId: userId, userBId: otherUserId },
                        { userAId: otherUserId, userBId: userId }
                    ]
                },
                include: {
                    channel: true
                }
            });

            // Create a new conversation only if none exists
            let isNew = false;
            if (!conversation) {
                isNew = true;
                conversation = await prisma.conversation.create({
                    data: {
                        userA: { connect: { id: userId } },
                        userB: { connect: { id: otherUserId } },
                        channel: {
                            create: {
                                name: `dm-${userId}-${otherUserId}`,
                                type: 'dm'
                            }
                        }
                    },
                    include: {
                        channel: true
                    }
                });
            }

            // Reabrir un DM lo des-oculta para quien lo abre (el ocultamiento es
            // por participante): así vuelve a aparecer en su lista de DMs.
            const requesterIsA = conversation.userAId === userId;
            if ((requesterIsA && conversation.hiddenForA) || (!requesterIsA && conversation.hiddenForB)) {
                await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: requesterIsA ? { hiddenForA: false } : { hiddenForB: false }
                });
            }

            // Notify the other user about the new DM only on creation
            if (isNew) {
                const initiator = await prisma.user.findUnique({
                    where: { id: userId },
                    select: { id: true, username: true, tag: true, avatarUrl: true, status: true }
                });
                if (initiator) {
                    const dmPayload: DMCreatedPayload = {
                        conversationId: conversation.id,
                        channelId: conversation.channelId,
                        friend: initiator
                    };
                    emitDMCreated(otherUserId, dmPayload);
                }
            }

            res.status(200).json({
                conversationId: conversation.id,
                channelId: conversation.channelId,
                friend: otherUser
            });
        } catch (error) {
            console.error('[FriendController - getOrCreateDM Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    /**
     * GET /friends/dm/conversations
     * Listar todas las conversaciones DM del usuario
     */
    public static async getDMConversations(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const allConversations = await prisma.conversation.findMany({
                where: {
                    OR: [
                        { userAId: userId },
                        { userBId: userId }
                    ]
                },
                include: {
                    userA: { select: { id: true, username: true, tag: true, avatarUrl: true, status: true } },
                    userB: { select: { id: true, username: true, tag: true, avatarUrl: true, status: true } },
                    channel: {
                        include: {
                            messages: {
                                orderBy: { createdAt: 'desc' },
                                take: 1,
                                select: {
                                    content: true,
                                    userId: true,
                                    createdAt: true
                                }
                            }
                        }
                    }
                }
            });

            // Excluir las conversaciones ocultas para el solicitante.
            // Cada participante controla su propia visibilidad (hiddenForA/hiddenForB).
            const conversations = allConversations.filter((conv) => {
                if (conv.userAId === userId) return !conv.hiddenForA;
                if (conv.userBId === userId) return !conv.hiddenForB;
                return true;
            });

            const channelIds = conversations.map(c => c.channelId);

            // Group by channelId to get the unread count and the timestamp of the
            // last unread message per channel without loading every unread row.
            const lastUnreadByChannel = new Map<string, { content: string; isMine: boolean; createdAt: Date }>();
            const unreadCountsMap = new Map<string, number>();

            if (channelIds.length > 0) {
                const unreadGroups = await prisma.message.groupBy({
                    by: ['channelId'],
                    where: {
                        channelId: { in: channelIds },
                        userId: { not: userId },
                        readAt: null
                    },
                    _count: { _all: true },
                    _max: { createdAt: true }
                });

                unreadGroups.forEach(g => {
                    unreadCountsMap.set(g.channelId, g._count._all);
                });

                if (unreadGroups.length > 0) {
                    // Fetch only the last unread message's content per channel,
                    // matched by the createdAt found above.
                    const lastUnreadMessages = await prisma.message.findMany({
                        where: {
                            OR: unreadGroups.map(g => ({
                                channelId: g.channelId,
                                userId: { not: userId },
                                readAt: null,
                                createdAt: g._max.createdAt as Date
                            }))
                        },
                        select: {
                            channelId: true,
                            content: true,
                            createdAt: true
                        }
                    });

                    lastUnreadMessages.forEach(msg => {
                        // If two messages in the same channel share the exact same
                        // createdAt, keep the first one encountered (same approximate
                        // behavior as before).
                        if (!lastUnreadByChannel.has(msg.channelId)) {
                            lastUnreadByChannel.set(msg.channelId, {
                                content: msg.content,
                                isMine: false,
                                createdAt: msg.createdAt
                            });
                        }
                    });
                }
            }

            const result = conversations.map((conv) => {
                const friend = conv.userAId === userId ? conv.userB : conv.userA;
                const lastMessage = conv.channel.messages[0] || null;
                const unreadCount = unreadCountsMap.get(conv.channelId) || 0;
                const lastUnreadMessage = lastUnreadByChannel.get(conv.channelId) || null;

                return {
                    conversationId: conv.id,
                    channelId: conv.channelId,
                    friend,
                    lastMessage: lastMessage ? {
                        content: lastMessage.content,
                        isMine: lastMessage.userId === userId,
                        createdAt: lastMessage.createdAt
                    } : null,
                    lastUnreadMessage: lastUnreadMessage ? {
                        content: lastUnreadMessage.content,
                        isMine: false,
                        createdAt: lastUnreadMessage.createdAt
                    } : null,
                    lastMessageAt: lastMessage?.createdAt || conv.createdAt,
                    unreadCount
                };
            });

            // Sort by lastMessageAt descending (most recent first)
            result.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

            res.status(200).json(result);
        } catch (error) {
            console.error('[FriendController - getDMConversations Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    /**
     * PATCH /friends/dm/conversations/:channelId/hide
     * Ocultar una conversación DM para el usuario actual (solo para él)
     */
    public static async hideDMConversation(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const channelId = req.params.channelId as string;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const conversation = await prisma.conversation.findUnique({
                where: { channelId }
            });

            if (!conversation) {
                res.status(404).json({ error: 'Conversation not found' });
                return;
            }

            if (conversation.userAId !== userId && conversation.userBId !== userId) {
                res.status(403).json({ error: 'You are not a participant of this conversation' });
                return;
            }

            // Cada participante oculta la conversación solo para sí mismo
            await prisma.conversation.update({
                where: { id: conversation.id },
                data: conversation.userAId === userId
                    ? { hiddenForA: true }
                    : { hiddenForB: true }
            });

            res.status(200).json({ ok: true });
        } catch (error) {
            console.error('[FriendController - hideDMConversation Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}
