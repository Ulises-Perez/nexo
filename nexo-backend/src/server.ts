import 'dotenv/config';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';

const PORT = process.env.PORT || 4000;

// Crear el servidor HTTP basado en la app de Express
const server = http.createServer(app);

import { setupSockets } from './sockets/index';
import { setIO } from './sockets/io';

// Inicializar Socket.io adjunto al servidor HTTP
const io = new SocketIOServer(server, {
    cors: {
        origin: '*', // Se ajustará luego a las URLs locales de Vite/Tauri
        methods: ['GET', 'POST']
    }
});

// Configurar y habilitar los eventos y autenticación de Socket.io
setIO(io);
setupSockets(io);

// Arrancar el Servidor
server.listen(PORT, () => {
    console.log(`🚀 [Nexo Backend] Servidor HTTP y Socket.io escuchando en el puerto ${PORT}`);
});
