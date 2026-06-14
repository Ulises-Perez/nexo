import { PrismaClient } from '@prisma/client';

// Agrega prisma a las variables globales de NodeJS en desarrollo
// para evitar el problema de "too many connections" al recargar.
declare global {
    var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
    global.prisma = prisma;
}
