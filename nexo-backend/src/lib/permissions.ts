import { prisma } from '../db/prisma';

// Bitfield de permisos por comunidad (estilo Discord)
export const Permissions = {
    ADMINISTRATOR:    1 << 0, // Acceso total (todos los permisos)
    MANAGE_COMMUNITY: 1 << 1, // Editar nombre/icono/descripción de la comunidad
    MANAGE_CHANNELS:  1 << 2, // Crear/editar/eliminar canales y categorías
    MANAGE_ROLES:     1 << 3, // Crear/editar/eliminar roles y asignarlos
    KICK_MEMBERS:     1 << 4, // Expulsar miembros
    BAN_MEMBERS:      1 << 5, // Banear/desbanear miembros
    MANAGE_MESSAGES:  1 << 6, // Eliminar mensajes de otros
    CREATE_INVITES:   1 << 7, // Generar códigos de invitación
} as const;

export const ALL_PERMISSIONS = Object.values(Permissions).reduce((a, b) => a | b, 0);

export interface MemberContext {
    memberId: string;
    isOwner: boolean;
    permissions: number;
}

// Obtiene la membresía del usuario en la comunidad con sus permisos agregados (OR de roles).
// El dueño siempre tiene todos los permisos. Devuelve null si no es miembro.
export async function getMemberContext(userId: string, communityId: string): Promise<MemberContext | null> {
    const member = await prisma.communityMember.findUnique({
        where: { userId_communityId: { userId, communityId } },
        include: {
            community: { select: { ownerId: true } },
            roles: { include: { role: { select: { permissions: true } } } }
        }
    });

    if (!member) return null;

    const isOwner = member.community.ownerId === userId;
    let permissions = member.roles.reduce((acc, mr) => acc | mr.role.permissions, 0);

    if (isOwner || (permissions & Permissions.ADMINISTRATOR)) {
        permissions = ALL_PERMISSIONS;
    }

    return { memberId: member.id, isOwner, permissions };
}

export function hasPermission(ctx: MemberContext | null, flag: number): boolean {
    if (!ctx) return false;
    if (ctx.isOwner) return true;
    return (ctx.permissions & flag) === flag;
}

// Resuelve la comunidad a la que pertenece un canal (null para canales DM)
export async function getCommunityIdOfChannel(channelId: string): Promise<string | null> {
    const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: { category: { select: { communityId: true } } }
    });
    return channel?.category?.communityId ?? null;
}

