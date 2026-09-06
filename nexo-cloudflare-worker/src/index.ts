import { validateFile } from './validation';
import { generateObjectKey, generatePresignedUrl } from './presign';

interface Env {
  ASSETS: R2Bucket;
  CDN_URL: string;
  // Shared secret the backend sends as `Authorization: Bearer <secret>` on
  // presign requests. Set with `wrangler secret put UPLOAD_SECRET`.
  UPLOAD_SECRET: string;
  // Optional comma-separated list of extra browser origins allowed to PUT.
  ALLOWED_ORIGINS?: string;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'http://tauri.localhost',
  'https://tauri.localhost',
  'http://localhost:1420',
  'http://localhost:5173',
];

const MAX_USER_ID_LENGTH = 64;

function allowedOrigins(env: Env): string[] {
  const extra = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED_ORIGINS, ...extra];
}

// Returns CORS headers only for allowlisted browser origins. Requests without
// an Origin header (server-to-server) get no CORS headers at all.
function corsHeadersFor(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get('Origin');
  if (!origin) return headers;

  if (allowedOrigins(env).includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Vary', 'Origin');
  }
  return headers;
}

function isOriginAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  return allowedOrigins(env).includes(origin);
}

function jsonResponse(body: unknown, status: number, cors: Headers): Response {
  const headers = new Headers(cors);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers });
}

// Constant-time comparison of two strings via WebCrypto. `timingSafeEqual` is
// a Workers extension not present in the DOM typings this project resolves,
// hence the narrow cast.
type SubtleWithTimingSafeEqual = SubtleCrypto & {
  timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean;
};

function secretsMatch(provided: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(provided);
  const b = encoder.encode(expected);
  if (a.byteLength !== b.byteLength) return false;
  return (crypto.subtle as SubtleWithTimingSafeEqual).timingSafeEqual(a, b);
}

const MAX_DELETE_KEYS = 100;

function isValidObjectKey(key: unknown): key is string {
  return typeof key === 'string' && key.startsWith('attachments/') && !key.includes('..');
}

// POST /api/upload/delete — server-to-server only (the backend, after it
// deletes the owning message/channel/category/community). No CORS headers:
// browsers never call this endpoint directly.
async function handleDeleteObjects(request: Request, env: Env): Promise<Response> {
  const noCors = new Headers();

  if (!env.UPLOAD_SECRET) {
    return jsonResponse({ error: 'Upload service not configured' }, 503, noCors);
  }

  const authHeader = request.headers.get('Authorization') ?? '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token || !secretsMatch(token, env.UPLOAD_SECRET)) {
    return jsonResponse({ error: 'Unauthorized' }, 401, noCors);
  }

  let body: { keys?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, noCors);
  }

  const { keys } = body;
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > MAX_DELETE_KEYS || !keys.every(isValidObjectKey)) {
    return jsonResponse({ error: `keys must be an array of 1-${MAX_DELETE_KEYS} valid object keys` }, 400, noCors);
  }

  await env.ASSETS.delete(keys);

  return jsonResponse({ deleted: keys.length }, 200, noCors);
}

// Sweeps `upload:<token>` presign metadata whose 15-minute window has passed
// without the client ever completing the PUT — otherwise those tiny JSON
// objects accumulate in R2 forever. Runs on the cron in wrangler.toml.
async function purgeExpiredUploadMetadata(env: Env): Promise<number> {
  let cursor: string | undefined;
  let deletedCount = 0;

  do {
    const listing: R2Objects = await env.ASSETS.list({ prefix: 'upload:', cursor });
    const expiredKeys: string[] = [];

    for (const obj of listing.objects) {
      const value = await env.ASSETS.get(obj.key);
      if (!value) continue;

      try {
        const metadata = JSON.parse(await value.text()) as { expiresAt?: string };
        if (metadata.expiresAt && new Date(metadata.expiresAt) < new Date()) {
          expiredKeys.push(obj.key);
        }
      } catch {
        // Malformed metadata: leave it rather than guessing.
      }
    }

    if (expiredKeys.length > 0) {
      await env.ASSETS.delete(expiredKeys);
      deletedCount += expiredKeys.length;
    }

    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);

  return deletedCount;
}

