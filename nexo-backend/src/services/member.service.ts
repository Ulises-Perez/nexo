import { prisma } from '../db/prisma';
import {
    Permissions,
    getMemberContext,
    hasPermission,
    getHighestRolePosition,
    canManageMember,
} from '../lib/permissions';
import { emitCommunityUpdated, emitMemberUnbanned, emitRemovedFromCommunity } from '../sockets/io';
import { badRequest, conflict, forbidden, isPrismaError, notFound } from '../lib/errors';

export async function getMembers(userId: string, communityId: string) {
    const ctx = await getMemberContext(userId, communityId);
    if (!ctx) {
        throw forbidden('You are not a member of this community');
    }

    const members = await prisma.communityMember.findMany({
        where: { communityId },
        include: {
            user: {
                select: { id: true, username: true, tag: true, avatarUrl: true, status: true },
            },
            roles: {
                include: {
                    role: { select: { id: true, name: true, color: true, position: true, permissions: true } },
                },
            },
        },
        orderBy: { joinedAt: 'asc' },
    });

    const community = await prisma.community.findUnique({
        where: { id: communityId },
        select: { ownerId: true },
    });

    return members.map((m) => ({
        id: m.id,
        userId: m.userId,
        joinedAt: m.joinedAt,
        isOwner: m.userId === community?.ownerId,
        user: m.user,
        roles: m.roles.map((mr) => mr.role).sort((a, b) => b.position - a.position),
    }));
}

// DELETE /api/communities/:id/members/:userId — kick a member
export async function kickMember(userId: string, communityId: string, targetUserId: string) {
    const ctx = await getMemberContext(userId, communityId);
    if (!hasPermission(ctx, Permissions.KICK_MEMBERS)) {
        throw forbidden('Missing permission: KICK_MEMBERS');
    }

    const community = await prisma.community.findUnique({ where: { id: communityId } });
    if (!community) {
        throw notFound('Community not found');
    }

    if (targetUserId === community.ownerId) {
        throw badRequest('Cannot kick the community owner');
    }
    if (targetUserId === userId) {
        throw badRequest('You cannot kick yourself');
    }

    const targetMember = await prisma.communityMember.findUnique({
        where: { userId_communityId: { userId: targetUserId, communityId } },
        select: { id: true },
    });
    if (!targetMember) {
        throw notFound('Member not found');
    }

    const [actorHighest, targetHighest] = await Promise.all([
        getHighestRolePosition(ctx!.memberId),
        getHighestRolePosition(targetMember.id),
    ]);
    if (!canManageMember(ctx!, actorHighest, false, targetHighest)) {
        throw forbidden('You can only kick members below your highest role');
    }

    await prisma.communityMember.delete({
        where: { userId_communityId: { userId: targetUserId, communityId } },
    });

    await emitRemovedFromCommunity(targetUserId, communityId, 'kick');
    emitCommunityUpdated(communityId);
    return { success: true };
}

// POST /api/communities/:id/bans — ban a user (kicks them if they are a member)
export async function banMember(
    userId: string,
    communityId: string,
    targetUserId: string,
    reason: string | null
) {
    const ctx = await getMemberContext(userId, communityId);
    if (!hasPermission(ctx, Permissions.BAN_MEMBERS)) {
        throw forbidden('Missing permission: BAN_MEMBERS');
    }

    const community = await prisma.community.findUnique({ where: { id: communityId } });
    if (!community) {
        throw notFound('Community not found');
    }

    if (targetUserId === community.ownerId) {
        throw badRequest('Cannot ban the community owner');
    }
    if (targetUserId === userId) {
        throw badRequest('You cannot ban yourself');
    }

    // A non-member can be banned pre-emptively; they have no roles (-1).
    const targetMember = await prisma.communityMember.findUnique({
        where: { userId_communityId: { userId: targetUserId, communityId } },
        select: { id: true },
    });
    const [actorHighest, targetHighest] = await Promise.all([
        getHighestRolePosition(ctx!.memberId),
        targetMember ? getHighestRolePosition(targetMember.id) : Promise.resolve(-1),
    ]);
    if (!canManageMember(ctx!, actorHighest, false, targetHighest)) {
        throw forbidden('You can only ban members below your highest role');
    }

    try {
        await prisma.$transaction(async (tx) => {
            const existingBan = await tx.communityBan.findUnique({
                where: { communityId_userId: { communityId, userId: targetUserId } },
                select: { id: true },
            });
            if (existingBan) {
                throw conflict('Already banned');
            }

            await tx.communityBan.create({
                data: { communityId, userId: targetUserId, reason, bannedById: userId },
            });
            await tx.communityMember.deleteMany({ where: { userId: targetUserId, communityId } });
        });
    } catch (err) {
        if (isPrismaError(err, 'P2002')) {
            throw conflict('Already banned');
        }
        throw err;
    }

    await emitRemovedFromCommunity(targetUserId, communityId, 'ban');
    emitCommunityUpdated(communityId);
    return { success: true };
}

export async function getBans(userId: string, communityId: string) {
    const ctx = await getMemberContext(userId, communityId);
    if (!hasPermission(ctx, Permissions.BAN_MEMBERS)) {
        throw forbidden('Missing permission: BAN_MEMBERS');
    }

    return prisma.communityBan.findMany({
        where: { communityId },
        include: {
            user: { select: { id: true, username: true, tag: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
    });
}

// DELETE /api/communities/:id/bans/:userId — remove a ban
export async function unbanMember(userId: string, communityId: string, targetUserId: string) {
    const ctx = await getMemberContext(userId, communityId);
    if (!hasPermission(ctx, Permissions.BAN_MEMBERS)) {
        throw forbidden('Missing permission: BAN_MEMBERS');
    }

    const { count } = await prisma.communityBan.deleteMany({
        where: { communityId, userId: targetUserId },
    });
    if (count === 0) {
        throw notFound('Ban not found');
    }

    // Inform the unbanned user so their client can react (informational only)
    emitMemberUnbanned(targetUserId, communityId);

    return { success: true };
}
