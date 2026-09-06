import { Request, Response } from 'express';
import { validateFile } from '../lib/attachments';

// Per-user presign rate limit (in-process; good enough for a single instance).
const PRESIGN_LIMIT_PER_MINUTE = 20;
const WINDOW_MS = 60_000;
const PRUNE_EVERY = 100; // prune stale entries every N presign calls

const presignWindows = new Map<string, { count: number; resetAt: number }>();
let callsSincePrune = 0;

function checkPresignRateLimit(userId: string): boolean {
    const now = Date.now();

    if (++callsSincePrune >= PRUNE_EVERY) {
        callsSincePrune = 0;
        for (const [key, entry] of presignWindows) {
            if (entry.resetAt + WINDOW_MS <= now) presignWindows.delete(key);
        }
    }

    const entry = presignWindows.get(userId);
    if (!entry || entry.resetAt <= now) {
        presignWindows.set(userId, { count: 1, resetAt: now + WINDOW_MS });
        return true;
    }
    if (entry.count >= PRESIGN_LIMIT_PER_MINUTE) return false;
    entry.count++;
    return true;
}

export class AttachmentController {
    // POST /api/attachments/presign
    // Validates the file, rate-limits the user and asks the upload worker for
    // a one-time upload URL using a shared secret the client never sees.
    public static async presign(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const workerUrl = process.env.UPLOAD_WORKER_URL?.trim().replace(/\/+$/, '');
            const workerSecret = process.env.UPLOAD_WORKER_SECRET;
            if (!workerUrl || !workerSecret) {
                res.status(503).json({ error: 'Uploads are not configured' });
                return;
            }

            const { fileName, fileSize, mimeType } = req.body ?? {};
            const validation = validateFile(fileName, fileSize, mimeType);
            if (!validation.valid) {
                res.status(400).json({ error: validation.error });
                return;
            }

            if (!checkPresignRateLimit(userId)) {
                res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' });
                return;
            }

            const workerResponse = await globalThis.fetch(`${workerUrl}/api/upload/presign`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${workerSecret}`,
                },
                body: JSON.stringify({ userId, fileName, fileSize, mimeType }),
            });

            const text = await workerResponse.text();
            let payload: unknown;
            try {
                payload = text ? JSON.parse(text) : {};
            } catch {
                payload = { error: 'Upload worker returned an invalid response' };
            }

            res.status(workerResponse.status).json(payload);
        } catch (error) {
            console.error('[AttachmentController - presign Error]', error);
            res.status(502).json({ error: 'Upload worker unavailable' });
        }
    }
}
