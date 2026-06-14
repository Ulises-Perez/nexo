import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';

// Input validation utilities
function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function isValidUsername(username: string): boolean {
    // Username: 3-30 chars, alphanumeric and underscores only
    const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
    return usernameRegex.test(username);
}

function isValidPassword(password: string): boolean {
    // Password: minimum 8 characters
    return password.length >= 8;
}

export class AuthController {
    public static async register(req: Request, res: Response): Promise<void> {
        try {
            const { username, email, password, avatarUrl } = req.body;

            // Validación de campos requeridos
            if (!username || !email || !password) {
                res.status(400).json({ error: "Username, email and password are required" });
                return;
            }

            // Validación de formato de email
            if (!isValidEmail(email)) {
                res.status(400).json({ error: "Invalid email format" });
                return;
            }

            // Validación de username
            if (!isValidUsername(username)) {
                res.status(400).json({ error: "Username must be 3-30 characters, alphanumeric and underscores only" });
                return;
            }

            // Validación de password
            if (!isValidPassword(password)) {
                res.status(400).json({ error: "Password must be at least 8 characters" });
                return;
            }

            // Sanitización básica
            const sanitizedUsername = username.trim();
            const sanitizedEmail = email.toLowerCase().trim();

            const user = await AuthService.register({
                username: sanitizedUsername,
                email: sanitizedEmail,
                passwordHash: password,
                avatarUrl
            });

            res.status(201).json({ message: "User registered successfully", user });
        } catch (error: any) {
            if (error.message === 'Email or Username already exists') {
                res.status(400).json({ error: error.message });
            } else {
                console.error("[AuthController - Register Error]", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        }
    }

    public static async login(req: Request, res: Response): Promise<void> {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                res.status(400).json({ error: "Email and password are required" });
                return;
            }

            // Validación de formato de email
            if (!isValidEmail(email)) {
                res.status(400).json({ error: "Invalid email format" });
                return;
            }

            const session = await AuthService.login(email.toLowerCase().trim(), password);

            res.status(200).json({ message: "Login successful", ...session });
        } catch (error: any) {
            if (error.message === 'Invalid credentials') {
                res.status(401).json({ error: error.message });
            } else {
                console.error("[AuthController - Login Error]", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        }
    }
}
