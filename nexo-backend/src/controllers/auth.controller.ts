import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';

export class AuthController {
    public static async register(req: Request, res: Response): Promise<void> {
        const { username, email, password, avatarUrl } = req.body;

        const user = await AuthService.register({ username, email, password, avatarUrl });

        res.status(201).json({ message: 'User registered successfully', user });
    }

    public static async login(req: Request, res: Response): Promise<void> {
        const { email, password } = req.body;

        const session = await AuthService.login(email, password);

        res.status(200).json({ message: 'Login successful', ...session });
    }
}
