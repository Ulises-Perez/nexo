// Zod schemas for friend/DM routes, composing shared primitives from lib/validation.

import { z } from 'zod';
import { uuid } from '../lib/validation';

export const sendRequestSchema = z.object({
    receiverId: uuid
});

export const requestIdParams = z.object({
    id: uuid
});

export const userIdParams = z.object({
    userId: uuid
});

export const channelIdParams = z.object({
    channelId: uuid
});
