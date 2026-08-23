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

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export async function generatePresignedUrl(
  env: { ASSETS: R2Bucket; CDN_URL: string },
  origin: string,
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

  // URL para subir directamente al Worker que sirvió este presign (local o
  // producción) — el token solo existe en el R2 de ese mismo entorno, así
  // que la URL de subida no puede apuntar a un origin distinto.
  const uploadUrl = `${origin}/api/upload/${uploadToken}`;

  // URL CDN para acceder al archivo. El dominio público de R2 (env.CDN_URL)
  // solo sirve el bucket real de producción — un archivo subido contra el
  // Worker local vive únicamente en su R2 simulado, así que en ese caso lo
  // servimos a través del propio Worker en vez del CDN público.
  const cdnUrl = LOCAL_ORIGIN.test(origin)
    ? `${origin}/api/upload/cdn/${objectKey}`
    : `${env.CDN_URL}/${objectKey}`;

  return {
    uploadUrl,
    objectKey,
    cdnUrl,
    expiresAt: expiresAt.toISOString()
  };
}