import { prisma } from '../db/prisma';
import { getIO } from '../sockets/io';
import { conflict, isPrismaError, notFound } from '../lib/errors';

const MAX_CONNECTIONS_PER_USER = 10;

const ME_SELECT = {
    id: true,
    username: true,
    tag: true,
    email: true,
    avatarUrl: true,
    status: true,
    bio: true,
    bannerUrl: true,
    bannerColor: true,
    accentColor: true,
    pronouns: true,
    customStatus: true,
    createdAt: true,
    connections: {
        orderBy: { createdAt: 'asc' as const },
        select: {
            id: true,
            platform: true,
            name: true,
            url: true,
        },
    },
};

const PUBLIC_SELECT = {
    id: true,
    username: true,
    tag: true,
    avatarUrl: true,
    status: true,
    bio: true,
    bannerUrl: true,
    bannerColor: true,
    accentColor: true,
    pronouns: true,
    customStatus: true,
    createdAt: true,
    connections: {
        orderBy: { createdAt: 'asc' as const },
        select: { id: true, platform: true, name: true, url: true },
    },
};

const SUMMARY_SELECT = {
    id: true,
    username: true,
    tag: true,
    avatarUrl: true,
    status: true,
};

export async function getMe(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: ME_SELECT,
    });

    if (!user) {
        throw notFound('User not found');
    }

    return user;
}

export interface UpdateMeInput {
    username?: string;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
    bannerColor?: string | null;
    accentColor?: string | null;
    bio?: string | null;
    pronouns?: string | null;
    customStatus?: string | null;
}

export async function updateMe(userId: string, input: UpdateMeInput) {
    let user;
    try {
        user = await prisma.user.update({
            where: { id: userId },
            data: input,
            select: {
                id: true,
                username: true,
                tag: true,
                email: true,
                avatarUrl: true,
                status: true,
                bio: true,
                bannerUrl: true,
                bannerColor: true,
                accentColor: true,
                pronouns: true,
                customStatus: true,
                createdAt: true,
            },
        });
    } catch (err) {
        if (isPrismaError(err, 'P2002')) {
            throw conflict('Username is already taken');
        }
        throw err;
    }

    // Propagate the profile change in real time to communities, friends and
    // the user's own sessions.
    const io = getIO();
    if (io) {
        const payload = {
            user: {
                id: user.id,
                username: user.username,
                tag: user.tag,
                avatarUrl: user.avatarUrl,
                bio: user.bio,
                bannerUrl: user.bannerUrl,
                bannerColor: user.bannerColor,
                accentColor: user.accentColor,
                pronouns: user.pronouns,
                customStatus: user.customStatus,
            },
        };

        const [memberships, friendships] = await Promise.all([
            prisma.communityMember.findMany({
                where: { userId },
                select: { communityId: true },
            }),
            prisma.friendship.findMany({
                where: { OR: [{ userAId: userId }, { userBId: userId }] },
            }),
        ]);

        // One multi-room emit instead of a loop of emits: with the Redis
        // adapter every io.to() is a publish, so batching matters.
        const rooms = new Set<string>([`user:${userId}`]);
        memberships.forEach((m) => rooms.add(`community:${m.communityId}`));
        friendships.forEach((f) => {
            const friendId = f.userAId === userId ? f.userBId : f.userAId;
            rooms.add(`user:${friendId}`);
        });
        io.to(Array.from(rooms)).emit('user_updated', payload);
    }

    return user;
}

export async function search(userId: string, query: string) {
    // Exact username#tag lookup (e.g. "brocoli#xY3k")
    if (query.includes('#')) {
        const [uname, tag] = query.split('#');
        const user = await prisma.user.findFirst({
            where: { username: uname, tag, id: { not: userId } },
            select: SUMMARY_SELECT,
        });

        if (user) {
            return [user];
        }
    }

    // Partial, case-insensitive username match.
    return prisma.user.findMany({
        where: {
            username: { contains: query, mode: 'insensitive' },
            id: { not: userId },
        },
        select: SUMMARY_SELECT,
        take: 20,
    });
}

