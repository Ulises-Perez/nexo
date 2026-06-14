export interface PresignedUrlResponse {
  uploadUrl: string;
  objectKey: string;
  cdnUrl: string;
  expiresAt: string;
}

export function generateObjectKey(fileName: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const random = crypto.randomUUID().replace(/-/g, '').substring(0, 12);
  const ext = fileName.split('.').pop() || '';
  const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `attachments/${year}/${month}/${random}-${safeName}`;
}

export async function generatePresignedUrl(
  env: { ASSETS: R2Bucket },
  objectKey: string,
  fileSize: number,
  mimeType: string
): Promise<PresignedUrlResponse> {
  // Generar token de upload
  const uploadToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  // Almacenar metadata del upload en R2
  await env.ASSETS.put(`upload:${uploadToken}`, JSON.stringify({
    objectKey,
    fileSize,
    mimeType,
    expiresAt: expiresAt.toISOString()
  }));

  // URL para subir directamente al Worker
  const uploadUrl = `https://nexo-upload-worker.devk.workers.dev/api/upload/${uploadToken}`;

  // URL CDN para acceder al archivo
  const cdnUrl = `https://pub-be485944060140659115bf903d1bf6ca.r2.dev/${objectKey}`;

  return {
    uploadUrl,
    objectKey,
    cdnUrl,
    expiresAt: expiresAt.toISOString()
  };
}