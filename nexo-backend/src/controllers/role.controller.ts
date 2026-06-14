import { Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { Permissions, ALL_PERMISSIONS, getMemberContext, hasPermission } from '../lib/permissions';
import { emitCommunityUpdated } from '../sockets/io';

function sanitizePermissions(permissions: unknown): number {
    const value = Number(permissions);
    if (!Number.isInteger(value) || value < 0) return 0;
    return value & ALL_PERMISSIONS;
}

function sanitizeColor(color: unknown): string | null {
    if (typeof color !== 'string') return null;
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
}

export class RoleController {
    // GET /api/communities/:id/roles
    public static async getRoles(req: Request, res: Response): Promise<void> {
        try {
            const communityId = req.params.id as string;
            const userId = req.user?.id;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const ctx = await getMemberContext(userId, communityId);
            if (!ctx) {
                res.status(403).json({ error: 'You are not a member of this community' });
                return;
            }

            const roles = await prisma.role.findMany({
                where: { communityId },
                orderBy: { position: 'desc' },
                include: { _count: { select: { members: true } } }
            });

            res.status(200).json(roles);
        } catch (error) {
            console.error('[RoleController - getRoles Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // POST /api/communities/:id/roles
    public static async createRole(req: Request, res: Response): Promise<void> {
        try {
            const communityId = req.params.id as string;
            const userId = req.user?.id;
            const { name, color, permissions } = req.body;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            if (!name || name.trim() === '') {
                res.status(400).json({ error: 'Role name is required' });
                return;
            }

            const ctx = await getMemberContext(userId, communityId);
            if (!hasPermission(ctx, Permissions.MANAGE_ROLES)) {
                res.status(403).json({ error: 'Missing permission: MANAGE_ROLES' });
                return;
            }

            // Solo el dueño (o un admin) puede otorgar ADMINISTRATOR
            let perms = sanitizePermissions(permissions);
            if ((perms & Permissions.ADMINISTRATOR) && !ctx!.isOwner && !(ctx!.permissions & Permissions.ADMINISTRATOR)) {
                perms &= ~Permissions.ADMINISTRATOR;
            }

            const lastRole = await prisma.role.findFirst({
                where: { communityId },
                orderBy: { position: 'desc' }
            });

            const role = await prisma.role.create({
                data: {
                    communityId,
                    name: name.trim(),
                    color: sanitizeColor(color),
                    permissions: perms,
                    position: (lastRole?.position ?? -1) + 1
                }
            });

            emitCommunityUpdated(communityId);
            res.status(201).json(role);
        } catch (error) {
            console.error('[RoleController - createRole Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // PATCH /api/communities/:id/roles/:roleId
    public static async updateRole(req: Request, res: Response): Promise<void> {
        try {
            const communityId = req.params.id as string;
            const roleId = req.params.roleId as string;
            const userId = req.user?.id;
            const { name, color, permissions } = req.body;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const ctx = await getMemberContext(userId, communityId);
            if (!hasPermission(ctx, Permissions.MANAGE_ROLES)) {
                res.status(403).json({ error: 'Missing permission: MANAGE_ROLES' });
                return;
            }

            const role = await prisma.role.findFirst({ where: { id: roleId, communityId } });
            if (!role) {
                res.status(404).json({ error: 'Role not found' });
                return;
            }

            const data: { name?: string; color?: string | null; permissions?: number } = {};
            if (name !== undefined) {
                if (!name || name.trim() === '') {
                    res.status(400).json({ error: 'Role name cannot be empty' });
                    return;
                }
                data.name = name.trim();
            }
            if (color !== undefined) {
                data.color = sanitizeColor(color);
            }
            if (permissions !== undefined) {
                let perms = sanitizePermissions(permissions);
                if ((perms & Permissions.ADMINISTRATOR) && !ctx!.isOwner && !(ctx!.permissions & Permissions.ADMINISTRATOR)) {
                    perms &= ~Permissions.ADMINISTRATOR;
                }
                data.permissions = perms;
            }

            const updated = await prisma.role.update({
                where: { id: roleId },
                data
            });

            emitCommunityUpdated(communityId);
            res.status(200).json(updated);
        } catch (error) {
            console.error('[RoleController - updateRole Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // DELETE /api/communities/:id/roles/:roleId
    public static async deleteRole(req: Request, res: Response): Promise<void> {
        try {
            const communityId = req.params.id as string;
            const roleId = req.params.roleId as string;
            const userId = req.user?.id;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const ctx = await getMemberContext(userId, communityId);
            if (!hasPermission(ctx, Permissions.MANAGE_ROLES)) {
                res.status(403).json({ error: 'Missing permission: MANAGE_ROLES' });
                return;
            }

            const role = await prisma.role.findFirst({ where: { id: roleId, communityId } });
            if (!role) {
                res.status(404).json({ error: 'Role not found' });
                return;
            }

            await prisma.role.delete({ where: { id: roleId } });

            emitCommunityUpdated(communityId);
            res.status(200).json({ success: true });
        } catch (error) {
            console.error('[RoleController - deleteRole Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // PUT /api/communities/:id/members/:userId/roles  — reemplaza los roles de un miembro
    public static async setMemberRoles(req: Request, res: Response): Promise<void> {
        try {
            const communityId = req.params.id as string;
            const targetUserId = req.params.userId as string;
            const userId = req.user?.id;
            const { roleIds } = req.body;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            if (!Array.isArray(roleIds)) {
                res.status(400).json({ error: 'roleIds must be an array' });
                return;
            }

            const ctx = await getMemberContext(userId, communityId);
            if (!hasPermission(ctx, Permissions.MANAGE_ROLES)) {
                res.status(403).json({ error: 'Missing permission: MANAGE_ROLES' });
                return;
            }

            const member = await prisma.communityMember.findUnique({
                where: { userId_communityId: { userId: targetUserId, communityId } }
            });

            if (!member) {
                res.status(404).json({ error: 'Member not found' });
                return;
            }

            // Validar que todos los roles pertenezcan a esta comunidad
            const validRoles = await prisma.role.findMany({
                where: { id: { in: roleIds }, communityId },
                select: { id: true }
            });
            const validRoleIds = validRoles.map(r => r.id);

            await prisma.$transaction([
                prisma.memberRole.deleteMany({ where: { memberId: member.id } }),
                prisma.memberRole.createMany({
                    data: validRoleIds.map(roleId => ({ memberId: member.id, roleId }))
                })
            ]);

            emitCommunityUpdated(communityId);
            res.status(200).json({ success: true, roleIds: validRoleIds });
        } catch (error) {
            console.error('[RoleController - setMemberRoles Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}