export async function getById(targetId: string) {
    const user = await prisma.user.findUnique({
        where: { id: targetId },
        select: PUBLIC_SELECT,
    });

    if (!user) {
        throw notFound('User not found');
    }

    return user;
}

export interface AddConnectionInput {
    platform: string;
    name: string;
    url: string | null;
}

export async function addConnection(userId: string, input: AddConnectionInput) {
    return prisma.$transaction(async (tx) => {
        const count = await tx.userConnection.count({ where: { userId } });
        if (count >= MAX_CONNECTIONS_PER_USER) {
            throw conflict(`You can have at most ${MAX_CONNECTIONS_PER_USER} connections`);
        }

        return tx.userConnection.create({
            data: {
                userId,
                platform: input.platform,
                name: input.name,
                url: input.url,
            },
            select: { id: true, platform: true, name: true, url: true },
        });
    });
}

export async function removeConnection(userId: string, connectionId: string) {
    const connection = await prisma.userConnection.findUnique({
        where: { id: connectionId },
        select: { id: true, userId: true },
    });

    // 404 whether it doesn't exist or belongs to someone else.
    if (!connection || connection.userId !== userId) {
        throw notFound('Connection not found');
    }

    await prisma.userConnection.delete({ where: { id: connectionId } });

    return { ok: true };
}

async function fetchMutualFriends(userId: string, targetId: string) {
    const otherId = (selfId: string) => (f: { userAId: string; userBId: string }) =>
        f.userAId === selfId ? f.userBId : f.userAId;

    const [myFriendships, targetFriendships] = await Promise.all([
        prisma.friendship.findMany({
            where: { OR: [{ userAId: userId }, { userBId: userId }] },
            select: { userAId: true, userBId: true },
        }),
        prisma.friendship.findMany({
            where: { OR: [{ userAId: targetId }, { userBId: targetId }] },
            select: { userAId: true, userBId: true },
        }),
    ]);

    const myFriendIds = new Set(myFriendships.map(otherId(userId)));
    const targetFriendIds = new Set(targetFriendships.map(otherId(targetId)));

    const mutualIds = [...myFriendIds].filter(
        (fid) => targetFriendIds.has(fid) && fid !== userId && fid !== targetId
    );

    if (mutualIds.length === 0) return [];

    return prisma.user.findMany({
        where: { id: { in: mutualIds } },
        select: SUMMARY_SELECT,
    });
}

async function fetchMutualCommunities(userId: string, targetId: string) {
    const [myMemberships, targetMemberships] = await Promise.all([
        prisma.communityMember.findMany({ where: { userId }, select: { communityId: true } }),
        prisma.communityMember.findMany({ where: { userId: targetId }, select: { communityId: true } }),
    ]);

    const targetCommunityIds = new Set(targetMemberships.map((m) => m.communityId));
    const mutualCommunityIds = myMemberships
        .map((m) => m.communityId)
        .filter((cid) => targetCommunityIds.has(cid));

    if (mutualCommunityIds.length === 0) return [];

    return prisma.community.findMany({
        where: { id: { in: mutualCommunityIds } },
        select: { id: true, name: true, iconUrl: true },
    });
}

export async function getMutualFriends(userId: string, targetId: string) {
    return fetchMutualFriends(userId, targetId);
}

export async function getMutualCommunities(userId: string, targetId: string) {
    return fetchMutualCommunities(userId, targetId);
}

// One round-trip for a user's profile card (profile + both "in common"
// lists), used by the DM profile card in the client: 3 Prisma queries run in
// parallel here, where the network cost between them is negligible, instead
// of the client paying 3 separate round-trips each with the same fixed
// latency cost.
export async function getProfileCard(userId: string, targetId: string) {
    const [user, mutualFriends, mutualCommunities] = await Promise.all([
        prisma.user.findUnique({ where: { id: targetId }, select: PUBLIC_SELECT }),
        fetchMutualFriends(userId, targetId),
        fetchMutualCommunities(userId, targetId),
    ]);

    if (!user) {
        throw notFound('User not found');
    }

    return { user, mutualFriends, mutualCommunities };
}
