import { prisma } from '../db/prisma';
import {
    Permissions,
    ALL_PERMISSIONS,
    getMemberContext,
    hasPermission,
    getHighestRolePosition,
    canManageMember,
    canManageRole,
} from '../lib/permissions';
import { emitCommunityUpdated } from '../sockets/io';
import { forbidden, notFound } from '../lib/errors';

// Masks out any bit outside the known permission set. Zod already guarantees
// a non-negative integer (or undefined -> defaults to 0/no permissions).
function sanitizePermissions(permissions: number | undefined): number {
    return (permissions ?? 0) & ALL_PERMISSIONS;
}

// Only the owner (or an actor who already holds ADMINISTRATOR) may grant it.
function stripAdminIfUnauthorized(perms: number, ctx: { isOwner: boolean; permissions: number }): number {
    if ((perms & Permissions.ADMINISTRATOR) && !ctx.isOwner && !(ctx.permissions & Permissions.ADMINISTRATOR)) {
        return perms & ~Permissions.ADMINISTRATOR;
    }
    return perms;
}

export async function getRoles(userId: string, communityId: string) {
    const ctx = await getMemberContext(userId, communityId);
    if (!ctx) {
        throw forbidden('You are not a member of this community');
    }

    return prisma.role.findMany({
        where: { communityId },
        orderBy: { position: 'desc' },
        include: { _count: { select: { members: true } } },
    });
}

export interface RoleInput {
    name?: string;
    color?: string | null;
    permissions?: number;
}

export async function createRole(userId: string, communityId: string, input: RoleInput) {
    const ctx = await getMemberContext(userId, communityId);
    if (!hasPermission(ctx, Permissions.MANAGE_ROLES)) {
        throw forbidden('Missing permission: MANAGE_ROLES');
    }

    const perms = stripAdminIfUnauthorized(sanitizePermissions(input.permissions), ctx!);

    const lastRole = await prisma.role.findFirst({
        where: { communityId },
        orderBy: { position: 'desc' },
    });

    const role = await prisma.role.create({
        data: {
            communityId,
            name: input.name!,
            color: input.color ?? null,
            permissions: perms,
            position: (lastRole?.position ?? -1) + 1,
        },
    });

    emitCommunityUpdated(communityId);
    return role;
}

export async function updateRole(userId: string, communityId: string, roleId: string, input: RoleInput) {
    const ctx = await getMemberContext(userId, communityId);
    if (!hasPermission(ctx, Permissions.MANAGE_ROLES)) {
        throw forbidden('Missing permission: MANAGE_ROLES');
    }

    const role = await prisma.role.findFirst({ where: { id: roleId, communityId } });
    if (!role) {
        throw notFound('Role not found');
    }

    const actorHighest = await getHighestRolePosition(ctx!.memberId);
    if (!canManageRole(ctx!, actorHighest, role.position)) {
        throw forbidden('You can only edit roles below your highest role');
    }

    const data: { name?: string; color?: string | null; permissions?: number } = {};
    if (input.name !== undefined) {
        data.name = input.name;
    }
    if (input.color !== undefined) {
        data.color = input.color;
    }
    if (input.permissions !== undefined) {
        data.permissions = stripAdminIfUnauthorized(sanitizePermissions(input.permissions), ctx!);
    }

    const updated = await prisma.role.update({ where: { id: roleId }, data });

    emitCommunityUpdated(communityId);
    return updated;
}

export async function deleteRole(userId: string, communityId: string, roleId: string) {
    const ctx = await getMemberContext(userId, communityId);
    if (!hasPermission(ctx, Permissions.MANAGE_ROLES)) {
        throw forbidden('Missing permission: MANAGE_ROLES');
    }

    const role = await prisma.role.findFirst({ where: { id: roleId, communityId } });
    if (!role) {
        throw notFound('Role not found');
    }

    const actorHighest = await getHighestRolePosition(ctx!.memberId);
    if (!canManageRole(ctx!, actorHighest, role.position)) {
        throw forbidden('You can only delete roles below your highest role');
    }

    await prisma.role.delete({ where: { id: roleId } });

    emitCommunityUpdated(communityId);
    return { success: true };
}

// PUT /api/communities/:id/members/:userId/roles — replace a member's roles
export async function setMemberRoles(
    userId: string,
    communityId: string,
    targetUserId: string,
    roleIds: string[]
) {
    const ctx = await getMemberContext(userId, communityId);
    if (!hasPermission(ctx, Permissions.MANAGE_ROLES)) {
        throw forbidden('Missing permission: MANAGE_ROLES');
    }

    const member = await prisma.communityMember.findUnique({
        where: { userId_communityId: { userId: targetUserId, communityId } },
        include: { community: { select: { ownerId: true } } },
    });
    if (!member) {
        throw notFound('Member not found');
    }

    // Hierarchy: nobody edits the owner's roles, a non-owner cannot edit
    // their own roles, and the target must sit below the actor.
    if (targetUserId === userId && !ctx!.isOwner) {
        throw forbidden('You cannot change your own roles');
    }

    const targetIsOwner = member.community.ownerId === targetUserId;
    const [actorHighest, targetHighest] = await Promise.all([
        getHighestRolePosition(ctx!.memberId),
        getHighestRolePosition(member.id),
    ]);

    if (!canManageMember(ctx!, actorHighest, targetIsOwner, targetHighest)) {
        throw forbidden('You can only manage members below your highest role');
    }

    // Every role assigned must belong to this community...
    const validRoles = await prisma.role.findMany({
        where: { id: { in: roleIds }, communityId },
        select: { id: true, position: true },
    });

    // ...and sit below the actor's highest role.
    const tooHigh = validRoles.find((r) => !canManageRole(ctx!, actorHighest, r.position));
    if (tooHigh) {
        throw forbidden('You can only assign roles below your highest role');
    }

    const validRoleIds = validRoles.map((r) => r.id);

    await prisma.$transaction([
        prisma.memberRole.deleteMany({ where: { memberId: member.id } }),
        prisma.memberRole.createMany({
            data: validRoleIds.map((roleId) => ({ memberId: member.id, roleId })),
        }),
    ]);

    emitCommunityUpdated(communityId);
    return { success: true, roleIds: validRoleIds };
}
