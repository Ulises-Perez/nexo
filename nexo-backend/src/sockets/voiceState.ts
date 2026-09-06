// In-memory voice channel state: channelId -> (socketId -> participant).
// Two inverse indexes keep every lookup O(1) instead of scanning all channels:
//   socketToChannel: socketId -> channelId (a socket is in at most one channel)
//   userToSockets:   userId   -> Set<socketId> (all voice sessions of a user)
export interface VoiceParticipant {
    socketId: string;
    userId: string;
    username: string;
    avatarUrl: string | null;
    muted: boolean;
    sharing: boolean;
    shareId: string | null;
    // Community that owns the voice channel, resolved once at join time so
    // per-event broadcasts never hit the database.
    communityId: string | null;
}

const voiceChannels = new Map<string, Map<string, VoiceParticipant>>();
const socketToChannel = new Map<string, string>();
const userToSockets = new Map<string, Set<string>>();

export function addVoiceParticipant(channelId: string, participant: VoiceParticipant) {
    if (!voiceChannels.has(channelId)) {
        voiceChannels.set(channelId, new Map());
    }
    voiceChannels.get(channelId)!.set(participant.socketId, participant);
    socketToChannel.set(participant.socketId, channelId);

    if (!userToSockets.has(participant.userId)) {
        userToSockets.set(participant.userId, new Set());
    }
    userToSockets.get(participant.userId)!.add(participant.socketId);
}

export function removeVoiceParticipant(channelId: string, socketId: string): VoiceParticipant | null {
    const channel = voiceChannels.get(channelId);
    if (!channel) return null;
    const participant = channel.get(socketId) ?? null;
    channel.delete(socketId);
    if (channel.size === 0) voiceChannels.delete(channelId);

    socketToChannel.delete(socketId);
    if (participant) {
        const sockets = userToSockets.get(participant.userId);
        sockets?.delete(socketId);
        if (sockets && sockets.size === 0) userToSockets.delete(participant.userId);
    }
    return participant;
}

export function getVoiceParticipants(channelId: string): VoiceParticipant[] {
    return Array.from(voiceChannels.get(channelId)?.values() ?? []);
}

// Voice channel a socket is currently in (a socket can only be in one).
export function findVoiceChannelOfSocket(socketId: string): string | null {
    return socketToChannel.get(socketId) ?? null;
}

// Community that owns the voice channel a socket is in, if known.
export function getVoiceParticipant(socketId: string): VoiceParticipant | null {
    const channelId = socketToChannel.get(socketId);
    if (!channelId) return null;
    return voiceChannels.get(channelId)?.get(socketId) ?? null;
}

// Community of a voice channel, taken from any participant currently in it.
export function getCommunityIdOfVoiceChannel(channelId: string): string | null {
    const channel = voiceChannels.get(channelId);
    if (!channel) return null;
    for (const p of channel.values()) {
        if (p.communityId) return p.communityId;
    }
    return null;
}

// Every voice session of a user (any channel), excluding one socket.
export function findVoiceSessionsOfUser(
    userId: string,
    excludeSocketId: string
): Array<{ socketId: string; channelId: string }> {
    const sessions: Array<{ socketId: string; channelId: string }> = [];
    const sockets = userToSockets.get(userId);
    if (!sockets) return sessions;
    for (const socketId of sockets) {
        if (socketId === excludeSocketId) continue;
        const channelId = socketToChannel.get(socketId);
        if (channelId) sessions.push({ socketId, channelId });
    }
    return sessions;
}

export function setParticipantMuted(channelId: string, socketId: string, muted: boolean) {
    const participant = voiceChannels.get(channelId)?.get(socketId);
    if (participant) participant.muted = muted;
}

export function setParticipantSharing(channelId: string, socketId: string, sharing: boolean, shareId: string | null) {
    const participant = voiceChannels.get(channelId)?.get(socketId);
    if (participant) {
        participant.sharing = sharing;
        participant.shareId = shareId;
    }
}

// Voice state of several channels: { channelId: participants[] }
export function getVoiceStates(channelIds: string[]): Record<string, VoiceParticipant[]> {
    const result: Record<string, VoiceParticipant[]> = {};
    for (const id of channelIds) {
        const participants = getVoiceParticipants(id);
        if (participants.length > 0) result[id] = participants;
    }
    return result;
}
