import { Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { Permissions, getMemberContext, hasPermission, getCommunityIdOfChannel } from '../lib/permissions';
import { emitCommunityUpdated } from '../sockets/io';

// Los canales de texto usan nombres estilo Discord: minúsculas y guiones
function normalizeChannelName(name: string, type: string): string {
    const trimmed = name.trim();
    if (type === 'voice') return trimmed;
    return trimmed.toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-');
}

export class ChannelController {
    public static async getMessages(req: Request, res: Response): Promise<void> {
        try {
            const channelId = req.params.id as string;
            const userId = req.user?.id;

            // Paginación por cursor: `before` apunta al mensaje más antiguo ya
            // cargado por el cliente; `limit` controla el tamaño de página
            // (por defecto 50, tope 100). Se consulta en orden descendente para
            // traer siempre la página más reciente (o la anterior al cursor).
            const before = typeof req.query.before === 'string' ? req.query.before : undefined;
            const rawLimit = parseInt(req.query.limit as string, 10);
            const limit = Number.isNaN(rawLimit) ? 50 : Math.min(Math.max(rawLimit, 1), 100);

            const messages = await prisma.message.findMany({
                where: { channelId },
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            avatarUrl: true,
                            status: true,
                        }
                    },
                    attachments: true
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                ...(before ? { cursor: { id: before }, skip: 1 } : {})
            });

            // El cliente renderiza de arriba (más viejo) hacia abajo (más nuevo),
            // así que se invierte la página descendente a orden ascendente.
            messages.reverse();

            // El color de rol del autor se resuelve en el cliente vía
            // communityStore.getMemberRoleColor; no se consulta aquí para
            // evitar dos queries adicionales en la ruta más caliente.
            res.status(200).json(messages);

            // Mark messages as read (messages not sent by current user that are unread).
            // Fire-and-forget, off the critical path — the response is already sent,
            // so this write no longer adds latency to every fetch/revalidate poll.
            if (userId) {
                prisma.message.updateMany({
                    where: {
                        channelId,
                        userId: { not: userId },
                        readAt: null
                    },
                    data: {
                        readAt: new Date()
                    }
                }).catch(err => console.error('[ChannelController - getMessages markRead Error]', err));
            }
        } catch (error) {
            console.error('[ChannelController - getMessages Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // POST /api/communities/:id/channels
    public static async createChannel(req: Request, res: Response): Promise<void> {
        try {
            const communityId = req.params.id as string;
            const userId = req.user?.id;
            const { name, type, categoryId } = req.body;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            if (!name || name.trim() === '') {
                res.status(400).json({ error: 'Channel name is required' });
                return;
            }

            const channelType = type === 'voice' ? 'voice' : 'text';

            const ctx = await getMemberContext(userId, communityId);
            if (!hasPermission(ctx, Permissions.MANAGE_CHANNELS)) {
                res.status(403).json({ error: 'Missing permission: MANAGE_CHANNELS' });
                return;
            }

            // La categoría debe pertenecer a la comunidad
            const category = await prisma.category.findFirst({
                where: { id: categoryId, communityId }
            });

            if (!category) {
                res.status(400).json({ error: 'Invalid category for this community' });
                return;
            }

            const lastChannel = await prisma.channel.findFirst({
                where: { categoryId },
                orderBy: { order: 'desc' }
            });

            const channel = await prisma.channel.create({
                data: {
                    name: normalizeChannelName(name, channelType),
                    type: channelType,
                    categoryId,
                    order: (lastChannel?.order ?? -1) + 1
                }
            });

            emitCommunityUpdated(communityId);
            res.status(201).json(channel);
        } catch (error) {
            console.error('[ChannelController - createChannel Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // PATCH /api/channels/:id
    public static async updateChannel(req: Request, res: Response): Promise<void> {
        try {
            const channelId = req.params.id as string;
            const userId = req.user?.id;
            const { name } = req.body;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            if (!name || name.trim() === '') {
                res.status(400).json({ error: 'Channel name is required' });
                return;
            }

            const communityId = await getCommunityIdOfChannel(channelId);
            if (!communityId) {
                res.status(404).json({ error: 'Channel not found' });
                return;
            }

            const ctx = await getMemberContext(userId, communityId);
            if (!hasPermission(ctx, Permissions.MANAGE_CHANNELS)) {
                res.status(403).json({ error: 'Missing permission: MANAGE_CHANNELS' });
                return;
            }

            const existing = await prisma.channel.findUnique({ where: { id: channelId } });
            const channel = await prisma.channel.update({
                where: { id: channelId },
                data: { name: normalizeChannelName(name, existing?.type ?? 'text') }
            });

            emitCommunityUpdated(communityId);
            res.status(200).json(channel);
        } catch (error) {
            console.error('[ChannelController - updateChannel Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // DELETE /api/channels/:id
    public static async deleteChannel(req: Request, res: Response): Promise<void> {
        try {
            const channelId = req.params.id as string;
            const userId = req.user?.id;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const communityId = await getCommunityIdOfChannel(channelId);
            if (!communityId) {
                res.status(404).json({ error: 'Channel not found' });
                return;
            }

            const ctx = await getMemberContext(userId, communityId);
            if (!hasPermission(ctx, Permissions.MANAGE_CHANNELS)) {
                res.status(403).json({ error: 'Missing permission: MANAGE_CHANNELS' });
                return;
            }

            await prisma.channel.delete({ where: { id: channelId } });

            emitCommunityUpdated(communityId);
            res.status(200).json({ success: true });
        } catch (error) {
            console.error('[ChannelController - deleteChannel Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // POST /api/communities/:id/categories
    public static async createCategory(req: Request, res: Response): Promise<void> {
        try {
            const communityId = req.params.id as string;
            const userId = req.user?.id;
            const { name } = req.body;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            if (!name || name.trim() === '') {
                res.status(400).json({ error: 'Category name is required' });
                return;
            }

            const ctx = await getMemberContext(userId, communityId);
            if (!hasPermission(ctx, Permissions.MANAGE_CHANNELS)) {
                res.status(403).json({ error: 'Missing permission: MANAGE_CHANNELS' });
                return;
            }

            const lastCategory = await prisma.category.findFirst({
                where: { communityId },
                orderBy: { order: 'desc' }
            });

            const category = await prisma.category.create({
                data: {
                    name: name.trim(),
                    communityId,
                    order: (lastCategory?.order ?? -1) + 1
                }
            });

            emitCommunityUpdated(communityId);
            res.status(201).json(category);
        } catch (error) {
            console.error('[ChannelController - createCategory Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // PATCH /api/categories/:id
    public static async updateCategory(req: Request, res: Response): Promise<void> {
        try {
            const categoryId = req.params.id as string;
            const userId = req.user?.id;
            const { name } = req.body;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            if (!name || name.trim() === '') {
                res.status(400).json({ error: 'Category name is required' });
                return;
            }

            const category = await prisma.category.findUnique({ where: { id: categoryId } });
            if (!category) {
                res.status(404).json({ error: 'Category not found' });
                return;
            }

            const ctx = await getMemberContext(userId, category.communityId);
            if (!hasPermission(ctx, Permissions.MANAGE_CHANNELS)) {
                res.status(403).json({ error: 'Missing permission: MANAGE_CHANNELS' });
                return;
            }

            const updated = await prisma.category.update({
                where: { id: categoryId },
                data: { name: name.trim() }
            });

            emitCommunityUpdated(category.communityId);
            res.status(200).json(updated);
        } catch (error) {
            console.error('[ChannelController - updateCategory Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    // DELETE /api/categories/:id
    public static async deleteCategory(req: Request, res: Response): Promise<void> {
        try {
            const categoryId = req.params.id as string;
            const userId = req.user?.id;

            if (!userId) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const category = await prisma.category.findUnique({ where: { id: categoryId } });
            if (!category) {
                res.status(404).json({ error: 'Category not found' });
                return;
            }

            const ctx = await getMemberContext(userId, category.communityId);
            if (!hasPermission(ctx, Permissions.MANAGE_CHANNELS)) {
                res.status(403).json({ error: 'Missing permission: MANAGE_CHANNELS' });
                return;
            }

            // Borra en cascada los canales (y sus mensajes) de la categoría
            await prisma.category.delete({ where: { id: categoryId } });

            emitCommunityUpdated(category.communityId);
            res.status(200).json({ success: true });
        } catch (error) {
            console.error('[ChannelController - deleteCategory Error]', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}
