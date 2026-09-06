// Shared types for the chat store split. Re-exported wholesale from
// `stores/chat.ts` so existing imports like
// `import type { MessageAttachment } from '../stores/chat'` keep working.

export interface MessageAttachment {
    id: string;
    type: 'image' | 'video' | 'audio' | 'file';
    url: string;
    name?: string;
    size?: number;        // bytes
    width?: number;       // for images/videos
    height?: number;      // for images/videos
    duration?: number;    // seconds, for audio/video
    mimeType?: string;
}

export interface PendingAttachment {
    id: string;
    file: File;
    type: 'image' | 'video' | 'audio' | 'file';
    status: 'pending' | 'uploading' | 'completed' | 'error';
    uploadUrl?: string;
    objectKey?: string;
    cdnUrl?: string;
    error?: string;
    // Object URL local para previsualizar antes de subir (solo image/video).
    // Se crea una vez al agregar el adjunto y se reutiliza en todos los
    // estados (pending/uploading/completed) — nunca se recrea en cada
    // render. Debe revocarse explícitamente (removePendingAttachment /
    // clearCompletedAttachments) para no filtrar memoria.
    previewUrl?: string;
}

export interface ChatMessage {
    id: string;
    content: string;
    userId: string;
    channelId: string;
    createdAt: string;
    isEdited?: boolean;
    attachments?: MessageAttachment[];
    user?: {
        id: string;
        username: string;
        avatarUrl: string | null;
        status: string;
        roleColor?: string | null;
    };
    // Frontend-only: set on a message's local optimistic echo before the
    // server confirms it. Server-sourced messages never set these.
    pending?: boolean;
    failed?: boolean;
}

export interface DMFriend {
    id: string;
    username: string;
    tag: string;
    avatarUrl: string | null;
    status: string;
    // Rich profile fields (optional — patched live by `user_updated`).
    bio?: string | null;
    bannerUrl?: string | null;
    bannerColor?: string | null;
    accentColor?: string | null;
    pronouns?: string | null;
    customStatus?: string | null;
}

export interface LastMessage {
    content: string;
    isMine: boolean;
    createdAt: string;
}

export interface DMConversation {
    channelId: string;
    friend: DMFriend;
}
