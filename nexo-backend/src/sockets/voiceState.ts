// Estado en memoria de los canales de voz: channelId -> (socketId -> participante)
export interface VoiceParticipant {
    socketId: string;
    userId: string;
    username: string;
    avatarUrl: string | null;
    muted: boolean;
    sharing: boolean;
    shareId: string | null;
}

const voiceChannels = new Map<string, Map<string, VoiceParticipant>>();

export function addVoiceParticipant(channelId: string, participant: VoiceParticipant) {
    if (!voiceChannels.has(channelId)) {
        voiceChannels.set(channelId, new Map());
    }
    voiceChannels.get(channelId)!.set(participant.socketId, participant);
}

export function removeVoiceParticipant(channelId: string, socketId: string): VoiceParticipant | null {
    const channel = voiceChannels.get(channelId);
    if (!channel) return null;
    const participant = channel.get(socketId) ?? null;
    channel.delete(socketId);
    if (channel.size === 0) voiceChannels.delete(channelId);
    return participant;
}

export function getVoiceParticipants(channelId: string): VoiceParticipant[] {
    return Array.from(voiceChannels.get(channelId)?.values() ?? []);
}

// Busca en qué canal de voz está un socket (un socket solo puede estar en un canal de voz)
export function findVoiceChannelOfSocket(socketId: string): string | null {
    for (const [channelId, participants] of voiceChannels) {
        if (participants.has(socketId)) return channelId;
    }
    return null;
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

// Devuelve el estado de voz de varios canales: { channelId: participantes[] }
export function getVoiceStates(channelIds: string[]): Record<string, VoiceParticipant[]> {
    const result: Record<string, VoiceParticipant[]> = {};
    for (const id of channelIds) {
        const participants = getVoiceParticipants(id);
        if (participants.length > 0) result[id] = participants;
    }
    return result;
}
