import { Request, Response } from 'express';
import { requireUserId } from '../lib/errors';
import * as roleService from '../services/role.service';
import { createRoleSchema, updateRoleSchema, setMemberRolesSchema } from '../schemas/role.schema';

export class RoleController {
    // GET /api/communities/:id/roles
    public static async getRoles(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const communityId = req.params.id as string;
        const roles = await roleService.getRoles(userId, communityId);
        res.status(200).json(roles);
    }

    // POST /api/communities/:id/roles
    public static async createRole(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const communityId = req.params.id as string;
        // Validated here rather than in the route so it stays correct
        // regardless of which schema name the route file wires up.
        const body = createRoleSchema.parse(req.body);
        const role = await roleService.createRole(userId, communityId, body);
        res.status(201).json(role);
    }

    // PATCH /api/communities/:id/roles/:roleId
    public static async updateRole(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const communityId = req.params.id as string;
        const roleId = req.params.roleId as string;
        const body = updateRoleSchema.parse(req.body);
        const role = await roleService.updateRole(userId, communityId, roleId, body);
        res.status(200).json(role);
    }

    // DELETE /api/communities/:id/roles/:roleId
    public static async deleteRole(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const communityId = req.params.id as string;
        const roleId = req.params.roleId as string;
        const result = await roleService.deleteRole(userId, communityId, roleId);
        res.status(200).json(result);
    }

    // PUT /api/communities/:id/members/:userId/roles — replace a member's roles
    public static async setMemberRoles(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const communityId = req.params.id as string;
        const targetUserId = req.params.userId as string;
        const { roleIds } = setMemberRolesSchema.parse(req.body);
        const result = await roleService.setMemberRoles(userId, communityId, targetUserId, roleIds);
        res.status(200).json(result);
    }
}
