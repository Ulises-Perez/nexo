// Zod schemas for community member/ban routes.

import { z } from 'zod';
import { uuid, longText } from '../lib/validation';

export const banMemberSchema = z.object({
    userId: uuid,
    // Absent, null or blank all collapse to "no reason".
    reason: z
        .union([longText(200), z.null()])
        .optional()
        .transform((v) => (v === undefined || v === null ? null : v.length > 0 ? v : null)),
});
