import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';

// Optional Socket.io Redis adapter. When REDIS_URL is set, room broadcasts
// and `fetchSockets`/`socketsJoin` calls are propagated across every backend
// replica through Redis pub/sub. Without it Socket.io keeps its in-memory
// adapter, which is correct for a single instance.
//
// NOTE: the voice roster (sockets/voiceState.ts) and the presence counters
// (sockets/index.ts userSockets / pendingOffline) are still per-process.
// Keep a single replica until those are moved to Redis as well.
export async function createSocketAdapter(): Promise<ReturnType<typeof createAdapter> | null> {
    const url = process.env.REDIS_URL?.trim();
    if (!url) return null;

    const pub = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
    const sub = pub.duplicate();

    await Promise.all([pub.connect(), sub.connect()]);
    console.log('[Socket.io] Redis adapter enabled');

    return createAdapter(pub, sub);
}
