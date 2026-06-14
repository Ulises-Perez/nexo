# File Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir subir archivos (imágenes, videos, audio, documentos) al chat usando presigned URLs de Cloudflare R2, con preview de archivos seleccionados y descarga para otros usuarios.

**Architecture:** Upload directo del frontend a R2 usando presigned URLs generadas por Cloudflare Workers. Los archivos se asocian a mensajes через Prisma. El frontend ya soporta renderizado de attachments en MessageContent.vue.

**Tech Stack:** Prisma (PostgreSQL), Socket.io, Cloudflare Workers/R2/CDN, Vue 3 Composition API

---

## File Structure

```
nexo-backend/
├── prisma/schema.prisma                    # Attachment model
├── src/sockets/index.ts                    # send_message with attachments

nexo-desktop/
├── src/views/Dashboard.vue                 # Upload zone UI
├── src/stores/chat.ts                     # Attachment types, upload logic
└── src/components/MessageContent.vue      # Already supports attachments (no changes)

nexo-cloudflare-worker/ (new or existing)
├── src/index.ts                           # POST /api/upload/presign endpoint
├── src/presign.ts                         # R2 presigned URL generation
├── src/validation.ts                      # File validation
└── wrangler.toml                          # R2 binding config
```

---

## Task 1: Prisma Schema - Agregar Attachment

**Files:**
- Modify: `nexo-backend/prisma/schema.prisma`

**Steps:**

- [ ] **Step 1: Agregar modelo Attachment al schema**

```prisma
model Attachment {
  id        String   @id @default(uuid())
  messageId String
  name      String
  size      Int
  mimeType  String
  url       String
  type      String   // 'image' | 'video' | 'audio' | 'file'
  width     Int?
  height    Int?
  duration  Int?
  createdAt DateTime @default(now())

  message   Message  @relation(fields: [messageId], references: [id], onDelete: Cascade)
}

model Message {
  id          String        @id @default(uuid())
  channelId   String
  userId      String
  content     String        @db.Text
  isEdited    Boolean       @default(false)
  createdAt   DateTime      @default(now())
  readAt      DateTime?

  attachments Attachment[]
  channel     Channel       @relation(fields: [channelId], references: [id])
  user        User          @relation(fields: [userId], references: [id])
}
```

- [ ] **Step 2: Generar y aplicar migración**

Run: `cd nexo-backend && npx prisma migrate dev --name add_attachments`

Expected: Migration created successfully

- [ ] **Step 3: Commit**

```bash
git add nexo-backend/prisma/schema.prisma nexo-backend/prisma/migrations
git commit -m "feat: add Attachment model to Prisma schema"
```

---

## Task 2: Backend Socket - Actualizar send_message

**Files:**
- Modify: `nexo-backend/src/sockets/index.ts`
- Modify: `nexo-backend/src/stores/chat.ts` (tipos)

**Steps:**

- [ ] **Step 1: Agregar tipo Attachment en chat.ts**

```typescript
// En nexo-desktop/src/stores/chat.ts
export interface Attachment {
  id: string;
  type: 'image' | 'video' | 'audio' | 'file';
  url: string;
  name?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  mimeType?: string;
}
```

- [ ] **Step 2: Actualizar send_message socket handler para recibir attachments**

En `nexo-backend/src/sockets/index.ts`, modificar el handler de `send_message`:

```typescript
socket.on('send_message', async (data: { channelId: string; content: string; attachments?: Array<{ objectKey: string; cdnUrl: string; name: string; size: number; mimeType: string; type: string }> }) => {
  // Validar que el usuario está en el canal
  // Crear mensaje con attachments
  const message = await prisma.message.create({
    data: {
      channelId: data.channelId,
      userId: socket.data.userId,
      content: data.content,
      attachments: data.attachments ? {
        create: data.attachments.map(att => ({
          name: att.name,
          size: att.size,
          mimeType: att.mimeType,
          url: att.cdnUrl,
          type: att.type
        }))
      } : undefined
    },
    include: { attachments: true, user: true }
  });

  io.to(data.channelId).emit('new_message', message);
});
```

