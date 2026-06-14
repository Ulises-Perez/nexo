import { Server } from 'socket.io';

// Global reference to the Socket.io server for emitting from REST controllers
let io: Server | null = null;

export const setIO = (server: Server) => {
    io = server;
};

export const getIO = (): Server | null => io;

// Notifies all connected members of a community to refresh their data
export const emitCommunityUpdated = (communityId: string) => {
    io?.to(`community:${communityId}`).emit('community_updated', { communityId });
};

// Notifies a user that they were kicked/banned/removed from a community
export const emitRemovedFromCommunity = async (userId: string, communityId: string, reason: 'kick' | 'ban' | 'deleted') => {
    if (!io) return;
    io.to(`user:${userId}`).emit('removed_from_community', { communityId, reason });
    // Remove their sockets from the community room
    io.in(`user:${userId}`).socketsLeave(`community:${communityId}`);
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
