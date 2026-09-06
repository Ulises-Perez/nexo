import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

function getJwtSecret(): string {
    if (!JWT_SECRET) {
        throw new Error('JWT_SECRET environment variable is not set');
    }
    return JWT_SECRET;
}

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: Missing or invalid token format', code: 'unauthorized' });
        return;
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, getJwtSecret()) as { userId: string };

        // Inyectamos el usuario en el request
        req.user = { id: decoded.userId };

        next();
    } catch (error) {
        // Missing, malformed, expired or invalid token: all are 401 (the
        // client is simply not authenticated, not "forbidden").
        res.status(401).json({ error: 'Unauthorized: Invalid or expired token', code: 'unauthorized' });
    }
};
