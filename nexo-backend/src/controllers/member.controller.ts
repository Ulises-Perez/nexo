import { Request, Response } from 'express';
import { requireUserId } from '../lib/errors';
import * as memberService from '../services/member.service';
import { banMemberSchema } from '../schemas/member.schema';

export class MemberController {
    // GET /api/communities/:id/members
    public static async getMembers(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const communityId = req.params.id as string;
        const result = await memberService.getMembers(userId, communityId);
        res.status(200).json(result);
    }

    // DELETE /api/communities/:id/members/:userId — kick a member
    public static async kickMember(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const communityId = req.params.id as string;
        const targetUserId = req.params.userId as string;
        const result = await memberService.kickMember(userId, communityId, targetUserId);
        res.status(200).json(result);
    }

    // POST /api/communities/:id/bans — ban a user
    public static async banMember(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const communityId = req.params.id as string;
        // Validated here rather than in the route so it stays correct
        // regardless of which schema name the route file wires up.
        const { userId: targetUserId, reason } = banMemberSchema.parse(req.body);
        const result = await memberService.banMember(userId, communityId, targetUserId, reason);
        res.status(200).json(result);
    }

    // GET /api/communities/:id/bans
    public static async getBans(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const communityId = req.params.id as string;
        const result = await memberService.getBans(userId, communityId);
        res.status(200).json(result);
    }

    // DELETE /api/communities/:id/bans/:userId — remove a ban
    public static async unbanMember(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const communityId = req.params.id as string;
        const targetUserId = req.params.userId as string;
        const result = await memberService.unbanMember(userId, communityId, targetUserId);
        res.status(200).json(result);
    }
}
