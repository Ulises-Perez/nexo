// Attachment validation shared by the presign endpoint (before a file is
// uploaded) and send_message (before an attachment reference is persisted).
// Mirrors the upload worker's allowlist so the two never drift apart.

export const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'application/pdf',
    'application/zip',
    'text/plain',
    'application/json',
] as const;

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_FILE_NAME_LENGTH = 255;

export const DANGEROUS_EXTENSIONS = ['exe', 'bat', 'sh', 'cmd', 'msi', 'dll', 'so', 'dylib'];

export type AttachmentType = 'image' | 'video' | 'audio' | 'file';
const ATTACHMENT_TYPES: AttachmentType[] = ['image', 'video', 'audio', 'file'];

export interface FileValidationResult {
    valid: boolean;
    error?: string;
    type?: AttachmentType;
}

export function getAttachmentType(mimeType: string): AttachmentType {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'file';
}

export function validateFile(fileName: unknown, fileSize: unknown, mimeType: unknown): FileValidationResult {
    if (typeof fileName !== 'string' || fileName.trim() === '' || fileName.length > MAX_FILE_NAME_LENGTH) {
        return { valid: false, error: 'Invalid file name.' };
    }
    if (typeof fileSize !== 'number' || !Number.isInteger(fileSize) || fileSize <= 0) {
        return { valid: false, error: 'Invalid file size.' };
    }
    if (fileSize > MAX_FILE_SIZE) {
        return { valid: false, error: 'File too large. Maximum size is 50MB.' };
    }
    if (typeof mimeType !== 'string' || !(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
        return { valid: false, error: `File type ${String(mimeType)} not allowed.` };
    }
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext && DANGEROUS_EXTENSIONS.includes(ext)) {
        return { valid: false, error: `File extension .${ext} not allowed.` };
    }
    return { valid: true, type: getAttachmentType(mimeType) };
}

// URL prefixes an attachment is allowed to point at. Fails closed: with no
// ATTACHMENT_CDN_URL configured every attachment reference is rejected.
let warnedMissingCdn = false;
export function getAllowedCdnPrefixes(): string[] {
    const prefixes: string[] = [];
    const cdn = process.env.ATTACHMENT_CDN_URL?.trim();
    if (cdn) {
        prefixes.push(cdn.endsWith('/') ? cdn : `${cdn}/`);
    } else if (!warnedMissingCdn) {
        warnedMissingCdn = true;
        console.warn('[Attachments] ATTACHMENT_CDN_URL is not set: all message attachments will be rejected.');
    }
    const worker = process.env.UPLOAD_WORKER_URL?.trim();
    if (worker) {
        prefixes.push(`${worker.replace(/\/+$/, '')}/api/upload/cdn/`);
    }
    return prefixes;
}

export interface AttachmentInput {
    name: string;
    size: number;
    mimeType: string;
    url: string;
    type: AttachmentType;
}

export type AttachmentValidation =
    | { ok: true; value: AttachmentInput }
    | { ok: false; error: string };

// Validates an attachment reference sent by a client with send_message.
export function validateAttachmentInput(att: unknown): AttachmentValidation {
    if (!att || typeof att !== 'object') {
        return { ok: false, error: 'attachment must be an object' };
    }
    const { name, size, mimeType, cdnUrl, type } = att as Record<string, unknown>;

    const file = validateFile(name, size, mimeType);
    if (!file.valid) {
        return { ok: false, error: file.error ?? 'invalid attachment' };
    }

    if (typeof cdnUrl !== 'string' || cdnUrl.length > 2048 || cdnUrl.includes('..')) {
        return { ok: false, error: 'invalid attachment url' };
    }
    const prefixes = getAllowedCdnPrefixes();
    if (!prefixes.some(prefix => cdnUrl.startsWith(prefix))) {
        return { ok: false, error: 'attachment url is not from the configured CDN' };
    }

    if (typeof type !== 'string' || !ATTACHMENT_TYPES.includes(type as AttachmentType)) {
        return { ok: false, error: 'invalid attachment type' };
    }
    if (type !== file.type) {
        return { ok: false, error: 'attachment type does not match its mime type' };
    }

    return {
        ok: true,
        value: {
            name: name as string,
            size: size as number,
            mimeType: mimeType as string,
            url: cdnUrl,
            type: type as AttachmentType,
        },
    };
}
