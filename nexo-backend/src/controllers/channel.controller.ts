import { Request, Response } from 'express';
import { requireUserId } from '../lib/errors';
import * as channelService from '../services/channel.service';
import type { GetMessagesQuery } from '../schemas/channel.schema';

export class ChannelController {
    public static async getMessages(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const channelId = req.params.id as string;
        const query = res.locals.query as GetMessagesQuery;

        const messages = await channelService.getMessages(userId, channelId, query);
        res.status(200).json(messages);

        // Mark messages as read (messages not sent by current user that are
        // unread). Fire-and-forget, off the critical path — the response is
        // already sent, so this write no longer adds latency to every
        // fetch/revalidate poll.
        channelService.markChannelRead(channelId, userId)
            .catch(err => console.error('[ChannelController - getMessages markRead Error]', err));
    }

    // POST /api/communities/:id/channels
    public static async createChannel(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const communityId = req.params.id as string;
        const channel = await channelService.createChannel(userId, communityId, req.body);
        res.status(201).json(channel);
    }

    // PATCH /api/channels/:id
    public static async updateChannel(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const channelId = req.params.id as string;
        const channel = await channelService.updateChannel(userId, channelId, req.body);
        res.status(200).json(channel);
    }

    // DELETE /api/channels/:id
    public static async deleteChannel(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const channelId = req.params.id as string;
        const result = await channelService.deleteChannel(userId, channelId);
        res.status(200).json(result);
    }

    // POST /api/communities/:id/categories
    public static async createCategory(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const communityId = req.params.id as string;
        const category = await channelService.createCategory(userId, communityId, req.body);
        res.status(201).json(category);
    }

    // PATCH /api/categories/:id
    public static async updateCategory(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const categoryId = req.params.id as string;
        const category = await channelService.updateCategory(userId, categoryId, req.body);
        res.status(200).json(category);
    }

    // DELETE /api/categories/:id
    public static async deleteCategory(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const categoryId = req.params.id as string;
        const result = await channelService.deleteCategory(userId, categoryId);
        res.status(200).json(result);
    }
}
