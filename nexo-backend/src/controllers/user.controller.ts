import { Request, Response } from 'express';
import { requireUserId } from '../lib/errors';
import * as userService from '../services/user.service';

export class UserController {
    public static async getMe(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const user = await userService.getMe(userId);
        res.status(200).json(user);
    }

    // PATCH /api/users/me — update username, avatar and profile fields
    public static async updateMe(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const user = await userService.updateMe(userId, req.body);
        res.status(200).json(user);
    }

    public static async search(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const { q } = res.locals.query;
        const users = await userService.search(userId, q);
        res.status(200).json(users);
    }

    public static async getById(req: Request, res: Response): Promise<void> {
        requireUserId(req);
        const { id } = res.locals.params;
        const user = await userService.getById(id);
        res.status(200).json(user);
    }

    // POST /api/users/me/connections — add a self-declared connection
    public static async addConnection(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const connection = await userService.addConnection(userId, req.body);
        res.status(201).json(connection);
    }

    // DELETE /api/users/me/connections/:id — remove one of your own connections
    public static async removeConnection(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const { id } = res.locals.params;
        const result = await userService.removeConnection(userId, id);
        res.status(200).json(result);
    }

    // GET /api/users/:id/mutual-friends
    public static async getMutualFriends(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const { id } = res.locals.params;
        const result = await userService.getMutualFriends(userId, id);
        res.status(200).json(result);
    }

    // GET /api/users/:id/mutual-communities
    public static async getMutualCommunities(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const { id } = res.locals.params;
        const result = await userService.getMutualCommunities(userId, id);
        res.status(200).json(result);
    }

    // GET /api/users/:id/profile-card — profile + both "in common" lists in a
    // single round-trip (used by the DM user card).
    public static async getProfileCard(req: Request, res: Response): Promise<void> {
        const userId = requireUserId(req);
        const { id } = res.locals.params;
        const result = await userService.getProfileCard(userId, id);
        res.status(200).json(result);
    }
}
