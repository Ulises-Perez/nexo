// Deletes the R2 objects backing attachments whose owning message/channel/
// category/community is being removed. Two-step by design: collect the keys
// BEFORE the Prisma delete (Attachment rows cascade away with their
// message), then purge the R2 objects AFTER the delete succeeds — a failed
// purge must never block or roll back the delete itself.

import { prisma } from '../db/prisma';
import { getAllowedCdnPrefixes } from './attachments';

export type AttachmentScope =
    | { channelId: string }
    | { categoryId: string }
    | { communityId: string }
    | { messageId: string };

const DELETE_BATCH_SIZE = 100;

// Legacy rows (created before objectKey was tracked) only have `url`. This
// mirrors validateAttachmentInput's derivation: the part of the url after a
// matched allowed CDN prefix IS the R2 key.
function deriveKeyFromUrl(url: string): string | null {
    for (const prefix of getAllowedCdnPrefixes()) {
        if (url.startsWith(prefix)) {
            const key = url.slice(prefix.length);
            return key.startsWith('attachments/') ? key : null;
        }
    }
    return null;
}

function whereForScope(scope: AttachmentScope) {
    if ('messageId' in scope) {
        return { messageId: scope.messageId };
    }
    if ('channelId' in scope) {
        return { message: { channelId: scope.channelId } };
    }
    if ('categoryId' in scope) {
        return { message: { channel: { categoryId: scope.categoryId } } };
    }
    return { message: { channel: { category: { communityId: scope.communityId } } } };
}

// Returns the object keys of every attachment inside the scope, deriving the
// key from `url` when `objectKey` is null (legacy rows).
export async function collectAttachmentKeys(scope: AttachmentScope): Promise<string[]> {
    const attachments = await prisma.attachment.findMany({
        where: whereForScope(scope),
        select: { objectKey: true, url: true },
    });

    const keys: string[] = [];
    for (const att of attachments) {
        const key = att.objectKey ?? deriveKeyFromUrl(att.url);
        if (key) keys.push(key);
    }
    return keys;
}

// Fire-and-forget: batches keys to the upload worker's delete endpoint.
// Never throws — callers use this after their own delete has already
// succeeded, so a purge failure only leaves orphaned R2 objects behind (the
// worker's scheduled cron also sweeps expired upload tokens separately).
export function purgeAttachmentObjects(keys: string[]): void {
    if (keys.length === 0) return;

    const workerUrl = process.env.UPLOAD_WORKER_URL?.trim().replace(/\/+$/, '');
    const workerSecret = process.env.UPLOAD_WORKER_SECRET;
    if (!workerUrl || !workerSecret) {
        console.warn('[AttachmentCleanup] UPLOAD_WORKER_URL/UPLOAD_WORKER_SECRET not set: skipping R2 purge.');
        return;
    }

    for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
        const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
        globalThis.fetch(`${workerUrl}/api/upload/delete`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${workerSecret}`,
            },
            body: JSON.stringify({ keys: batch }),
        }).then(async (res) => {
            if (!res.ok) {
                const text = await res.text().catch(() => '');
                console.error(`[AttachmentCleanup] purge batch failed (${res.status}): ${text}`);
            }
        }).catch((error) => {
            console.error('[AttachmentCleanup] purge batch request failed:', error);
        });
    }
}
