import express, { Application } from 'express';
import cors from 'cors';
import compression from 'compression';
import pingRoutes from './routes/ping.routes';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';

import communityRoutes from './routes/community.routes';
import channelRoutes from './routes/channel.routes';
import categoryRoutes from './routes/category.routes';
import inviteRoutes from './routes/invite.routes';
import friendRoutes from './routes/friend.routes';
import updateRoutes from './routes/updates.routes';
import attachmentRoutes from './routes/attachment.routes';
import { corsOrigins } from './config/cors';
import { authLimiter, inviteLimiter } from './config/rateLimit';
import { notFoundHandler, errorHandler } from './middlewares/errorHandler';

const app: Application = express();

// Railway (and most PaaS) sit behind a reverse proxy; trust the first hop so
// req.ip / express-rate-limit see the real client IP from X-Forwarded-For.
app.set('trust proxy', 1);

// CORS configuration - origins from environment
const corsOptions: cors.CorsOptions = {
    origin: corsOrigins.length > 0 
        ? corsOrigins 
        : false, // Bloquear TODO en producción si no hay origins configurados
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};

app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '64kb' }));

// Declaración de Rutas
app.use('/api/ping', pingRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/invites', inviteLimiter, inviteRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/updates', updateRoutes);
app.use('/api/attachments', attachmentRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
