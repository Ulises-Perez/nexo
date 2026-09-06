// Zod schemas for /api/auth routes.

import { z } from 'zod';
import { username, password, httpUrl } from '../lib/validation';

// IMPORTANT: do NOT reuse the shared `email` primitive here — it lowercases
// the input, and we have not verified that every existing row in the
// database stores its email in lowercase. Lowercasing on read/write here
// could stop existing users from logging in. Keep the lookup semantics
// exactly as they are today (case-sensitive equality on whatever was
// stored at registration time).
const emailInput = z.string().trim().email().max(254);

export const registerSchema = z.object({
    username,
    email: emailInput,
    password,
    avatarUrl: httpUrl.optional(),
});

export const loginSchema = z.object({
    email: emailInput,
    password: z.string().min(1),
});
