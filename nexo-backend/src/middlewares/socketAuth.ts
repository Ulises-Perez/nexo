import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-nexo-dev';

export interface AuthenticatedSocket extends Socket {
    data: {
        userId: string;
    };
}

export const socketAuth = (socket: Socket, next: (err?: Error) => void) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
        return next(new Error('Authentication error'));
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

        // Inyectamos el userId en la propiedad data (recomendado por la documentación de Socket.io 4+)
        socket.data.userId = decoded.userId;
        next();
    } catch (error) {
        return next(new Error('Authentication error'));
    }
};
