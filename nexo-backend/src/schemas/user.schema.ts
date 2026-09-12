// Zod schemas for /api/users routes.

import { z } from 'zod';
import { username, hexColor, httpUrl, longText, shortName, idParam } from '../lib/validation';

export { idParam };

// Self-declared connection platforms shown on a profile card.
export const CONNECTION_PLATFORMS = [
    'playstation',
    'xbox',
    'steam',
    'spotify',
    'twitch',
    'youtube',
    'github',
    'twitter',
    'instagram',
    'tiktok',
    'riot',
    'epicgames',
] as const;

// Optional field: absent (undefined) means "leave untouched" in a PATCH;
// null or an empty/whitespace-only string both clear the field to null;
// otherwise the trimmed value is kept (validated against `max`).
const nullableText = (max: number) =>
    z
        .union([longText(max), z.null()])
        .optional()
        .transform((v) => (v === undefined ? undefined : v === null ? null : v.length > 0 ? v : null));

// Same "absent/blank -> null" collapsing, but for a URL field: a non-empty
// value must be a valid http(s) URL.
const nullableUrl = z
    .union([z.literal(''), httpUrl, z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : v));

// Same collapsing for a hex color field.
const nullableHex = z
    .union([z.literal(''), hexColor, z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : v));

// Bounded, non-strict-enum strings (mirrors voiceState.ts's
// validateSharingInfo): a new preset/codec/optimizeFor value added on the
// client never requires a backend deploy. `null` is intentionally not
// accepted — clearing the preference is not a product need, and Prisma's
// `Json?` update input treats plain `null` differently from `Prisma.JsonNull`.
export const screenSharePrefsSchema = z
    .object({
        presetId: z.string().trim().min(1).max(16),
        optimizeFor: z.string().trim().min(1).max(16),
        codec: z.string().trim().min(1).max(8),
    })
    .strict();

export const updateMeSchema = z.object({
    username: username.optional(),
    avatarUrl: nullableUrl,
    bannerUrl: nullableUrl,
    bannerColor: nullableHex,
    accentColor: nullableHex,
    bio: nullableText(190),
    pronouns: nullableText(40),
    customStatus: nullableText(128),
    screenSharePrefs: screenSharePrefsSchema.optional(),
});

export const searchQuerySchema = z.object({
    q: z.string().trim().min(1).max(50),
});

export const addConnectionSchema = z.object({
    platform: z
        .string()
        .trim()
        .toLowerCase()
        .refine((v) => (CONNECTION_PLATFORMS as readonly string[]).includes(v), 'Invalid platform'),
    name: shortName(80),
    // Absent, null or blank all mean "no URL" for a connection.
    url: z
        .union([longText(300), z.null()])
        .optional()
        .transform((v) => (v === undefined || v === null ? null : v.length > 0 ? v : null)),
});
