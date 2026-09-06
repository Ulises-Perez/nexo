// Zod schemas for /api/channels and /api/categories routes.

import { z } from 'zod';
import { shortName, uuid } from '../lib/validation';

export const createChannelSchema = z.object({
    name: shortName(100),
    type: z.enum(['text', 'voice']).default('text'),
    categoryId: uuid,
});

export const updateChannelSchema = z.object({
    name: shortName(100),
});

export const createCategorySchema = z.object({
    name: shortName(100),
});

export const updateCategorySchema = z.object({
    name: shortName(100),
});

export const getMessagesQuerySchema = z.object({
    before: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type GetMessagesQuery = z.infer<typeof getMessagesQuerySchema>;
