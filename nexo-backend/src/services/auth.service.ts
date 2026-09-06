import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';
import { conflict, isPrismaError, unauthorized } from '../lib/errors';

// Constant-time-ish decoy: hashed once at module load so a login attempt for
// an unknown email still pays the same bcrypt.compare cost as a real one,
// and the response timing does not reveal whether the account exists.
const DUMMY_HASH = bcrypt.hashSync('nexo-dummy-password', 10);

export class AuthService {
    private static readonly JWT_SECRET = process.env.JWT_SECRET;

    private static getJwtSecret(): string {
        if (!AuthService.JWT_SECRET) {
            throw new Error('JWT_SECRET environment variable is not set');
        }
        return AuthService.JWT_SECRET;
    }

    private static generateTag(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let tag = '';
        for (let i = 0; i < 4; i++) {
            tag += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return tag;
    }

    public static async register(data: { username: string; email: string; password: string; avatarUrl?: string }) {
        const hashedPassword = await bcrypt.hash(data.password, 10);
        const tag = this.generateTag();

        try {
            const user = await prisma.user.create({
                data: {
                    username: data.username,
                    tag,
                    email: data.email,
                    passwordHash: hashedPassword,
                    avatarUrl: data.avatarUrl,
                },
                select: {
                    id: true,
                    username: true,
                    tag: true,
                    email: true,
                    avatarUrl: true,
                    createdAt: true,
                },
            });

            return user;
        } catch (err) {
            if (isPrismaError(err, 'P2002')) {
                throw conflict('Email or username already taken');
            }
            throw err;
        }
    }

    public static async login(email: string, password: string) {
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            // Unknown email: still run a bcrypt.compare against a decoy hash so
            // the timing looks the same as a real "wrong password" attempt.
            await bcrypt.compare(password, DUMMY_HASH);
            throw unauthorized('Invalid credentials');
        }

        const isValidPassword = await bcrypt.compare(password, user.passwordHash);
        if (!isValidPassword) {
            throw unauthorized('Invalid credentials');
        }

        const token = jwt.sign(
            { userId: user.id },
            this.getJwtSecret(),
            { expiresIn: '7d' }
        );

        return {
            user: {
                id: user.id,
                username: user.username,
                tag: user.tag,
                email: user.email,
                avatarUrl: user.avatarUrl,
            },
            token,
        };
    }
}
