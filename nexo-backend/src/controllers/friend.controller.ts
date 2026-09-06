import { Request, Response } from 'express';
import { requireUserId } from '../lib/errors';
import * as friendService from '../services/friend.service';

export class FriendController {
    /**
     * POST /friends/request
     * Send a friend request.
     */
    public static async sendRequest(req: Request, res: Response): Promise<void> {
        const senderId = requireUserId(req);
        const { receiverId } = req.body;
        const friendRequest = await friendService.sendRequest(senderId, receiverId);
        res.status(201).json(friendRequest);
    }

    /**
     * PATCH /friends/request/:id/accept
     * Accept a friend request.
     */
    public static async acceptRequest(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const { id } = res.locals.params;
        const updatedRequest = await friendService.acceptRequest(userId, id);
        res.status(200).json(updatedRequest);
    }

    /**
     * PATCH /friends/request/:id/reject
     * Reject a friend request.
     */
    public static async rejectRequest(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const { id } = res.locals.params;
        const updatedRequest = await friendService.rejectRequest(userId, id);
        res.status(200).json(updatedRequest);
    }

    /**
     * GET /friends/requests/pending
     * List pending friend requests received by the current user.
     */
    public static async getPendingRequests(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const pendingRequests = await friendService.getPendingRequests(userId);
        res.status(200).json(pendingRequests);
    }

    /**
     * GET /friends
     * List the current user's friends.
     */
    public static async getFriends(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const friends = await friendService.getFriends(userId);
        res.status(200).json(friends);
    }

    /**
     * GET /friends/status/:userId
     * Relationship status with another user (for the profile modal).
     */
    public static async getFriendStatus(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const { userId: otherUserId } = res.locals.params;
        const status = await friendService.getFriendStatus(userId, otherUserId);
        res.status(200).json(status);
    }

    /**
     * DELETE /friends/:userId
     * Remove a friend (deletes the friendship and prior requests so they can re-add).
     */
    public static async removeFriend(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const { userId: otherUserId } = res.locals.params;
        const result = await friendService.removeFriend(userId, otherUserId);
        res.status(200).json(result);
    }

    /**
     * POST /friends/dm/:userId
     * Get or create a DM conversation with another user.
     */
    public static async getOrCreateDM(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const { userId: otherUserId } = res.locals.params;
        const result = await friendService.getOrCreateDM(userId, otherUserId);
        res.status(200).json(result);
    }

    /**
     * GET /friends/dm/conversations
     * List all DM conversations for the current user.
     */
    public static async getDMConversations(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const result = await friendService.getDMConversations(userId);
        res.status(200).json(result);
    }

    /**
     * PATCH /friends/dm/conversations/:channelId/hide
     * Hide a DM conversation for the current user only.
     */
    public static async hideDMConversation(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const { channelId } = res.locals.params;
        const result = await friendService.hideDMConversation(userId, channelId);
        res.status(200).json(result);
    }
}
