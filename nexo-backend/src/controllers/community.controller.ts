import { Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { Permissions, ALL_PERMISSIONS, getMemberContext, hasPermission } from '../lib/permissions';
import { emitCommunityUpdated, emitMemberJoined, getIO, MemberJoinedPayload } from '../sockets/io';

export class CommunityController {
    public static async getUserCommunities(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            // Buscar comunidades donde el usuario es dueño O miembro, e incluir los canales
            const communities = await prisma.community.findMany({
                where: {
                    OR: [
                        { ownerId: userId },
                        { members: { some: { userId } } }
                    ]
                },
                include: {
                    categories: {
                        include: {
                            channels: {
                                orderBy: { order: 'asc' }
                            }
                        },
                        orderBy: { order: 'asc' }
                    },
                    roles: {
                        orderBy: { position: 'desc' }
                    },
                    members: {
                        where: { userId },
                        include: {
                            roles: { include: { role: { select: { permissions: true } } } }
                        }
                    },
                    _count: { select: { members: true } }
                },
                orderBy: { createdAt: 'asc' }
            });

            // Calcular los permisos agregados del usuario en cada comunidad
            const result = communities.map(({ members, ...community }) => {
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

            res.status(200).json(result);
        } catch (error) {
            console.error('[CommunityController - getUserCommunities Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // PATCH /api/communities/:id  — editar nombre/icono/descripción
    public static async updateCommunity(req: Request, res: Response): Promise<void> {
        try {
            const communityId = req.params.id as string;
            const userId = req.user?.id;
            const { name, iconUrl, description } = req.body;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const ctx = await getMemberContext(userId, communityId);
            if (!hasPermission(ctx, Permissions.MANAGE_COMMUNITY)) {
                res.status(403).json({ error: 'Missing permission: MANAGE_COMMUNITY' });
                return;
            }

            const data: { name?: string; iconUrl?: string | null; description?: string | null } = {};
            if (name !== undefined) {
                if (!name || name.trim() === '') {
                    res.status(400).json({ error: 'Community name cannot be empty' });
                    return;
                }
                data.name = name.trim();
            }
            if (iconUrl !== undefined) data.iconUrl = iconUrl?.trim() || null;
            if (description !== undefined) data.description = description?.trim() || null;

            const updated = await prisma.community.update({
                where: { id: communityId },
                data
            });

            emitCommunityUpdated(communityId);
            res.status(200).json(updated);
        } catch (error) {
            console.error('[CommunityController - updateCommunity Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // DELETE /api/communities/:id  — eliminar comunidad (solo el dueño)
    public static async deleteCommunity(req: Request, res: Response): Promise<void> {
        try {
            const communityId = req.params.id as string;
            const userId = req.user?.id;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const community = await prisma.community.findUnique({ where: { id: communityId } });
            if (!community) {
                res.status(404).json({ error: 'Community not found' });
                return;
            }

            if (community.ownerId !== userId) {
                res.status(403).json({ error: 'Only the owner can delete the community' });
                return;
            }

            // Avisar a los miembros conectados antes de eliminar
            getIO()?.to(`community:${communityId}`).emit('community_deleted', { communityId });

            await prisma.community.delete({ where: { id: communityId } });

            getIO()?.in(`community:${communityId}`).socketsLeave(`community:${communityId}`);
            res.status(200).json({ success: true });
        } catch (error) {
            console.error('[CommunityController - deleteCommunity Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    public static async createCommunity(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            const { name, iconUrl } = req.body;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            if (!name || name.trim() === '') {
                res.status(400).json({ error: 'Community name is required' });
                return;
            }

            // Create community, member relationship, and default category/channel
            const newCommunity = await prisma.community.create({
                data: {
                    name: name.trim(),
                    iconUrl: iconUrl || null,
                    ownerId: userId,
                    members: {
                        create: {
                            userId: userId,
                            role: 'owner'
                        }
                    },
                    categories: {
                        create: {
                            name: 'General',
                            order: 0,
                            channels: {
                                create: {
                                    name: 'general',
                                    type: 'text',
                                    order: 0
                                }
                            }
                        }
                    }
                }
            });

            res.status(201).json(newCommunity);
        } catch (error) {
            console.error('[CommunityController - createCommunity Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    public static async generateInviteCode(req: Request, res: Response): Promise<void> {
        try {
            const communityId = req.params.id as string;
            const userId = req.user?.id;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            // Verificar si la comunidad existe y si el usuario tiene permiso de invitar
            const community = await prisma.community.findUnique({
                where: { id: communityId }
            });

            if (!community) {
                res.status(404).json({ error: 'Community not found' });
                return;
            }

            const ctx = await getMemberContext(userId, communityId);
            if (!hasPermission(ctx, Permissions.CREATE_INVITES)) {
                res.status(403).json({ error: 'Missing permission: CREATE_INVITES' });
                return;
            }

            // Generar código único de 6 caracteres alfanuméricos
            const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();

            await prisma.community.update({
                where: { id: communityId },
                data: { inviteCode: newCode }
            });

            res.status(200).json({ inviteCode: newCode });
        } catch (error) {
            console.error('[CommunityController - generateInviteCode Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    public static async joinCommunity(req: Request, res: Response): Promise<void> {
        try {
            const code = req.params.code as string;
            const userId = req.user?.id;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            // Buscar la comunidad por código de invitación
            const community = await prisma.community.findUnique({
                where: { inviteCode: code }
            });

            if (!community) {
                res.status(404).json({ error: 'Invalid or expired invite link' });
                return;
            }

            // Rechazar usuarios baneados
            const ban = await prisma.communityBan.findUnique({
                where: {
                    communityId_userId: {
                        communityId: community.id,
                        userId: userId
                    }
                }
            });

            if (ban) {
                res.status(403).json({ error: 'You are banned from this community' });
                return;
            }

            // Validar que el usuario no sea ya miembro
            const existingMember = await prisma.communityMember.findUnique({
                where: {
                    userId_communityId: {
                        userId: userId,
                        communityId: community.id
                    }
                }
            });

            if (existingMember) {
                res.status(400).json({ error: 'You are already a member of this community' });
                return;
            }

            // Create the CommunityMember record, including user data for the socket payload
            const newMember = await prisma.communityMember.create({
                data: {
                    userId: userId,
                    communityId: community.id,
                    role: 'member'
                },
                include: {
                    user: { select: { id: true, username: true, tag: true, avatarUrl: true, status: true } }
                }
            });

            const memberPayload: MemberJoinedPayload = {
                userId: newMember.userId,
                username: newMember.user.username,
                tag: newMember.user.tag,
                avatarUrl: newMember.user.avatarUrl,
                roles: [],
                isOwner: false
            };
            emitMemberJoined(community.id, memberPayload);

            res.status(200).json({ success: true, communityId: community.id });
        } catch (error) {
            console.error('[CommunityController - joinCommunity Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    public static async getInviteInfo(req: Request, res: Response): Promise<void> {
        try {
            const code = req.params.code as string;

            const community = await prisma.community.findUnique({
                where: { inviteCode: code },
                select: {
                    id: true,
                    name: true,
                    iconUrl: true,
                    _count: {
                        select: { members: true }
                    }
                }
            });

            if (!community) {
                res.status(404).json({ error: 'Invalid or expired invite link' });
                return;
            }

            res.status(200).json(community);
        } catch (error) {
            console.error('[CommunityController - getInviteInfo Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    public static async leaveCommunity(req: Request, res: Response): Promise<void> {
        try {
            const communityId = req.params.id as string;
            const userId = req.user?.id;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const community = await prisma.community.findUnique({
                where: { id: communityId }
            });

            if (!community) {
                res.status(404).json({ error: 'Community not found' });
                return;
            }

            if (community.ownerId === userId) {
                res.status(400).json({ error: 'Owners cannot leave their own community' });
                return;
            }

            // Eliminar la relación de miembro
            await prisma.communityMember.delete({
                where: {
                    userId_communityId: {
                        userId: userId,
                        communityId: communityId
                    }
                }
            });

            res.status(200).json({ success: true, message: 'Successfully left the community' });
        } catch (error) {
            console.error('[CommunityController - leaveCommunity Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}
