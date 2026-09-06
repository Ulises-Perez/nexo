// Rate limiters for the endpoints most exposed to abuse: auth (credential
// stuffing / brute force) and invites (enumeration / spam joins).

import { rateLimit } from 'express-rate-limit';

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many attempts, try again later', code: 'rate_limited' },
});

export const inviteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many attempts, try again later', code: 'rate_limited' },
});
