import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';

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

    public static async register(data: { username: string; email: string; passwordHash: string; avatarUrl?: string }) {
        // 1. Verificamos si el usuario ya existe
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [{ email: data.email }, { username: data.username }],
            },
        });

        if (existingUser) {
            throw new Error('Email or Username already exists');
        }

        // 2. Hasheamos la password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(data.passwordHash, salt);

        // 3. Generamos un tag aleatorio
        const tag = this.generateTag();

        // 4. Creamos el usuario en la BD
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
            }
        });

        return user;
    }

    public static async login(email: string, passwordHash: string) {
        // 1. Buscamos al usuario por correo electrónico
        const user = await prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            throw new Error('Invalid credentials');
        }

        // 2. Comparamos las contraseñas
        const isValidPassword = await bcrypt.compare(passwordHash, user.passwordHash);

        if (!isValidPassword) {
            throw new Error('Invalid credentials');
        }

        // 3. Generamos el JWT
        const token = jwt.sign(
            { userId: user.id },
            this.getJwtSecret(),
            { expiresIn: '7d' } // El token expira en 7 días
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