async function handlePresign(request: Request, env: Env): Promise<Response> {
  const cors = corsHeadersFor(request, env);

  if (!env.UPLOAD_SECRET) {
    return jsonResponse({ error: 'Upload service not configured' }, 503, cors);
  }

  const authHeader = request.headers.get('Authorization') ?? '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token || !secretsMatch(token, env.UPLOAD_SECRET)) {
    return jsonResponse({ error: 'Unauthorized' }, 401, cors);
  }

  let body: { userId?: unknown; fileName?: unknown; fileSize?: unknown; mimeType?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, cors);
  }

  const { userId, fileName, fileSize, mimeType } = body;

  if (typeof userId !== 'string' || userId.length === 0 || userId.length > MAX_USER_ID_LENGTH) {
    return jsonResponse({ error: 'Invalid userId' }, 400, cors);
  }

  if (typeof fileName !== 'string' || !fileName || typeof fileSize !== 'number' || typeof mimeType !== 'string' || !mimeType) {
    return jsonResponse({ error: 'Missing required fields' }, 400, cors);
  }

  const validation = validateFile(fileName, fileSize, mimeType);
  if (!validation.valid) {
    return jsonResponse({ error: validation.error }, 400, cors);
  }

  const objectKey = generateObjectKey(fileName);
  const origin = new URL(request.url).origin;
  const presigned = await generatePresignedUrl(env, origin, objectKey, fileSize, mimeType, userId);

  return jsonResponse({ ...presigned, type: validation.type }, 200, cors);
}

function isInlineMime(mimeType: string): boolean {
  return mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.startsWith('audio/');
}

async function handleUpload(request: Request, env: Env): Promise<Response> {
  const cors = corsHeadersFor(request, env);
  const url = new URL(request.url);
  const token = url.pathname.split('/').pop();

  const metadataKey = `upload:${token}`;
  const metadataValue = await env.ASSETS.get(metadataKey);

  if (!metadataValue) {
    return jsonResponse({ error: 'Invalid or expired upload token' }, 400, cors);
  }

  const metadata = JSON.parse(await metadataValue.text()) as {
    objectKey: string;
    fileSize: number;
    mimeType: string;
    userId?: string;
    expiresAt: string;
  };

  if (new Date(metadata.expiresAt) < new Date()) {
    await env.ASSETS.delete(metadataKey);
    return jsonResponse({ error: 'Upload token expired' }, 400, cors);
  }

  // Validate declared length and type before touching the body so an
  // oversized or mistyped request is rejected without buffering anything.
  const contentLength = Number.parseInt(request.headers.get('Content-Length') ?? '', 10);
  if (!Number.isInteger(contentLength) || contentLength !== metadata.fileSize) {
    return jsonResponse({ error: 'File size mismatch' }, 400, cors);
  }

  const contentType = request.headers.get('Content-Type');
  if (contentType !== metadata.mimeType) {
    return jsonResponse({ error: 'Content type mismatch' }, 400, cors);
  }

  if (!request.body) {
    return jsonResponse({ error: 'Missing request body' }, 400, cors);
  }

  try {
    // Stream straight into R2; Content-Length gives R2 the known size it needs.
    await env.ASSETS.put(metadata.objectKey, request.body, {
      httpMetadata: {
        contentType: metadata.mimeType,
        contentDisposition: isInlineMime(metadata.mimeType) ? undefined : 'attachment',
      },
      customMetadata: {
        userId: metadata.userId ?? '',
        uploadedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[upload] R2 put failed', error);
    return jsonResponse({ error: 'Upload failed' }, 500, cors);
  }

  await env.ASSETS.delete(metadataKey);

  return jsonResponse({ success: true }, 200, cors);
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

// Serves an object straight from R2 — only reachable in local dev, where
// env.CDN_URL's public bucket domain can't see the locally-simulated R2
// storage a local upload actually lands in (see generatePresignedUrl).
async function handleCdnServe(request: Request, env: Env): Promise<Response> {
  const cors = corsHeadersFor(request, env);
  const url = new URL(request.url);

  if (!LOCAL_HOSTS.includes(url.hostname)) {
    return new Response('Not Found', { status: 404, headers: cors });
  }

  const objectKey = url.pathname.replace('/api/upload/cdn/', '');
  if (!objectKey.startsWith('attachments/')) {
    return new Response('Not Found', { status: 404, headers: cors });
  }

  const object = await env.ASSETS.get(objectKey);
  if (!object) {
    return new Response('Not Found', { status: 404, headers: cors });
  }

  const headers = new Headers(cors);
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);

  return new Response(object.body, { headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      if (!isOriginAllowed(request, env)) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeadersFor(request, env) });
    }

    if (url.pathname === '/api/upload/presign' && request.method === 'POST') {
      return handlePresign(request, env);
    }

    if (url.pathname === '/api/upload/delete' && request.method === 'POST') {
      return handleDeleteObjects(request, env);
    }

    // Serve an object directly (local dev only — see handleCdnServe)
    if (url.pathname.startsWith('/api/upload/cdn/') && request.method === 'GET') {
      return handleCdnServe(request, env);
    }

    if (url.pathname.startsWith('/api/upload/') && request.method === 'PUT') {
      return handleUpload(request, env);
    }

    return new Response('Not Found', { status: 404, headers: corsHeadersFor(request, env) });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      purgeExpiredUploadMetadata(env).then(count => {
        console.log(`[upload] scheduled cleanup: deleted ${count} expired upload token(s)`);
      })
    );
  }
};