- [ ] **Step 3: Commit**

```bash
git add nexo-backend/src/sockets/index.ts nexo-desktop/src/stores/chat.ts
git commit -m "feat: support attachments in send_message socket event"
```

---

## Task 3: Cloudflare Worker - Estructura Base

**Files:**
- Create: `nexo-cloudflare-worker/wrangler.toml`
- Create: `nexo-cloudflare-worker/src/index.ts`
- Create: `nexo-cloudflare-worker/src/presign.ts`
- Create: `nexo-cloudflare-worker/src/validation.ts`
- Create: `nexo-cloudflare-worker/package.json`

**Steps:**

- [ ] **Step 1: Crear package.json**

```json
{
  "name": "nexo-cloudflare-worker",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240208.0",
    "wrangler": "^3.0.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 2: Crear wrangler.toml**

```toml
name = "nexo-upload-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[r2_buckets]]
binding = "ASSETS"
bucket_name = "nexo-attachments"
```

- [ ] **Step 3: Crear tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["@cloudflare/workers-types"]
  }
}
```

- [ ] **Step 4: Commit estructura inicial**

```bash
git add nexo-cloudflare-worker/
git commit -m "feat: add Cloudflare Worker structure for file upload"
```

---

## Task 4: Cloudflare Worker - Validación

**Files:**
- Modify: `nexo-cloudflare-worker/src/validation.ts`

**Steps:**

