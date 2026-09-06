// Shared zod primitives composed by every src/schemas/*.schema.ts file.
// Keeping these in one place avoids duplicated regexes across schemas.

import { z } from 'zod';

export const uuid = z.string().uuid();

export const username = z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{3,30}$/, 'Username must be 3-30 chars, letters, numbers or underscore');

export const email = z.string().trim().toLowerCase().email().max(254);

// bcrypt truncates at 72 bytes.
export const password = z.string().min(8).max(72);

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const httpUrl = z
    .string()
    .trim()
    .url()
    .max(500)
    .refine((u) => /^https?:\/\//i.test(u), 'Must be http(s)');

export const nullableHttpUrl = httpUrl.nullable();

export const shortName = (max = 100) => z.string().trim().min(1).max(max);

export const longText = (max: number) => z.string().trim().max(max);

export const idParam = z.object({ id: uuid });
