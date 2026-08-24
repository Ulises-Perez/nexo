import { Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { getIO } from '../sockets/io';

// Plataformas permitidas para las conexiones autodeclaradas del perfil
const ALLOWED_CONNECTION_PLATFORMS = [
    'playstation',
    'xbox',
    'steam',
    'spotify',
    'twitch',
    'youtube',
    'github',
    'twitter',
    'instagram',
    'tiktok',
    'riot',
    'epicgames',
];

// Máximo de conexiones por usuario
const MAX_CONNECTIONS_PER_USER = 10;

// Valida un color hexadecimal #RRGGBB
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export class UserController {
    public static async getMe(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const user = await prisma.user.findUnique({
                where: { id: userId },
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
                    connections: {
                        orderBy: { createdAt: 'asc' },
                        select: {
                            id: true,
                            platform: true,
                            name: true,
                            url: true,
                        },
                    },
                },
            });

            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            res.status(200).json(user);
        } catch (error) {
            console.error('[UserController - getMe Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // PATCH /api/users/me  — actualizar username, avatar y campos de perfil
    public static async updateMe(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const {
                username,
                avatarUrl,
                bio,
                bannerUrl,
                bannerColor,
                accentColor,
                pronouns,
                customStatus,
            } = req.body;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const data: {
                username?: string;
                avatarUrl?: string | null;
                bio?: string | null;
                bannerUrl?: string | null;
                bannerColor?: string | null;
                accentColor?: string | null;
                pronouns?: string | null;
                customStatus?: string | null;
            } = {};

            if (username !== undefined) {
                const trimmed = String(username).trim();
                if (!/^[a-zA-Z0-9_]{3,30}$/.test(trimmed)) {
                    res.status(400).json({ error: 'Username must be 3-30 characters (letters, numbers, underscore)' });
                    return;
                }

                const existing = await prisma.user.findFirst({
                    where: { username: trimmed, id: { not: userId } }
                });
                if (existing) {
                    res.status(409).json({ error: 'Username is already taken' });
                    return;
                }
                data.username = trimmed;
            }

            if (avatarUrl !== undefined) {
                data.avatarUrl = avatarUrl?.trim() || null;
            }

            if (bio !== undefined) {
                if (bio !== null && typeof bio !== 'string') {
                    res.status(400).json({ error: 'Bio must be a string or null' });
                    return;
                }
                const trimmed = bio === null ? '' : bio.trim();
                if (trimmed.length > 190) {
                    res.status(400).json({ error: 'Bio must be 190 characters or fewer' });
                    return;
                }
                data.bio = trimmed || null;
            }

            if (bannerUrl !== undefined) {
                if (bannerUrl !== null && typeof bannerUrl !== 'string') {
                    res.status(400).json({ error: 'Banner URL must be a string or null' });
                    return;
                }
                if (bannerUrl === null) {
                    data.bannerUrl = null;
                } else {
                    const trimmed = bannerUrl.trim();
                    if (trimmed.length > 500) {
                        res.status(400).json({ error: 'Banner URL must be 500 characters or fewer' });
                        return;
                    }
                    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
                        res.status(400).json({ error: 'Banner URL must start with http:// or https://' });
                        return;
                    }
                    data.bannerUrl = trimmed || null;
                }
            }

            if (bannerColor !== undefined) {
                if (bannerColor !== null && typeof bannerColor !== 'string') {
                    res.status(400).json({ error: 'Banner color must be a string or null' });
                    return;
                }
                if (bannerColor === null) {
                    data.bannerColor = null;
                } else {
                    const trimmed = bannerColor.trim();
                    if (trimmed && !HEX_COLOR_REGEX.test(trimmed)) {
                        res.status(400).json({ error: 'Banner color must be a hex value like #RRGGBB' });
                        return;
                    }
                    data.bannerColor = trimmed || null;
                }
            }

            if (accentColor !== undefined) {
                if (accentColor !== null && typeof accentColor !== 'string') {
                    res.status(400).json({ error: 'Accent color must be a string or null' });
                    return;
                }
                if (accentColor === null) {
                    data.accentColor = null;
                } else {
                    const trimmed = accentColor.trim();
                    if (trimmed && !HEX_COLOR_REGEX.test(trimmed)) {
                        res.status(400).json({ error: 'Accent color must be a hex value like #RRGGBB' });
                        return;
                    }
                    data.accentColor = trimmed || null;
                }
            }

            if (pronouns !== undefined) {
                if (pronouns !== null && typeof pronouns !== 'string') {
                    res.status(400).json({ error: 'Pronouns must be a string or null' });
                    return;
                }
                const trimmed = pronouns === null ? '' : pronouns.trim();
                if (trimmed.length > 40) {
                    res.status(400).json({ error: 'Pronouns must be 40 characters or fewer' });
                    return;
                }
                data.pronouns = trimmed || null;
            }

            if (customStatus !== undefined) {
                if (customStatus !== null && typeof customStatus !== 'string') {
                    res.status(400).json({ error: 'Custom status must be a string or null' });
                    return;
                }
                const trimmed = customStatus === null ? '' : customStatus.trim();
                if (trimmed.length > 128) {
                    res.status(400).json({ error: 'Custom status must be 128 characters or fewer' });
                    return;
                }
                data.customStatus = trimmed || null;
            }

            const user = await prisma.user.update({
                where: { id: userId },
                data,
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

            // Propagar el cambio de perfil en tiempo real a comunidades, amigos y sesiones propias
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
                    }
                };

                const [memberships, friendships] = await Promise.all([
                    prisma.communityMember.findMany({
                        where: { userId },
                        select: { communityId: true }
                    }),
                    prisma.friendship.findMany({
                        where: { OR: [{ userAId: userId }, { userBId: userId }] }
                    })
                ]);

                io.to(`user:${userId}`).emit('user_updated', payload);
                memberships.forEach(m => {
                    io.to(`community:${m.communityId}`).emit('user_updated', payload);
                });
                friendships.forEach(f => {
                    const friendId = f.userAId === userId ? f.userBId : f.userAId;
                    io.to(`user:${friendId}`).emit('user_updated', payload);
                });
            }

            res.status(200).json(user);
        } catch (error) {
            console.error('[UserController - updateMe Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    public static async search(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const { q } = req.query;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            if (!q || typeof q !== 'string' || q.trim().length === 0) {
                res.status(400).json({ error: 'Query parameter "q" is required' });
                return;
            }

            const query = q.trim();

            // Buscar por username#tag exacto (ej: "brocoli#xY3k")
            if (query.includes('#')) {
                const [username, tag] = query.split('#');
                const user = await prisma.user.findFirst({
                    where: {
                        username: username,
                        tag: tag,
                        id: { not: userId },
                    },
                    select: {
                        id: true,
                        username: true,
                        tag: true,
                        avatarUrl: true,
                        status: true,
                    },
                });

                if (user) {
                    res.status(200).json([user]);
                    return;
                }
            }

            // Buscar por username que contenga la query (búsqueda parcial)
            const users = await prisma.user.findMany({
                where: {
                    username: { contains: query, mode: 'insensitive' },
                    id: { not: userId },
                },
                select: {
                    id: true,
                    username: true,
                    tag: true,
                    avatarUrl: true,
                    status: true,
                },
                take: 20,
            });

            res.status(200).json(users);
        } catch (error) {
            console.error('[UserController - search Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    public static async getById(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const id = req.params.id as string;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const user = await prisma.user.findUnique({
                where: { id },
                select: {
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
                        orderBy: { createdAt: 'asc' },
                        select: {
                            id: true,
                            platform: true,
                            name: true,
                            url: true,
                        },
                    },
                },
            });

            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            res.status(200).json(user);
        } catch (error) {
            console.error('[UserController - getById Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // POST /api/users/me/connections — agregar una conexión autodeclarada
    public static async addConnection(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const { platform, name, url } = req.body;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const platformValue = typeof platform === 'string' ? platform.trim().toLowerCase() : '';
            if (!ALLOWED_CONNECTION_PLATFORMS.includes(platformValue)) {
                res.status(400).json({ error: 'Invalid platform' });
                return;
            }

            const nameValue = typeof name === 'string' ? name.trim() : '';
            if (!nameValue) {
                res.status(400).json({ error: 'Connection name is required' });
                return;
            }
            if (nameValue.length > 80) {
                res.status(400).json({ error: 'Connection name must be 80 characters or fewer' });
                return;
            }

            let urlValue: string | null = null;
            if (url !== undefined && url !== null) {
                const trimmed = String(url).trim();
                if (trimmed.length > 300) {
                    res.status(400).json({ error: 'Connection URL must be 300 characters or fewer' });
                    return;
                }
                urlValue = trimmed || null;
            }

            const count = await prisma.userConnection.count({ where: { userId } });
            if (count >= MAX_CONNECTIONS_PER_USER) {
                res.status(400).json({ error: `You can have at most ${MAX_CONNECTIONS_PER_USER} connections` });
                return;
            }

            const connection = await prisma.userConnection.create({
                data: {
                    userId,
                    platform: platformValue,
                    name: nameValue,
                    url: urlValue,
                },
                select: {
                    id: true,
                    platform: true,
                    name: true,
                    url: true,
                },
            });

            res.status(201).json(connection);
        } catch (error) {
            console.error('[UserController - addConnection Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // DELETE /api/users/me/connections/:id — eliminar una conexión propia
    public static async removeConnection(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const id = req.params.id as string;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const connection = await prisma.userConnection.findUnique({
                where: { id },
                select: { id: true, userId: true },
            });

            // 404 si no existe o no pertenece al solicitante
            if (!connection || connection.userId !== userId) {
                res.status(404).json({ error: 'Connection not found' });
                return;
            }

            await prisma.userConnection.delete({ where: { id } });

            res.status(200).json({ ok: true });
        } catch (error) {
            console.error('[UserController - removeConnection Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // GET /api/users/:id/mutual-friends — amigos en común entre el solicitante y el objetivo
    public static async getMutualFriends(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const targetId = req.params.id as string;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            res.status(200).json(await UserController.fetchMutualFriends(userId, targetId));
        } catch (error) {
            console.error('[UserController - getMutualFriends Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // GET /api/users/:id/mutual-communities — comunidades en común entre el solicitante y el objetivo
    public static async getMutualCommunities(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const targetId = req.params.id as string;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            res.status(200).json(await UserController.fetchMutualCommunities(userId, targetId));
        } catch (error) {
            console.error('[UserController - getMutualCommunities Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // GET /api/users/:id/profile-card — perfil + ambos "en común" en un solo
    // round-trip. Evita que el cliente pague 3 idas y vueltas de red separadas
    // (cada una con el mismo costo fijo de latencia) para pintar la tarjeta de
    // un usuario en un DM; las 3 queries de Prisma corren en paralelo acá,
    // donde el costo de red entre ellas es despreciable.
    public static async getProfileCard(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const targetId = req.params.id as string;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const [user, mutualFriends, mutualCommunities] = await Promise.all([
                prisma.user.findUnique({
                    where: { id: targetId },
                    select: {
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
                            orderBy: { createdAt: 'asc' },
                            select: { id: true, platform: true, name: true, url: true },
                        },
                    },
                }),
                UserController.fetchMutualFriends(userId, targetId),
                UserController.fetchMutualCommunities(userId, targetId),
            ]);

            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            res.status(200).json({ user, mutualFriends, mutualCommunities });
        } catch (error) {
            console.error('[UserController - getProfileCard Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    private static async fetchMutualFriends(userId: string, targetId: string) {
        // Saca el id del "otro" usuario en cada amistad
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

        // Intersección, excluyendo al solicitante y al objetivo
        const mutualIds = [...myFriendIds].filter(
            (fid) => targetFriendIds.has(fid) && fid !== userId && fid !== targetId
        );

        if (mutualIds.length === 0) return [];

        return prisma.user.findMany({
            where: { id: { in: mutualIds } },
            select: { id: true, username: true, tag: true, avatarUrl: true, status: true },
        });
    }

    private static async fetchMutualCommunities(userId: string, targetId: string) {
        const [myMemberships, targetMemberships] = await Promise.all([
            prisma.communityMember.findMany({
                where: { userId },
                select: { communityId: true },
            }),
            prisma.communityMember.findMany({
                where: { userId: targetId },
                select: { communityId: true },
            }),
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
}
