import { Server } from 'socket.io';
import { prisma } from '../db/prisma';
import { invalidateSendContext, removeSocketFromVoice } from './index';
import { getVoiceParticipant } from './voiceState';

// Global reference to the Socket.io server for emitting from REST controllers
let io: Server | null = null;

export const setIO = (server: Server) => {
    io = server;
};

export const getIO = (): Server | null => io;

// Structural delta describing exactly what changed inside a community, so
// clients can patch their local state instead of refetching the whole
// community tree. Older clients that only read `communityId` from the
// `community_updated` payload keep working (they just ignore `change` and
// refetch), so this stays additive.
export type CommunityChange =
    | { type: 'community.updated'; community: { id: string; name: string; iconUrl: string | null; description: string | null } }
    | { type: 'channel.created' | 'channel.updated'; channel: { id: string; name: string; type: string; order: number; categoryId: string } }
    | { type: 'channel.deleted'; channelId: string }
    | { type: 'category.created' | 'category.updated'; category: { id: string; name: string; order: number } }
    | { type: 'category.deleted'; categoryId: string }
    | { type: 'role.created' | 'role.updated'; role: { id: string; name: string; color: string | null; permissions: number; position: number } }
    | { type: 'role.deleted'; roleId: string }
    | { type: 'member.roles'; userId: string; roleIds: string[] }
    | { type: 'member.removed'; userId: string };

// Notifies all connected members of a community to refresh their data. When
// `change` is provided, clients able to understand it can apply it locally
// instead of refetching.
export const emitCommunityUpdated = (communityId: string, change?: CommunityChange) => {
    io?.to(`community:${communityId}`).emit('community_updated', { communityId, change });
};

// Puts every socket of a user into the community room, server-side, right
// after they create or join a community. Older clients also emit
// `join_community_room` themselves; both paths are idempotent.
export const emitJoinCommunityRoom = (userId: string, communityId: string) => {
    io?.in(`user:${userId}`).socketsJoin(`community:${communityId}`);
};

// Notifies a user that they were kicked/banned/removed from a community and
// severs every realtime tie: cached send permission, voice session and the
// channel/community rooms of that community.
export const emitRemovedFromCommunity = async (userId: string, communityId: string, reason: 'kick' | 'ban' | 'deleted') => {
    if (!io) return;
    const server = io;
    server.to(`user:${userId}`).emit('removed_from_community', { communityId, reason });

    invalidateSendContext(userId);

    try {
        const channels = await prisma.channel.findMany({
            where: { category: { communityId } },
            select: { id: true },
        });
        const channelIds = channels.map(c => c.id);
        const rooms = [`community:${communityId}`, ...channelIds];

        const sockets = await server.in(`user:${userId}`).fetchSockets();
        for (const remote of sockets) {
            const voice = getVoiceParticipant(remote.id);
            if (voice && voice.communityId === communityId) {
                await removeSocketFromVoice(server, remote.id);
            }
            for (const room of rooms) remote.leave(room);
        }
    } catch (error) {
        console.error('[Socket.io] Error cleaning up removed member rooms:', error);
        // Fallback: at least drop the community room.
        server.in(`user:${userId}`).socketsLeave(`community:${communityId}`);
    }
};

// ===================== Social event payload interfaces =====================

export interface FriendRequestPayload {
    id: string;
    senderId: string;
    receiverId: string;
    status: 'PENDING';
    sender: {
        id: string;
        username: string;
        tag: string;
        avatarUrl: string | null;
        status: string;
    };
}

export interface FriendAcceptedPayload {
    friendshipId: string;
    friend: {
        id: string;
        username: string;
        tag: string;
        avatarUrl: string | null;
        status: string;
    };
}

export interface DMCreatedPayload {
    conversationId: string;
    channelId: string;
    friend: {
        id: string;
        username: string;
        tag: string;
        avatarUrl: string | null;
        status: string;
    };
}

export interface MemberJoinedPayload {
    userId: string;
    username: string;
    tag: string;
    avatarUrl: string | null;
    roles: Array<{ id: string; name: string; color: string; position: number }>;
    isOwner: boolean;
}

// ===================== Domain emit helpers =====================

// Emitted when a friend request is sent — to receiver and sender rooms
export const emitFriendRequestReceived = (receiverId: string, request: FriendRequestPayload): void => {
    io?.to(`user:${receiverId}`).emit('friend_request_received', request);
};

// Emitted when a friend request is accepted — two calls, one per party
export const emitFriendRequestAccepted = (userId: string, payload: FriendAcceptedPayload): void => {
    io?.to(`user:${userId}`).emit('friend_request_accepted', payload);
};

// Emitted to the original requester when their request is rejected
export const emitFriendRequestRejected = (senderId: string, requestId: string): void => {
    io?.to(`user:${senderId}`).emit('friend_request_rejected', { friendshipId: requestId });
};

// Emitted to both parties when a friendship is removed
export const emitFriendRemoved = (targetUserId: string, removerUserId: string): void => {
    io?.to(`user:${targetUserId}`).emit('friend_removed', { userId: removerUserId });
};

// Emitted to the other user when a new DM conversation is created
export const emitDMCreated = (targetUserId: string, payload: DMCreatedPayload): void => {
    io?.to(`user:${targetUserId}`).emit('dm_created', payload);
};

// Emitted to the community room when a new member joins
export const emitMemberJoined = (communityId: string, member: MemberJoinedPayload): void => {
    io?.to(`community:${communityId}`).emit('member_joined', { communityId, member });
};

// Emitted to the unbanned user (informational only)
export const emitMemberUnbanned = (userId: string, communityId: string): void => {
    io?.to(`user:${userId}`).emit('member_unbanned', { communityId });
};
