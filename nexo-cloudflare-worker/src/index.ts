import { validateFile } from './validation';
import { generateObjectKey, generatePresignedUrl } from './presign';

interface Env {
  ASSETS: R2Bucket;
}

const RATE_LIMIT = 50; // requests per minute
const DAILY_LIMIT = 500;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + 60 * 1000 });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT) {
    return false;
  }

  userLimit.count++;
  return true;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-User-ID',
};

async function handlePresign(request: Request, env: Env): Promise<Response> {
  // Get user ID from header (set by auth middleware)
  const userId = request.headers.get('X-User-ID');
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: corsHeaders
    });
  }

  // Check rate limit
  if (!checkRateLimit(userId)) {
    return new Response(JSON.stringify({
      error: 'Rate limit exceeded. Try again in a minute.'
    }), { status: 429, headers: corsHeaders });
  }

  const body = await request.json();
  const { fileName, fileSize, mimeType } = body;

  // Validate input
  if (!fileName || typeof fileSize !== 'number' || !mimeType) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), {
      status: 400,
      headers: corsHeaders
    });
  }

  // Validate file
  const validation = validateFile(fileName, fileSize, mimeType);
  if (!validation.valid) {
    return new Response(JSON.stringify({ error: validation.error }), {
      status: 400,
      headers: corsHeaders
    });
  }

  // Generate object key
  const objectKey = generateObjectKey(fileName);

  // Generate presigned URL
  const presigned = await generatePresignedUrl(env, objectKey, fileSize, mimeType);

  return new Response(JSON.stringify({
    ...presigned,
    type: validation.type
  }), { status: 200, headers: corsHeaders });
}

async function handleUpload(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.pathname.split('/').pop();

  // Get upload metadata from R2
  const metadataKey = `upload:${token}`;
  const metadataValue = await env.ASSETS.get(metadataKey);

  if (!metadataValue) {
    return new Response(JSON.stringify({ error: 'Invalid or expired upload token' }), {
      status: 400,
      headers: corsHeaders
    });
  }

  const metadata = JSON.parse(await metadataValue.text());

  // Check if expired
  if (new Date(metadata.expiresAt) < new Date()) {
    await env.ASSETS.delete(metadataKey);
    return new Response(JSON.stringify({ error: 'Upload token expired' }), {
      status: 400,
      headers: corsHeaders
    });
  }

  // Get the file from request
  const fileData = await request.arrayBuffer();

  // Verify size matches
  if (fileData.byteLength !== metadata.fileSize) {
    return new Response(JSON.stringify({ error: 'File size mismatch' }), {
      status: 400,
      headers: corsHeaders
    });
  }

  // Upload to R2
  await env.ASSETS.put(metadata.objectKey, fileData, {
    httpMetadata: {
      contentType: metadata.mimeType
    }
  });

  // Delete the upload token
  await env.ASSETS.delete(metadataKey);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: corsHeaders
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // Handle presign endpoint
    if (url.pathname === '/api/upload/presign' && request.method === 'POST') {
      return handlePresign(request, env);
    }

    // Handle upload endpoint (PUT with token)
    if (url.pathname.startsWith('/api/upload/') && request.method === 'PUT') {
      return handleUpload(request, env);
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};