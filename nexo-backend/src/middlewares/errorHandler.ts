// Single global error contract for the API: { error, code, details? }.
// notFoundHandler is mounted after all routes; errorHandler is mounted last
// so Express 5 forwards every rejected controller/service promise here.

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors';

export function notFoundHandler(req: Request, res: Response): void {
    res.status(404).json({ error: 'Route not found', code: 'not_found' });
}

export function errorHandler(
    err: unknown,
    req: Request,
    res: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    next: NextFunction
): void {
    if (err instanceof AppError) {
        res.status(err.status).json({
            error: err.message,
            code: err.code,
            ...(err.details !== undefined ? { details: err.details } : {}),
        });
        return;
    }

    if (err instanceof ZodError) {
        res.status(400).json({
            error: 'Validation failed',
            code: 'validation_error',
            details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
        return;
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
            res.status(409).json({ error: 'Resource already exists', code: 'conflict' });
            return;
        }
        if (err.code === 'P2025') {
            res.status(404).json({ error: 'Not found', code: 'not_found' });
            return;
        }
        if (err.code === 'P2003') {
            res.status(404).json({ error: 'Related resource not found', code: 'not_found' });
            return;
        }
    }

    if (
        (err instanceof Error &&
            (err as { type?: string }).type === 'entity.too.large') ||
        (err instanceof SyntaxError && (err as { status?: number }).status === 400)
    ) {
        res.status(400).json({ error: 'Bad request', code: 'bad_request' });
        return;
    }

    console.error('[Unhandled]', err);
    res.status(500).json({ error: 'Internal Server Error', code: 'internal_error' });
}
