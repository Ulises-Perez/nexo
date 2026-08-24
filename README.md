# Nexo

Nexo is a personal project built as a monorepo with three independent parts: a **REST + WebSocket API**, a **cross-platform desktop client**, and a **Cloudflare Worker** that handles file uploads to object storage.

> [!IMPORTANT]
> **Proprietary software — All Rights Reserved.** This repository is published for portfolio/reference purposes only. You may **not** use, copy, modify, or distribute any part of it. See [LICENSE](LICENSE).

---

## Features

- **Communities** (servers) with owners, members, and roles
- **Categories & channels** to organize conversations inside a community
- **Direct messages** and one-to-one **conversations** between friends
- **Friends system** — friend requests (pending / accepted / rejected) and friendships
- **Real-time messaging** over WebSockets (typing, delivery, presence/status)
- **File attachments** — images, video, audio, and generic files via presigned uploads to Cloudflare R2
- **Message editing** and read receipts
- **User profiles** — avatar, status, and account management
- **JWT authentication** with hashed passwords

## Architecture

```
                +------------------------+
                |   nexo-desktop (Tauri) |
                |   Vue 3 + Pinia        |
                +-----------+------------+
                            |
              REST (axios)  |  WebSocket (socket.io)
                            v
                +------------------------+        presigned PUT
                |   nexo-backend (API)   |  <-------------------+
                |   Express + Prisma     |                      |
                |   Socket.io + JWT      |                      |
                +-----------+------------+                      |
                            |                                   |
                            v                          +--------+---------+
                     PostgreSQL (Prisma)               | nexo-cloudflare- |
                                                        | worker (R2)      |
                                                        +------------------+
```

| Component | Stack |
| --- | --- |
| **nexo-backend** | Node.js, Express 5, TypeScript, Prisma (PostgreSQL), Socket.io, JWT, bcrypt |
| **nexo-desktop** | Tauri 2, Vue 3, Pinia, Vue Router, Tailwind CSS, Vite, Axios, Socket.io-client |
| **nexo-cloudflare-worker** | Cloudflare Workers, Wrangler, R2 object storage (presigned URLs) |

## Repository structure

```
.
├── nexo-backend/             # REST API + real-time server
│   ├── prisma/               # Prisma schema & migrations
│   └── src/
│       ├── controllers/      # Request handlers (auth, community, channel, friend, ...)
│       ├── routes/           # Express route definitions
│       ├── services/         # Business logic
│       ├── middlewares/      # Auth & socket auth
│       ├── sockets/          # Socket.io event handlers
│       ├── db/               # Prisma client
│       └── lib/              # Shared helpers
├── nexo-desktop/             # Tauri + Vue desktop client
│   └── src/
│       ├── api/              # Axios instance & API calls
│       ├── stores/           # Pinia stores
│       ├── views/            # Route-level screens
│       ├── components/       # UI components
│       ├── composables/      # Reusable composition logic
│       └── router/           # Vue Router config
├── nexo-cloudflare-worker/   # File-upload worker (R2 presigned URLs)
│   └── src/
│       ├── index.ts          # Worker entrypoint
│       ├── presign.ts        # Presigned URL generation
│       └── validation.ts     # Upload validation
└── docs/                     # Design notes & feature plans
```

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) (package manager used across the monorepo)
- A PostgreSQL database
- A [Cloudflare](https://www.cloudflare.com/) account with an R2 bucket (only needed for file uploads)
- [Rust](https://www.rust-lang.org/tools/install) toolchain (required by Tauri for the desktop build)

### 1. Backend API

```bash
cd nexo-backend
pnpm install
cp .env.example .env          # then fill in your values
pnpm prisma migrate dev       # apply the database schema
pnpm dev                      # start the API in watch mode
```

### 2. Desktop client

```bash
cd nexo-desktop
pnpm install
cp .env.example .env          # then point it at your API/worker URLs
pnpm tauri dev                # run the desktop app
```

### 3. Upload worker (optional)

```bash
cd nexo-cloudflare-worker
pnpm install
pnpm dev                      # local worker via wrangler
pnpm deploy                   # deploy to Cloudflare
```

## Environment variables

### `nexo-backend/.env`

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma |
| `JWT_SECRET` | Secret used to sign and verify JWT access tokens |
| `PORT` | Port the API server listens on |
| `CORS_ORIGINS` | Comma-separated list of allowed client origins |
| `NODE_ENV` | `development` or `production` |

### `nexo-desktop/.env`

| Variable | Description |
| --- | --- |
| `VITE_API_URL` | Base URL of the Nexo REST API |
| `VITE_SOCKET_URL` | URL of the Socket.io real-time server |
| `VITE_UPLOAD_URL` | URL of the Cloudflare upload worker |

## Available scripts

**Backend** — `pnpm dev` (watch), `pnpm build` (compile TypeScript), `pnpm start` (run build).

**Desktop** — `pnpm dev` (Vite), `pnpm build` (type-check + build), `pnpm tauri dev` / `pnpm tauri build`.

**Worker** — `pnpm dev` (local), `pnpm deploy` (publish).

## License

This project is **proprietary and confidential**. All rights reserved. See [LICENSE](LICENSE) for details.

© 2026 Ulises Perez
