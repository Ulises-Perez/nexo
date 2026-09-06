import { prisma } from '../db/prisma';
import { Permissions, ALL_PERMISSIONS, getMemberContext, hasPermission } from '../lib/permissions';
import {
    emitCommunityUpdated,
    emitMemberJoined,
    emitJoinCommunityRoom,
    getIO,
    MemberJoinedPayload,
} from '../sockets/io';
import { forbidden, notFound, badRequest, isPrismaError } from '../lib/errors';
import { generateInviteCode as createInviteCode } from '../lib/inviteCode';
import type { CreateCommunityInput, UpdateCommunityInput } from '../schemas/community.schema';

export async function getUserCommunities(userId: string) {
    // Communities where the user is owner OR member, including channels.
    const communities = await prisma.community.findMany({
        where: {
            OR: [
                { ownerId: userId },
                { members: { some: { userId } } },
            ],
        },
        include: {
            categories: {
                include: {
                    channels: {
                        orderBy: { order: 'asc' },
                    },
                },
                orderBy: { order: 'asc' },
            },
            roles: {
                orderBy: { position: 'desc' },
            },
            members: {
                where: { userId },
                include: {
                    roles: { include: { role: { select: { permissions: true } } } },
                },
            },
            _count: { select: { members: true } },
        },
        orderBy: { createdAt: 'asc' },
    });

    // Aggregate the user's effective permissions per community.
    return communities.map(({ members, ...community }) => {
        const myMember = members[0];
        const isOwner = community.ownerId === userId;
        let myPermissions = myMember
            ? myMember.roles.reduce((acc, mr) => acc | mr.role.permissions, 0)
            : 0;
        if (isOwner || (myPermissions & Permissions.ADMINISTRATOR)) {
            myPermissions = ALL_PERMISSIONS;
        }
        return { ...community, isOwner, myPermissions, memberCount: community._count.members };
    });
}

export async function createCommunity(userId: string, data: CreateCommunityInput) {
    const newCommunity = await prisma.community.create({
        data: {
            name: data.name,
            iconUrl: data.iconUrl ?? null,
            ownerId: userId,
            members: {
                create: {
                    userId,
                    role: 'owner',
                },
            },
            categories: {
                create: {
                    name: 'General',
                    order: 0,
                    channels: {
                        create: {
                            name: 'general',
                            type: 'text',
                            order: 0,
                        },
                    },
                },
            },
        },
    });

    emitJoinCommunityRoom(userId, newCommunity.id);
    return newCommunity;
}

export async function updateCommunity(userId: string, communityId: string, data: UpdateCommunityInput) {
    const ctx = await getMemberContext(userId, communityId);
    if (!hasPermission(ctx, Permissions.MANAGE_COMMUNITY)) {
        throw forbidden('Missing permission: MANAGE_COMMUNITY');
    }

    const updateData: { name?: string; iconUrl?: string | null; description?: string | null } = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.iconUrl !== undefined) updateData.iconUrl = data.iconUrl;
    if (data.description !== undefined) updateData.description = data.description;

    const updated = await prisma.community.update({
        where: { id: communityId },
        data: updateData,
    });

    emitCommunityUpdated(communityId);
    return updated;
}

export async function deleteCommunity(userId: string, communityId: string) {
    const community = await prisma.community.findUnique({ where: { id: communityId } });
    if (!community) throw notFound('Community not found');

    if (community.ownerId !== userId) {
        throw forbidden('Only the owner can delete the community');
    }

    await prisma.community.delete({ where: { id: communityId } });

    // Notify and evict connected members only after the delete has committed.
    getIO()?.to(`community:${communityId}`).emit('community_deleted', { communityId });
    getIO()?.in(`community:${communityId}`).socketsLeave(`community:${communityId}`);

    return { success: true };
}

export async function generateInviteCode(userId: string, communityId: string) {
    const community = await prisma.community.findUnique({ where: { id: communityId } });
    if (!community) throw notFound('Community not found');

    const ctx = await getMemberContext(userId, communityId);
    if (!hasPermission(ctx, Permissions.CREATE_INVITES)) {
        throw forbidden('Missing permission: CREATE_INVITES');
    }

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const code = createInviteCode();
        try {
            await prisma.community.update({
                where: { id: communityId },
                data: { inviteCode: code },
            });
            return { inviteCode: code };
        } catch (err) {
            // Extremely unlikely collision on the unique inviteCode column; retry
            // with a fresh code up to maxAttempts before giving up.
            if (isPrismaError(err, 'P2002') && attempt < maxAttempts) continue;
            throw err;
        }
    }

    // Unreachable: the loop above always returns or throws.
    throw badRequest('Could not generate a unique invite code');
}

export async function joinCommunity(userId: string, code: string) {
    const community = await prisma.community.findUnique({ where: { inviteCode: code } });
    if (!community) throw notFound('Invalid or expired invite link');

    const ban = await prisma.communityBan.findUnique({
        where: {
            communityId_userId: {
                communityId: community.id,
                userId,
            },
        },
    });
    if (ban) throw forbidden('You are banned from this community');

    try {
        const newMember = await prisma.communityMember.create({
            data: {
                userId,
                communityId: community.id,
                role: 'member',
            },
            include: {
                user: { select: { id: true, username: true, tag: true, avatarUrl: true, status: true } },
            },
        });

        const memberPayload: MemberJoinedPayload = {
            userId: newMember.userId,
            username: newMember.user.username,
            tag: newMember.user.tag,
            avatarUrl: newMember.user.avatarUrl,
            roles: [],
            isOwner: false,
        };
        emitJoinCommunityRoom(userId, community.id);
        emitMemberJoined(community.id, memberPayload);
    } catch (err) {
        // Already a member: idempotent join, no new socket/member events.
        if (!isPrismaError(err, 'P2002')) throw err;
    }

    return { success: true, communityId: community.id };
}

export async function getInviteInfo(code: string) {
    const community = await prisma.community.findUnique({
        where: { inviteCode: code },
        select: {
            id: true,
            name: true,
            iconUrl: true,
            _count: {
                select: { members: true },
            },
        },
    });

    if (!community) throw notFound('Invalid or expired invite link');
    return community;
}

export async function leaveCommunity(userId: string, communityId: string) {
    const community = await prisma.community.findUnique({ where: { id: communityId } });
    if (!community) throw notFound('Community not found');

    if (community.ownerId === userId) {
        throw badRequest('Owners cannot leave their own community');
    }

    const { count } = await prisma.communityMember.deleteMany({
        where: { userId, communityId },
    });
    if (count === 0) throw notFound('You are not a member of this community');

    return { success: true, message: 'Successfully left the community' };
}
