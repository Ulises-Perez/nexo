// Zod schemas for /api/communities and /api/invites routes.

import { z } from 'zod';
import { shortName, longText, nullableHttpUrl } from '../lib/validation';

export const createCommunitySchema = z.object({
    name: shortName(100),
    iconUrl: nullableHttpUrl.optional(),
});

export const updateCommunitySchema = z.object({
    name: shortName(100).optional(),
    iconUrl: nullableHttpUrl.optional(),
    description: longText(500).nullable().optional(),
});

export type CreateCommunityInput = z.infer<typeof createCommunitySchema>;
export type UpdateCommunityInput = z.infer<typeof updateCommunitySchema>;
