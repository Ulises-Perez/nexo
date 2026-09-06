// Zod schemas for community role routes.

import { z } from 'zod';
import { shortName, hexColor, uuid } from '../lib/validation';

export const createRoleSchema = z.object({
    name: shortName(50),
    color: hexColor.nullable().optional(),
    permissions: z.number().int().nonnegative().optional(),
});

export const updateRoleSchema = z.object({
    name: shortName(50).optional(),
    color: hexColor.nullable().optional(),
    permissions: z.number().int().nonnegative().optional(),
});

export const setMemberRolesSchema = z.object({
    roleIds: z.array(uuid).max(50),
});
