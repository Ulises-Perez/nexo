import { Request, Response } from 'express';
import { requireUserId } from '../lib/errors';
import * as communityService from '../services/community.service';

export class CommunityController {
    public static async getUserCommunities(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const result = await communityService.getUserCommunities(userId);
        res.status(200).json(result);
    }

    // PATCH /api/communities/:id — edit name/icon/description
    public static async updateCommunity(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const communityId = req.params.id as string;
        const updated = await communityService.updateCommunity(userId, communityId, req.body);
        res.status(200).json(updated);
    }

    // DELETE /api/communities/:id — delete community (owner only)
    public static async deleteCommunity(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const communityId = req.params.id as string;
        const result = await communityService.deleteCommunity(userId, communityId);
        res.status(200).json(result);
    }

    public static async createCommunity(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const newCommunity = await communityService.createCommunity(userId, req.body);
        res.status(201).json(newCommunity);
    }

    public static async generateInviteCode(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const communityId = req.params.id as string;
        const result = await communityService.generateInviteCode(userId, communityId);
        res.status(200).json(result);
    }

    public static async joinCommunity(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const code = req.params.code as string;
        const result = await communityService.joinCommunity(userId, code);
        res.status(200).json(result);
    }

    public static async getInviteInfo(req: Request, res: Response): Promise<void> {
        const code = req.params.code as string;
        const community = await communityService.getInviteInfo(code);
        res.status(200).json(community);
    }

    public static async leaveCommunity(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const communityId = req.params.id as string;
        const result = await communityService.leaveCommunity(userId, communityId);
        res.status(200).json(result);
    }
}
