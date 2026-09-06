// Central application error type and the global error contract:
// { error: string, code: string, details?: unknown }.
// Services throw these (or the factory helpers below) instead of writing
// try/catch + res.status(...) boilerplate in every controller.

import { Request } from 'express';
import { Prisma } from '@prisma/client';

export class AppError extends Error {
    constructor(
        public status: number,
        public code: string,
        message: string,
        public details?: unknown
    ) {
        super(message);
        this.name = 'AppError';
    }
}

export const badRequest = (message: string, details?: unknown) =>
    new AppError(400, 'bad_request', message, details);

export const unauthorized = (message = 'Unauthorized') =>
    new AppError(401, 'unauthorized', message);

export const forbidden = (message = 'Forbidden') =>
    new AppError(403, 'forbidden', message);

export const notFound = (message = 'Not found') =>
    new AppError(404, 'not_found', message);

export const conflict = (message: string) =>
    new AppError(409, 'conflict', message);

export const tooManyRequests = (message = 'Too many requests') =>
    new AppError(429, 'rate_limited', message);

export const serviceUnavailable = (message: string) =>
    new AppError(503, 'service_unavailable', message);

export const badGateway = (message: string) =>
    new AppError(502, 'bad_gateway', message);

// Reads req.user.id or throws unauthorized(). Every authenticated
// controller uses it instead of repeating the null check.
export function requireUserId(req: Request): string {
    const id = req.user?.id;
    if (!id) {
        throw unauthorized();
    }
    return id;
}

// True when err is Prisma.PrismaClientKnownRequestError with the given code.
export function isPrismaError(
    err: unknown,
    code: 'P2002' | 'P2025' | 'P2003'
): boolean {
    return (
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === code
    );
}
