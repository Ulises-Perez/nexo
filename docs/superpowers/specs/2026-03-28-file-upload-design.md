# File Upload Design - Nexo Chat

## Overview

Implementación de subida de archivos adjuntos en el chat de Nexo usando Cloudflare R2 para almacenamiento, Cloudflare Workers para generar presigned URLs, y Cloudflare CDN para servir los archivos.

---

## 1. Arquitectura General

```
┌─────────────┐     POST /api/upload/presign      ┌──────────────────┐
│   Frontend  │ ─────────────────────────────────► │ Cloudflare Worker │
│   (Nexo)    │                                   │                  │
└─────────────┘                                   │  1. Valida user  │
        │                                         │  2. Genera URL   │
        │ PUT (presigned R2 URL)                  │  3. Devuelve URL │
        ▼                                         └────────┬─────────┘
┌─────────────┐                                            │
│     R2      │◄────────────────────────────────────────────┘
│  (Storage)  │         Presigned URL
└─────────────┘
        │
        | CDN (URL pública)
        ▼
┌─────────────┐
│   Clients   │ (descargan con URL pública)
└─────────────┘
```

**Flujo:**
1. Usuario selecciona archivo → input file
2. Frontend pide URL presignada al Worker
3. Worker valida usuario, genera URL presignada (PUT, 15 min expiry)
4. Frontend sube archivo directo a R2
5. Frontend envía mensaje con URL pública por socket

---

## 2. Modelo de Datos (Prisma)

