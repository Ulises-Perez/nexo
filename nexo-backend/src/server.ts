import 'dotenv/config';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';

const PORT = process.env.PORT || 4000;

// Se asigna más abajo, apenas se crea — declarado ya (no TDZ) para que el
// crash handler registrado a continuación pueda referenciarlo sin riesgo,
// incluso si algo tira una excepción antes de esa línea.
let server: http.Server | null = null;
let shuttingDown = false;

// Política: loguear y salir de forma acotada, NO quedarse vivo para siempre.
// Node mismo advierte que seguir corriendo tras un uncaughtException deja el
// proceso en un estado indefinido (memoria/handles potencialmente corruptos).
// Acá no hay nada que haga "nunca salir" más seguro que eso — no hay locks
// retenidos ni transacciones multi-paso — y el cliente de escritorio ya
// tolera bien un reinicio limpio: reconecta el socket solo y reingresa solo
// al mismo canal de voz si estaba conectado (nexo-desktop/src/stores/voice.ts).
// Un proceso que muere y reinicia además deja evidencia visible (logs de
// Railway) de que algo se rompió, en vez de esconder el bug para siempre.
const crashShutdown = (kind: string, err: unknown) => {
    console.error(`[Nexo Backend] ${kind}:`, err);

    if (shuttingDown) return;
    shuttingDown = true;

    try {
        server?.close(() => process.exit(1));
    } catch (closeError) {
        console.error('[Nexo Backend] Error cerrando el servidor durante el shutdown:', closeError);
    }

    // Deadline duro: si algo no drena a tiempo (conexiones de socket.io vivas
    // suelen impedir que close() complete), salir igual.
    setTimeout(() => process.exit(1), 3000).unref();
};

process.on('uncaughtException', (error) => crashShutdown('uncaughtException', error));
process.on('unhandledRejection', (reason) => crashShutdown('unhandledRejection', reason));

import { setupSockets } from './sockets/index';
import { setIO } from './sockets/io';
import { corsOrigins } from './config/cors';
import { createSocketAdapter } from './config/redis';

async function main(): Promise<void> {
    // Crear el servidor HTTP basado en la app de Express
    server = http.createServer(app);

    // Inicializar Socket.io adjunto al servidor HTTP
    const io = new SocketIOServer(server, {
        cors: {
            // Same allowlist as the HTTP API; blocked entirely when unset.
            origin: corsOrigins.length > 0 ? corsOrigins : false,
            methods: ['GET', 'POST'],
            credentials: true
        },
        // Cap per-event payload size (default is 1 MB).
        maxHttpBufferSize: 512 * 1024,
        // Longer heartbeat window: desktop clients that suspend briefly should
        // not flap online/offline and trigger a presence broadcast each time.
        pingInterval: 25000,
        pingTimeout: 60000
    });

    // Optional cross-replica adapter (only when REDIS_URL is set).
    const adapter = await createSocketAdapter();
    if (adapter) io.adapter(adapter);

    // Configurar y habilitar los eventos y autenticación de Socket.io
    setIO(io);
    setupSockets(io);

    // Arrancar el Servidor
    server.listen(PORT, () => {
        console.log(`🚀 [Nexo Backend] Servidor HTTP y Socket.io escuchando en el puerto ${PORT}`);
    });
}

main().catch((error) => crashShutdown('bootstrap', error));
