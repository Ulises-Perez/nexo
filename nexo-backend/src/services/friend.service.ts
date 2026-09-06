// Friend requests, friendships and DM conversations.
// Owns Prisma access, pair normalization and socket emits for the social
// domain; throws AppErrors instead of writing status codes directly.

import { prisma } from '../db/prisma';
import { badRequest, conflict, forbidden, notFound, isPrismaError } from '../lib/errors';
import { normalizePair, pairWhere } from '../lib/pairs';
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

const senderSelect = { id: true, username: true, tag: true, avatarUrl: true, status: true } as const;
const receiverSelect = { id: true, username: true, tag: true, avatarUrl: true } as const;
const friendSelect = { id: true, username: true, tag: true, avatarUrl: true, status: true } as const;

/**
 * Send a friend request. Duplicate/already-friends checks stay as explicit
 * pre-checks; the final create is still guarded against a P2002 race so two
 * concurrent requests never surface as a raw 500.
 */
export async function sendRequest(senderId: string, receiverId: string) {
    if (senderId === receiverId) {
        throw badRequest('Cannot send a friend request to yourself');
    }

    const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver) {
        throw notFound('User not found');
    }

    const existingRequest = await prisma.friendRequest.findFirst({
        where: {
            OR: [
                { senderId, receiverId },
                { senderId: receiverId, receiverId: senderId }
            ]
        }
    });

    if (existingRequest) {
        if (existingRequest.status === 'REJECTED') {
            // A previously rejected request should not block a new attempt.
            await prisma.friendRequest.delete({ where: { id: existingRequest.id } });
        } else {
            throw conflict('A friend request already exists between you and this user');
        }
    }

    const existingFriendship = await prisma.friendship.findFirst({
        where: pairWhere(senderId, receiverId)
    });

    if (existingFriendship) {
        throw conflict('You are already friends with this user');
    }

    let friendRequest;
    try {
        friendRequest = await prisma.friendRequest.create({
            data: { senderId, receiverId, status: 'PENDING' },
            include: {
                sender: { select: senderSelect },
                receiver: { select: receiverSelect }
            }
        });
    } catch (err) {
        if (isPrismaError(err, 'P2002')) {
            throw conflict('Friend request already exists');
        }
        throw err;
    }

    // Emit to receiver and sender rooms so both tabs update immediately.
    const requestPayload: FriendRequestPayload = {
        id: friendRequest.id,
        senderId: friendRequest.senderId,
        receiverId: friendRequest.receiverId,
        status: 'PENDING',
        sender: friendRequest.sender
    };
    emitFriendRequestReceived(receiverId, requestPayload);
    emitFriendRequestReceived(senderId, requestPayload);

    return friendRequest;
}

/**
 * Accept a friend request: creates the (normalized) Friendship and flips the
 * request to ACCEPTED atomically. A P2002 on the Friendship insert means the
 * pair already became friends concurrently (e.g. duplicate legacy rows).
 */
export async function acceptRequest(userId: string, requestId: string) {
    const friendRequest = await prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!friendRequest) {
        throw notFound('Friend request not found');
    }

    if (friendRequest.receiverId !== userId) {
        throw forbidden('Only the receiver can accept this request');
    }

    if (friendRequest.status !== 'PENDING') {
        throw badRequest(`Cannot accept a request that is ${friendRequest.status}`);
    }

    const [userAId, userBId] = normalizePair(friendRequest.senderId, friendRequest.receiverId);

    let result;
    try {
        result = await prisma.$transaction(async (tx) => {
            const friendship = await tx.friendship.create({
                data: { userAId, userBId }
            });

            const updatedRequest = await tx.friendRequest.update({
                where: { id: requestId },
                data: { status: 'ACCEPTED' },
                include: {
                    sender: { select: friendSelect },
                    receiver: { select: friendSelect }
                }
            });

            return { friendship, updatedRequest };
        });
    } catch (err) {
        if (isPrismaError(err, 'P2002')) {
            throw conflict('Already friends');
        }
        throw err;
    }

    // Emit to sender: their friend is the receiver.
    const senderPayload: FriendAcceptedPayload = {
        friendshipId: result.friendship.id,
        friend: result.updatedRequest.receiver
    };
    emitFriendRequestAccepted(friendRequest.senderId, senderPayload);

    // Emit to receiver: their friend is the sender.
    const receiverPayload: FriendAcceptedPayload = {
        friendshipId: result.friendship.id,
        friend: result.updatedRequest.sender
    };
    emitFriendRequestAccepted(friendRequest.receiverId, receiverPayload);

    return result.updatedRequest;
}

export async function rejectRequest(userId: string, requestId: string) {
    const friendRequest = await prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!friendRequest) {
        throw notFound('Friend request not found');
    }

    if (friendRequest.receiverId !== userId) {
        throw forbidden('Only the receiver can reject this request');
    }

    if (friendRequest.status !== 'PENDING') {
        throw badRequest(`Cannot reject a request that is ${friendRequest.status}`);
    }

    const updatedRequest = await prisma.friendRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED' },
        include: {
            sender: { select: receiverSelect },
            receiver: { select: receiverSelect }
        }
    });

    // Notify the requester so their outgoing request disappears silently.
    emitFriendRequestRejected(friendRequest.senderId, requestId);

    return updatedRequest;
}

export async function getPendingRequests(userId: string) {
    return prisma.friendRequest.findMany({
        where: { receiverId: userId, status: 'PENDING' },
        include: { sender: { select: receiverSelect } },
        orderBy: { createdAt: 'desc' }
    });
}