```prisma
model Attachment {
  id        String   @id @default(uuid())
  messageId String
  name      String
  size      Int      // bytes
  mimeType  String
  url       String   // CDN URL
  type      String   // 'image' | 'video' | 'audio' | 'file'
  width     Int?     // solo para imágenes
  height    Int?     // solo para imágenes
  duration  Int?     // solo para audio/video (segundos)
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

**Notas:**
- Relación 1:N (Message → Attachment)
- `onDelete: Cascade` - si se borra el mensaje, se borran los attachments
- Los campos width/height/duration son opcionales

---

## 3. API Endpoints

### POST `/api/upload/presign`

**Request:**
```json
{
  "fileName": "documento.pdf",
  "fileSize": 1048576,
  "mimeType": "application/pdf"
}
```

**Response:**
```json
{
  "uploadUrl": "https://r2.example.com/...",
  "objectKey": "attachments/2026/03/abc123.pdf",
  "cdnUrl": "https://cdn.example.com/attachments/2026/03/abc123.pdf",
  "expiresAt": "2026-03-28T15:15:00Z"
}
```

**Errores:**
- `400` - MimeType no permitido / archivo muy grande
- `401` - No autenticado
- `429` - Rate limit excedido

### Tipos MIME permitidos:
- Imágenes: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- Videos: `video/mp4`, `video/webm`
- Audio: `audio/mpeg`, `audio/ogg`, `audio/wav`
- Archivos: `application/pdf`, `application/zip`, `text/*`

---

## 4. Rate Limits

- **50 requests/minuto por usuario**
- **500 requests/día por usuario**

---

## 5. Validación de Archivos

| Tipo | Extensiones | Tamaño Máximo |
|------|------------|---------------|
| Imagen | jpg, jpeg, png, gif, webp | 50 MB |
| Video | mp4, webm | 50 MB |
| Audio | mp3, ogg, wav | 50 MB |
| Archivo | pdf, zip, txt, etc. | 50 MB |

**Validación en Worker:**
- Verificar mimeType (no confiar en Content-Type del cliente)
- Verificar tamaño antes de generar presigned URL
- No permitir extensiones peligrosas (exe, bat, sh, etc.)

---

## 6. Componentes Frontend

### Zona de Upload (Dashboard.vue)

```
┌─────────────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────┐  ┌─────────────────┐ │
│  │  [Imagen Preview]  [X] [Subir]   │  │  📄 Arrastra    │ │
│  │  [Imagen Preview]  [X] [Subir]   │  │  archivos aquí   │ │
│  │                                  │  │  [Subir archivo]│ │
│  └─────────────────────────────────┘  └─────────────────┘ │
│                                                             │
│  [+] [Input texto mensaje............] [😊] [Enviar]       │
└─────────────────────────────────────────────────────────────┘
```

### Estados del componente:
1. **Idle** - Solo input normal
2. **Files selected** - Muestra previews + zona drag
3. **Uploading** - Progress bar, disable enviar
4. **Error** - Mensaje de error, retry option

### Tipos de preview:
- Imagen: Thumbnail 80x80px
- Video/Audio: Icono + nombre + duración
- Archivo: Icono + nombre + tamaño

---

## 7. Socket Events

### send_message (cliente → servidor):
```json
{
  "channelId": "channel-uuid",
  "content": "Mira este archivo",
  "attachments": [
    {
      "objectKey": "attachments/2026/03/abc123.pdf",
      "cdnUrl": "https://cdn.example.com/attachments/2026/03/abc123.pdf",
      "name": "documento.pdf",
      "size": 1048576,
      "mimeType": "application/pdf",
      "type": "file"
    }
  ]
}
```

### new_message (servidor → cliente):
```json
{
  "id": "msg-uuid",
  "channelId": "channel-uuid",
  "userId": "user-uuid",
  "content": "Mira este archivo",
  "createdAt": "2026-03-28T14:00:00Z",
  "attachments": [
    {
      "id": "att-uuid",
      "type": "file",
      "url": "https://cdn.example.com/...",
      "name": "documento.pdf",
      "size": 1048576,
      "mimeType": "application/pdf"
    }
  ]
}
```

---

## 8. Cloudflare Worker

### Funciones del Worker:
1. `generatePresignedUrl()` - Genera URL presignada PUT para R2
2. `validateFile()` - Valida mimeType y tamaño
3. `handlePresignRequest()` - Routing POST /api/upload/presign

### Headers requeridos en R2:
- `Content-Type` - mimeType del archivo
- `Content-Length` - tamaño exacto

### Configuración R2:
- Bucket: `nexo-attachments`
- Custom Domain: `cdn.example.com` (o subdominio en Workers)
- ACL: Public readable (para CDNs)

---

## 9. Manejo de Errores

| Escenario | Acción |
|----------|--------|
| Presigned URL expira | Frontend pide nueva URL automáticamente |
| Upload falla (network) | Retry con exponential backoff (3 intentos) |
| Upload falla (R2 4xx) | Mostrar error, no enviar mensaje |
| Archivo muy grande | Error antes de subir |
| MimeType inválido | Error antes de subir |
| Rate limit excedido | Mensaje "Demasiadas solicitudes, espera X min" |

---

## 10. Archivos a Modificar

### Backend (nexo-backend)
- `prisma/schema.prisma` - Agregar modelo Attachment
- `src/sockets/index.ts` - Actualizar send_message para recibir attachments
- Migración de base de datos

### Frontend (nexo-desktop)
- `src/views/Dashboard.vue` - Zona de upload y previews
- `src/stores/chat.ts` - Tipos Attachment y lógica de upload
- `src/components/MessageContent.vue` - Ya soporta attachments

### Cloudflare (nexo-cloudflare-worker)
- `src/index.ts` - Endpoint POST /api/upload/presign
- `src/presign.ts` - Lógica de generación de presigned URLs
- `src/validation.ts` - Validación de mimeType y tamaño
- `wrangler.toml` - Configuración de R2 binding

---

## Status

- [x] Arquitectura
- [x] Modelo de Datos
- [x] API Endpoints
- [x] Rate Limits
- [x] Validación
- [x] Componentes Frontend
- [x] Socket Events
- [x] Cloudflare Worker
- [x] Manejo de Errores
- [x] Archivos a Modificar
