const ALLOWED_MIME_TYPES = [
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
  'text/html',
  'text/css',
  'text/javascript',
  'application/json',
  'application/xml'
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const DANGEROUS_EXTENSIONS = ['exe', 'bat', 'sh', 'cmd', 'msi', 'dll', 'so', 'dylib'];

export interface ValidationResult {
  valid: boolean;
  error?: string;
  type?: 'image' | 'video' | 'audio' | 'file';
}

export function validateFile(fileName: string, fileSize: number, mimeType: string): ValidationResult {
  // Check file size
  if (fileSize > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large. Maximum size is 50MB.` };
  }

  // Check mime type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { valid: false, error: `File type ${mimeType} not allowed.` };
  }

  // Check dangerous extensions
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext && DANGEROUS_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `File extension .${ext} not allowed.` };
  }

  // Determine type
  let type: 'image' | 'video' | 'audio' | 'file' = 'file';
  if (mimeType.startsWith('image/')) type = 'image';
  else if (mimeType.startsWith('video/')) type = 'video';
  else if (mimeType.startsWith('audio/')) type = 'audio';

  return { valid: true, type };
}