export async function getFriends(userId: string) {
    const friendships = await prisma.friendship.findMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        include: {
            userA: { select: friendSelect },
            userB: { select: friendSelect }
        },
        orderBy: { createdAt: 'desc' }
    });

    return friendships.map((f) => (f.userAId === userId ? f.userB : f.userA));
}

export async function getFriendStatus(userId: string, otherUserId: string) {
    if (userId === otherUserId) {
        return { status: 'self' as const };
    }

    const friendship = await prisma.friendship.findFirst({ where: pairWhere(userId, otherUserId) });
    if (friendship) {
        return { status: 'friends' as const };
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
        return {
            status: pendingRequest.senderId === userId ? ('pending_sent' as const) : ('pending_received' as const),
            requestId: pendingRequest.id
        };
    }

    return { status: 'none' as const };
}

export async function removeFriend(userId: string, otherUserId: string) {
    const friendship = await prisma.friendship.findFirst({ where: pairWhere(userId, otherUserId) });
    if (!friendship) {
        throw notFound('You are not friends with this user');
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

    // Notify both parties so each removes the other from their friends list.
    emitFriendRemoved(otherUserId, userId);
    emitFriendRemoved(userId, otherUserId);

    return { success: true };
}

/**
 * Get or create the DM conversation between two users. Idempotent under
 * concurrency: if the create races another request and hits the unique
 * pair constraint, re-fetch with pairWhere and continue as if it was found.
 */
export async function getOrCreateDM(userId: string, otherUserId: string) {
    if (userId === otherUserId) {
        throw badRequest('Cannot create a DM with yourself');
    }

    const otherUser = await prisma.user.findUnique({
        where: { id: otherUserId },
        select: friendSelect
    });

    if (!otherUser) {
        throw notFound('User not found');
    }

    // Any authenticated user can start a DM with another user, no friendship required.
    let conversation = await prisma.conversation.findFirst({
        where: pairWhere(userId, otherUserId),
        include: { channel: true }
    });

    let isNew = false;
    if (!conversation) {
        isNew = true;
        const [userAId, userBId] = normalizePair(userId, otherUserId);
        try {
            conversation = await prisma.conversation.create({
                data: {
                    userA: { connect: { id: userAId } },
                    userB: { connect: { id: userBId } },
                    channel: {
                        create: {
                            name: `dm-${userId}-${otherUserId}`,
                            type: 'dm'
                        }
                    }
                },
                include: { channel: true }
            });
        } catch (err) {
            if (isPrismaError(err, 'P2002')) {
                isNew = false;
                conversation = await prisma.conversation.findFirst({
                    where: pairWhere(userId, otherUserId),
                    include: { channel: true }
                });
                if (!conversation) {
                    throw err;
                }
            } else {
                throw err;
            }
        }
    }

    // Reopening a DM un-hides it for the opener (hiding is per-participant),
    // so it reappears in their DM list.
    const requesterIsA = conversation.userAId === userId;
    if ((requesterIsA && conversation.hiddenForA) || (!requesterIsA && conversation.hiddenForB)) {
        await prisma.conversation.update({
            where: { id: conversation.id },
            data: requesterIsA ? { hiddenForA: false } : { hiddenForB: false }
        });
    }

    // Notify the other user about the new DM only on creation.
    if (isNew) {
        const initiator = await prisma.user.findUnique({
            where: { id: userId },
            select: friendSelect
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

    return {
        conversationId: conversation.id,
        channelId: conversation.channelId,
        friend: otherUser
    };
}

export async function getDMConversations(userId: string) {
    const conversations = await prisma.conversation.findMany({
        where: {
            OR: [
                { userAId: userId, hiddenForA: false },
                { userBId: userId, hiddenForB: false }
            ]
        },
        include: {
            userA: { select: friendSelect },
            userB: { select: friendSelect },
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

    const channelIds = conversations.map((c) => c.channelId);

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

        unreadGroups.forEach((g) => {
            unreadCountsMap.set(g.channelId, g._count._all);
        });

        if (unreadGroups.length > 0) {
            // Fetch only the last unread message's content per channel,
            // matched by the createdAt found above.
            const lastUnreadMessages = await prisma.message.findMany({
                where: {
                    OR: unreadGroups.map((g) => ({
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

            lastUnreadMessages.forEach((msg) => {
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
            lastMessage: lastMessage
                ? {
                      content: lastMessage.content,
                      isMine: lastMessage.userId === userId,
                      createdAt: lastMessage.createdAt
                  }
                : null,
            lastUnreadMessage: lastUnreadMessage
                ? {
                      content: lastUnreadMessage.content,
                      isMine: false,
                      createdAt: lastUnreadMessage.createdAt
                  }
                : null,
            lastMessageAt: lastMessage?.createdAt || conv.createdAt,
            unreadCount
        };
    });

    // Sort by lastMessageAt descending (most recent first).
    result.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

    return result;
}

export async function hideDMConversation(userId: string, channelId: string) {
    const conversation = await prisma.conversation.findUnique({ where: { channelId } });
    if (!conversation) {
        throw notFound('Conversation not found');
    }

    if (conversation.userAId !== userId && conversation.userBId !== userId) {
        throw forbidden('You are not a participant of this conversation');
    }

    // Each participant hides the conversation only for themselves.
    await prisma.conversation.update({
        where: { id: conversation.id },
        data: conversation.userAId === userId ? { hiddenForA: true } : { hiddenForB: true }
    });

    return { ok: true };
}