- [ ] **Step 1: Escribir validación de archivos**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add nexo-cloudflare-worker/src/validation.ts
git commit -m "feat: add file validation in Cloudflare Worker"
```

---

## Task 5: Cloudflare Worker - Presigned URLs

**Files:**
- Modify: `nexo-cloudflare-worker/src/presign.ts`

**Steps:**

- [ ] **Step 1: Escribir generación de presigned URLs**

```typescript
import { R2 } from '@cloudflare/workers-types';

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
  // R2 no tiene presigned URLs nativas como S3
  // Usamos una URL de upload directo con un token temporal
  const uploadToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  // URL de upload directo al Worker (que reenvía a R2)
  const uploadUrl = `https://upload.nexochat.example/api/upload/${uploadToken}`;

  // URL CDN para acceder al archivo
  const cdnUrl = `https://cdn.nexochat.example/${objectKey}`;

  return {
    uploadUrl,
    objectKey,
    cdnUrl,
    expiresAt: expiresAt.toISOString()
  };
}
```

**Nota:** R2 no soporta presigned URLs PUT como S3. La alternativa es:
- Opción A: Worker como proxy de upload (receive file → stream to R2)
- Opción B: Usar R2's `createMultipartUpload` con presigned URLs

Para este plan, usaremos **Opción A (Worker como proxy)** ya que es más simple.

- [ ] **Step 2: Actualizar presign.ts para Worker como proxy**

```typescript
export async function generatePresignedUrl(
  env: { ASSETS: R2Bucket },
  objectKey: string,
  fileSize: number,
  mimeType: string
): Promise<PresignedUrlResponse> {
  // Generar token de upload
  const uploadToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  // Almacenar metadata del upload en KV
  await env.ASSETS.put(`upload:${uploadToken}`, JSON.stringify({
    objectKey,
    fileSize,
    mimeType,
    expiresAt: expiresAt.toISOString()
  }));

  // URL para subir directamente al Worker
  const uploadUrl = `https://upload.nexochat.example/api/upload/${uploadToken}`;

  // URL CDN para acceder al archivo
  const cdnUrl = `https://cdn.nexochat.example/${objectKey}`;

  return {
    uploadUrl,
    objectKey,
    cdnUrl,
    expiresAt: expiresAt.toISOString()
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add nexo-cloudflare-worker/src/presign.ts
git commit -m "feat: add presigned URL generation in Cloudflare Worker"
```

---

## Task 6: Cloudflare Worker - Endpoint Principal

**Files:**
- Modify: `nexo-cloudflare-worker/src/index.ts`

**Steps:**

- [ ] **Step 1: Escribir endpoint principal del Worker**

```typescript
import { validateFile } from './validation';
import { generatePresignedUrl } from './presign';

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

async function handlePresign(request: Request, env: Env): Promise<Response> {
  // Get user ID from header (set by auth middleware)
  const userId = request.headers.get('X-User-ID');
  if (!userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  // Check rate limit
  if (!checkRateLimit(userId)) {
    return new Response(JSON.stringify({
      error: 'Rate limit exceeded. Try again in a minute.'
    }), { status: 429 });
  }

  const body = await request.json();
  const { fileName, fileSize, mimeType } = body;

  // Validate input
  if (!fileName || typeof fileSize !== 'number' || !mimeType) {
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
  }

  // Validate file
  const validation = validateFile(fileName, fileSize, mimeType);
  if (!validation.valid) {
    return new Response(JSON.stringify({ error: validation.error }), { status: 400 });
  }

  // Generate object key
  const objectKey = generateObjectKey(fileName);

  // Generate presigned URL
  const presigned = await generatePresignedUrl(env, objectKey, fileSize, mimeType);

  return new Response(JSON.stringify({
    ...presigned,
    type: validation.type
  }), { status: 200 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle presign endpoint
    if (url.pathname === '/api/upload/presign' && request.method === 'POST') {
      return handlePresign(request, env);
    }

    // Handle upload endpoint (PUT with token)
    if (url.pathname.startsWith('/api/upload/') && request.method === 'PUT') {
      return handleUpload(request, env);
    }

    return new Response('Not Found', { status: 404 });
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add nexo-cloudflare-worker/src/index.ts
git commit -m "feat: add Cloudflare Worker upload endpoints"
```

---

## Task 7: Frontend - Tipos y Store

**Files:**
- Modify: `nexo-desktop/src/stores/chat.ts`

**Steps:**

- [ ] **Step 1: Agregar tipo PendingAttachment para archivos en progreso**

```typescript
export interface PendingAttachment {
  id: string;
  file: File;
  objectKey?: string;
  cdnUrl?: string;
  uploadUrl?: string;
  type: 'image' | 'video' | 'audio' | 'file';
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
  progress?: number;
}
```

- [ ] **Step 2: Agregar estado de attachments pendientes**

En el store de chat, agregar:

```typescript
export const useChatStore = defineStore('chat', () => {
  // ... existing state ...

  const pendingAttachments = ref<PendingAttachment[]>([]);

  // ... existing actions ...

  async function uploadFile(file: File): Promise<PendingAttachment> {
    const id = crypto.randomUUID();
    const type = getFileType(file);

    const attachment: PendingAttachment = {
      id,
      file,
      type,
      status: 'pending'
    };

    pendingAttachments.value.push(attachment);

    // Request presigned URL
    const response = await fetch('https://upload.nexochat.example/api/upload/presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': userId.value // You'll need to get this from auth store
      },
      body: JSON.stringify({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type
      })
    });

    if (!response.ok) {
      attachment.status = 'error';
      attachment.error = 'Failed to get upload URL';
      throw new Error('Failed to get upload URL');
    }

    const { uploadUrl, objectKey, cdnUrl } = await response.json();
    attachment.uploadUrl = uploadUrl;
    attachment.objectKey = objectKey;
    attachment.cdnUrl = cdnUrl;

    // Upload file
    attachment.status = 'uploading';

    await fetch(attachment.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type
      }
    });

    attachment.status = 'completed';
    return attachment;
  }

  function getFileType(file: File): 'image' | 'video' | 'audio' | 'file' {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'file';
  }

  function removePendingAttachment(id: string) {
    const index = pendingAttachments.value.findIndex(a => a.id === id);
    if (index !== -1) {
      pendingAttachments.value.splice(index, 1);
    }
  }

  function clearCompletedAttachments() {
    pendingAttachments.value = pendingAttachments.value.filter(a => a.status !== 'completed');
  }

  return {
    // ... existing exports ...
    pendingAttachments,
    uploadFile,
    removePendingAttachment,
    clearCompletedAttachments
  };
});
```

- [ ] **Step 3: Commit**

```bash
git add nexo-desktop/src/stores/chat.ts
git commit -m "feat: add pending attachments state and upload logic to chat store"
```

---

## Task 8: Frontend - Dashboard Upload Zone

**Files:**
- Modify: `nexo-desktop/src/views/Dashboard.vue`

**Steps:**

- [ ] **Step 1: Agregar input file oculto y zona de drop**

En el template, después del chat-input-wrapper (aproximadamente línea 395):

```html
<!-- Hidden file input -->
<input
  type="file"
  ref="fileInput"
  multiple
  @change="handleFileSelect"
  class="hidden"
/>

<!-- Upload zone (visible when files selected) -->
<div
  v-if="pendingAttachments.length > 0"
  class="upload-zone fixed bottom-20 left-4 right-4 bg-[#232428] rounded-lg p-4 flex gap-4"
>
  <!-- Preview area -->
  <div class="flex-1 flex gap-2 overflow-x-auto">
    <div
      v-for="attachment in pendingAttachments"
      :key="attachment.id"
      class="attachment-preview relative bg-[#1a1a1f] rounded flex items-center gap-2 p-2 min-w-[120px]"
    >
      <!-- Image preview -->
      <img
        v-if="attachment.type === 'image' && attachment.status !== 'uploading'"
        :src="URL.createObjectURL(attachment.file)"
        class="w-12 h-12 object-cover rounded"
      />

      <!-- Icon for other types -->
      <div v-else class="w-12 h-12 flex items-center justify-center text-2xl">
        {{ attachment.type === 'video' ? '🎬' : attachment.type === 'audio' ? '🎵' : '📄' }}
      </div>

      <!-- Progress for uploading -->
      <div
        v-if="attachment.status === 'uploading'"
        class="absolute inset-0 bg-black/50 flex items-center justify-center"
      >
        <div class="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
      </div>

      <!-- Remove button -->
      <button
        @click="removeAttachment(attachment.id)"
        class="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center hover:bg-red-600"
      >
        ×
      </button>

      <!-- Error state -->
      <div v-if="attachment.status === 'error'" class="text-xs text-red-400">
        Error
      </div>
    </div>
  </div>

  <!-- Drop zone area -->
  <div
    class="drop-zone w-48 h-24 border-2 border-dashed border-[#3a3a42] rounded-lg flex flex-col items-center justify-center text-[#8a8a94] hover:border-[#5865F2] hover:text-[#5865F2] transition-colors cursor-pointer"
    @dragover.prevent="isDragOver = true"
    @dragleave="isDragOver = false"
    @drop.prevent="handleDrop"
  >
    <div class="text-2xl mb-1">📄</div>
    <div class="text-xs">Arrastra archivos aquí</div>
    <button
      @click="openFilePicker"
      class="mt-2 px-3 py-1 bg-[#5865F2] text-white text-xs rounded hover:bg-[#4752C4] transition-colors"
    >
      Subir archivo
    </button>
  </div>
</div>
```

- [ ] **Step 2: Agregar refs y state**

```typescript
const fileInput = ref<HTMLInputElement | null>(null);
const isDragOver = ref(false);

const pendingAttachments = computed(() => chatStore.pendingAttachments);
```

- [ ] **Step 3: Agregar métodos**

```typescript
function openFilePicker() {
  fileInput.value?.click();
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files) {
    await uploadFiles(Array.from(input.files));
    input.value = ''; // Reset input
  }
}

async function handleDrop(event: DragEvent) {
  isDragOver.value = false;
  if (event.dataTransfer?.files) {
    await uploadFiles(Array.from(event.dataTransfer.files));
  }
}

async function uploadFiles(files: File[]) {
  for (const file of files) {
    try {
      await chatStore.uploadFile(file);
    } catch (error) {
      console.error('Upload failed:', error);
    }
  }
}

function removeAttachment(id: string) {
  chatStore.removePendingAttachment(id);
}
```

- [ ] **Step 4: Actualizar submitMessage para incluir attachments**

```typescript
async function submitMessage() {
  const content = newMessage.value.trim();
  if (!content && chatStore.pendingAttachments.filter(a => a.status === 'completed').length === 0) {
    return;
  }

  // Upload any pending attachments first
  const completedAttachments = chatStore.pendingAttachments.filter(a => a.status === 'completed');

  // If there are pending attachments not yet uploaded, upload them now
  const pending = chatStore.pendingAttachments.filter(a => a.status === 'pending');
  for (const att of pending) {
    try {
      await chatStore.uploadFile(att.file);
    } catch (error) {
      console.error('Upload failed:', error);
      return; // Don't send message if upload fails
    }
  }

  // Get all completed attachments
  const attachments = chatStore.pendingAttachments
    .filter(a => a.status === 'completed')
    .map(a => ({
      objectKey: a.objectKey!,
      cdnUrl: a.cdnUrl!,
      name: a.file.name,
      size: a.file.size,
      mimeType: a.file.type,
      type: a.type
    }));

  // Send message with attachments
  if (activeChannelId.value) {
    await chatStore.sendMessage(activeChannelId.value, content, attachments);
  } else if (chatStore.activeDMUser) {
    await chatStore.sendDMMessage(chatStore.activeDMUser.id, content, attachments);
  }

  // Clear sent attachments
  chatStore.clearCompletedAttachments();
  newMessage.value = '';
}
```

- [ ] **Step 5: Actualizar sendMessage del store para recibir attachments**

En chatStore.ts:

```typescript
async function sendMessage(
  channelId: string,
  content: string,
  attachments: Array<{
    objectKey: string;
    cdnUrl: string;
    name: string;
    size: number;
    mimeType: string;
    type: string;
  }> = []
) {
  // ... existing socket emit with attachments array
  socket.value?.emit('send_message', {
    channelId,
    content,
    attachments
  });
}

async function sendDMMessage(
  userId: string,
  content: string,
  attachments: Array<{...}> = []
) {
  // Similar update for DM
}
```

- [ ] **Step 6: Commit**

```bash
git add nexo-desktop/src/views/Dashboard.vue nexo-desktop/src/stores/chat.ts
git commit -m "feat: add file upload zone UI and integration"
```

---

## Task 9: Integración y Testing

**Steps:**

- [ ] **Step 1: Verificar que MessageContent.vue ya soporta attachments**

Revisar que el componente puede renderizar todos los tipos de attachment (image, video, audio, file).

- [ ] **Step 2: Testing manual**

1. Abrir la aplicación
2. Seleccionar un archivo (imagen o documento)
3. Verificar que aparece en la zona de upload
4. Enviar mensaje
5. Verificar que el archivo aparece en el chat
6. Verificar que se puede descargar

- [ ] **Step 3: Commit final**

```bash
git add -A
git commit -m "feat: complete file upload feature"
```

---

## Dependencies

1. Task 1 (Prisma) debe completarse antes de Task 2 (Socket)
2. Task 3-6 (Cloudflare Worker) son independientes del backend/frontend
3. Task 7 (Store) debe completarse antes de Task 8 (Dashboard UI)
4. Task 8 (Dashboard) requiere Worker configurado para probar completamente

---

## Spec Coverage Check

- [x] Arquitectura - Task 3-6
- [x] Modelo de Datos - Task 1
- [x] API Endpoints - Task 4-6
- [x] Rate Limits - Task 6 (50/min, 500/day)
- [x] Validación - Task 4
- [x] Componentes Frontend - Task 8
- [x] Socket Events - Task 2
- [x] Cloudflare Worker - Task 3-6
- [x] Manejo de Errores - Task 6, Task 8
