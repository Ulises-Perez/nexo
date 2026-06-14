import { Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { Permissions, getMemberContext, hasPermission } from '../lib/permissions';
import { emitCommunityUpdated, emitMemberUnbanned, emitRemovedFromCommunity } from '../sockets/io';

export class MemberController {
    // GET /api/communities/:id/members
    public static async getMembers(req: Request, res: Response): Promise<void> {
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

            const members = await prisma.communityMember.findMany({
                where: { communityId },
                include: {
                    user: {
                        select: { id: true, username: true, tag: true, avatarUrl: true, status: true }
                    },
                    roles: {
                        include: {
                            role: { select: { id: true, name: true, color: true, position: true, permissions: true } }
                        }
                    }
                },
                orderBy: { joinedAt: 'asc' }
            });

            const community = await prisma.community.findUnique({
                where: { id: communityId },
                select: { ownerId: true }
            });

            const result = members.map(m => ({
                id: m.id,
                userId: m.userId,
                joinedAt: m.joinedAt,
                isOwner: m.userId === community?.ownerId,
                user: m.user,
                roles: m.roles
                    .map(mr => mr.role)
                    .sort((a, b) => b.position - a.position)
            }));

            res.status(200).json(result);
        } catch (error) {
            console.error('[MemberController - getMembers Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // DELETE /api/communities/:id/members/:userId  — expulsar miembro
    public static async kickMember(req: Request, res: Response): Promise<void> {
        try {
            const communityId = req.params.id as string;
            const targetUserId = req.params.userId as string;
            const userId = req.user?.id;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const ctx = await getMemberContext(userId, communityId);
            if (!hasPermission(ctx, Permissions.KICK_MEMBERS)) {
                res.status(403).json({ error: 'Missing permission: KICK_MEMBERS' });
                return;
            }

            const community = await prisma.community.findUnique({ where: { id: communityId } });
            if (!community) {
                res.status(404).json({ error: 'Community not found' });
                return;
            }

            if (targetUserId === community.ownerId) {
                res.status(400).json({ error: 'Cannot kick the community owner' });
                return;
            }

            if (targetUserId === userId) {
                res.status(400).json({ error: 'You cannot kick yourself' });
                return;
            }

            await prisma.communityMember.delete({
                where: { userId_communityId: { userId: targetUserId, communityId } }
            });

            await emitRemovedFromCommunity(targetUserId, communityId, 'kick');
            emitCommunityUpdated(communityId);
            res.status(200).json({ success: true });
        } catch (error) {
            console.error('[MemberController - kickMember Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // POST /api/communities/:id/bans  — banear usuario (lo expulsa si es miembro)
    public static async banMember(req: Request, res: Response): Promise<void> {
        try {
            const communityId = req.params.id as string;
            const userId = req.user?.id;
            const { userId: targetUserId, reason } = req.body;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            if (!targetUserId) {
                res.status(400).json({ error: 'userId is required' });
                return;
            }

            const ctx = await getMemberContext(userId, communityId);
            if (!hasPermission(ctx, Permissions.BAN_MEMBERS)) {
                res.status(403).json({ error: 'Missing permission: BAN_MEMBERS' });
                return;
            }

            const community = await prisma.community.findUnique({ where: { id: communityId } });
            if (!community) {
                res.status(404).json({ error: 'Community not found' });
                return;
            }

            if (targetUserId === community.ownerId) {
                res.status(400).json({ error: 'Cannot ban the community owner' });
                return;
            }

            if (targetUserId === userId) {
                res.status(400).json({ error: 'You cannot ban yourself' });
                return;
            }

            const existingBan = await prisma.communityBan.findUnique({
                where: { communityId_userId: { communityId, userId: targetUserId } }
            });

            if (existingBan) {
                res.status(400).json({ error: 'User is already banned' });
                return;
            }

            await prisma.$transaction([
                prisma.communityBan.create({
                    data: {
                        communityId,
                        userId: targetUserId,
                        reason: reason?.trim() || null,
                        bannedById: userId
                    }
                }),
                prisma.communityMember.deleteMany({
                    where: { userId: targetUserId, communityId }
                })
            ]);

            await emitRemovedFromCommunity(targetUserId, communityId, 'ban');
            emitCommunityUpdated(communityId);
            res.status(200).json({ success: true });
        } catch (error) {
            console.error('[MemberController - banMember Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // GET /api/communities/:id/bans
    public static async getBans(req: Request, res: Response): Promise<void> {
        try {
            const communityId = req.params.id as string;
            const userId = req.user?.id;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const ctx = await getMemberContext(userId, communityId);
            if (!hasPermission(ctx, Permissions.BAN_MEMBERS)) {
                res.status(403).json({ error: 'Missing permission: BAN_MEMBERS' });
                return;
            }

            const bans = await prisma.communityBan.findMany({
                where: { communityId },
                include: {
                    user: {
                        select: { id: true, username: true, tag: true, avatarUrl: true }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            res.status(200).json(bans);
        } catch (error) {
            console.error('[MemberController - getBans Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // DELETE /api/communities/:id/bans/:userId  — quitar baneo
    public static async unbanMember(req: Request, res: Response): Promise<void> {
        try {
            const communityId = req.params.id as string;
            const targetUserId = req.params.userId as string;
            const userId = req.user?.id;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const ctx = await getMemberContext(userId, communityId);
            if (!hasPermission(ctx, Permissions.BAN_MEMBERS)) {
                res.status(403).json({ error: 'Missing permission: BAN_MEMBERS' });
                return;
            }

            await prisma.communityBan.delete({
                where: { communityId_userId: { communityId, userId: targetUserId } }
            });

            // Inform the unbanned user so their client can react (informational only)
            emitMemberUnbanned(targetUserId, communityId);

            res.status(200).json({ success: true });
        } catch (error) {
            console.error('[MemberController - unbanMember Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}
