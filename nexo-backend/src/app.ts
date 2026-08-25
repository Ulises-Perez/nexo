import express, { Application } from 'express';
import cors from 'cors';
import pingRoutes from './routes/ping.routes';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';

import communityRoutes from './routes/community.routes';
import channelRoutes from './routes/channel.routes';
import categoryRoutes from './routes/category.routes';
import inviteRoutes from './routes/invite.routes';
import friendRoutes from './routes/friend.routes';
import updateRoutes from './routes/updates.routes';

const app: Application = express();

// CORS configuration - origins from environment
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map(s => s.trim()) || [];
const corsOptions: cors.CorsOptions = {
    origin: corsOrigins.length > 0 
        ? corsOrigins 
        : false, // Bloquear TODO en producción si no hay origins configurados
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Declaración de Rutas
app.use('/api/ping', pingRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/updates', updateRoutes);

export default app;
