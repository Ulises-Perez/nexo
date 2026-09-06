import { prisma } from '../db/prisma';
import {
    Permissions,
    getMemberContext,
    hasPermission,
    getCommunityIdOfChannel,
    isUserMemberOfChannel,
} from '../lib/permissions';
import { emitCommunityUpdated } from '../sockets/io';
import { collectAttachmentKeys, purgeAttachmentObjects } from '../lib/attachmentCleanup';
import { forbidden, notFound, badRequest } from '../lib/errors';
import type {
    CreateChannelInput,
    UpdateChannelInput,
    CreateCategoryInput,
    UpdateCategoryInput,
    GetMessagesQuery,
} from '../schemas/channel.schema';

// Text channels use Discord-style names: lowercase and hyphenated.
function normalizeChannelName(name: string, type: string): string {
    if (type === 'voice') return name;
    return name.toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-');
}

export async function getMessages(userId: string, channelId: string, query: GetMessagesQuery) {
    // Only conversation participants (DM) or community members may read a channel.
    const hasAccess = await isUserMemberOfChannel(userId, channelId);
    if (!hasAccess) throw forbidden();

    const { before, limit } = query;

    // Cursor pagination: `before` is the oldest message the client already
    // loaded; `limit` caps the page size. Queried in descending order so the
    // page returned is always the most recent one (or the one before the
    // cursor), then reversed for rendering.
    const messages = await prisma.message.findMany({
        where: { channelId },
        include: {
            user: {
                select: {
                    id: true,
                    username: true,
                    avatarUrl: true,
                    status: true,
                },
            },
            attachments: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    });

    // Client renders top (oldest) to bottom (newest).
    messages.reverse();

    return messages;
}

// Fire-and-forget: called by the controller after the response is already
// sent, so this write never adds latency to the hottest read path.
export function markChannelRead(channelId: string, userId: string) {
    return prisma.message.updateMany({
        where: {
            channelId,
            userId: { not: userId },
            readAt: null,
        },
        data: {
            readAt: new Date(),
        },
    });
}

export async function createChannel(userId: string, communityId: string, data: CreateChannelInput) {
    const ctx = await getMemberContext(userId, communityId);
    if (!hasPermission(ctx, Permissions.MANAGE_CHANNELS)) {
        throw forbidden('Missing permission: MANAGE_CHANNELS');
    }

    // The category must belong to this community.
    const category = await prisma.category.findFirst({
        where: { id: data.categoryId, communityId },
    });
    if (!category) throw badRequest('Invalid category for this community');

    const lastChannel = await prisma.channel.findFirst({
        where: { categoryId: data.categoryId },
        orderBy: { order: 'desc' },
    });

    const channel = await prisma.channel.create({
        data: {
            name: normalizeChannelName(data.name, data.type),
            type: data.type,
            categoryId: data.categoryId,
            order: (lastChannel?.order ?? -1) + 1,
        },
    });

    emitCommunityUpdated(communityId, {
        type: 'channel.created',
        channel: { id: channel.id, name: channel.name, type: channel.type, order: channel.order, categoryId: channel.categoryId! },
    });
    return channel;
}

export async function updateChannel(userId: string, channelId: string, data: UpdateChannelInput) {
    const communityId = await getCommunityIdOfChannel(channelId);
    if (!communityId) throw notFound('Channel not found');

    const ctx = await getMemberContext(userId, communityId);
    if (!hasPermission(ctx, Permissions.MANAGE_CHANNELS)) {
        throw forbidden('Missing permission: MANAGE_CHANNELS');
    }

    const existing = await prisma.channel.findUnique({ where: { id: channelId } });
    const channel = await prisma.channel.update({
        where: { id: channelId },
        data: { name: normalizeChannelName(data.name, existing?.type ?? 'text') },
    });

    emitCommunityUpdated(communityId, {
        type: 'channel.updated',
        channel: { id: channel.id, name: channel.name, type: channel.type, order: channel.order, categoryId: channel.categoryId! },
    });
    return channel;
}

export async function deleteChannel(userId: string, channelId: string) {
    const communityId = await getCommunityIdOfChannel(channelId);
    if (!communityId) throw notFound('Channel not found');

    const ctx = await getMemberContext(userId, communityId);
    if (!hasPermission(ctx, Permissions.MANAGE_CHANNELS)) {
        throw forbidden('Missing permission: MANAGE_CHANNELS');
    }

    let attachmentKeys: string[] = [];
    try {
        attachmentKeys = await collectAttachmentKeys({ channelId });
    } catch (error) {
        console.error('[channel.service] Error collecting attachment keys before channel delete:', error);
    }

    const { count } = await prisma.channel.deleteMany({ where: { id: channelId } });
    if (count === 0) throw notFound('Channel not found');

    purgeAttachmentObjects(attachmentKeys);
    emitCommunityUpdated(communityId, { type: 'channel.deleted', channelId });
    return { success: true };
}

export async function createCategory(userId: string, communityId: string, data: CreateCategoryInput) {
    const ctx = await getMemberContext(userId, communityId);
    if (!hasPermission(ctx, Permissions.MANAGE_CHANNELS)) {
        throw forbidden('Missing permission: MANAGE_CHANNELS');
    }

    const lastCategory = await prisma.category.findFirst({
        where: { communityId },
        orderBy: { order: 'desc' },
    });

    const category = await prisma.category.create({
        data: {
            name: data.name,
            communityId,
            order: (lastCategory?.order ?? -1) + 1,
        },
    });

    emitCommunityUpdated(communityId, {
        type: 'category.created',
        category: { id: category.id, name: category.name, order: category.order },
    });
    return category;
}

export async function updateCategory(userId: string, categoryId: string, data: UpdateCategoryInput) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw notFound('Category not found');

    const ctx = await getMemberContext(userId, category.communityId);
    if (!hasPermission(ctx, Permissions.MANAGE_CHANNELS)) {
        throw forbidden('Missing permission: MANAGE_CHANNELS');
    }

    const updated = await prisma.category.update({
        where: { id: categoryId },
        data: { name: data.name },
    });

    emitCommunityUpdated(category.communityId, {
        type: 'category.updated',
        category: { id: updated.id, name: updated.name, order: updated.order },
    });
    return updated;
}

export async function deleteCategory(userId: string, categoryId: string) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw notFound('Category not found');

    const ctx = await getMemberContext(userId, category.communityId);
    if (!hasPermission(ctx, Permissions.MANAGE_CHANNELS)) {
        throw forbidden('Missing permission: MANAGE_CHANNELS');
    }

    let attachmentKeys: string[] = [];
    try {
        attachmentKeys = await collectAttachmentKeys({ categoryId });
    } catch (error) {
        console.error('[channel.service] Error collecting attachment keys before category delete:', error);
    }

    // Cascades to the category's channels (and their messages).
    const { count } = await prisma.category.deleteMany({ where: { id: categoryId } });
    if (count === 0) throw notFound('Category not found');

    purgeAttachmentObjects(attachmentKeys);
    emitCommunityUpdated(category.communityId, { type: 'category.deleted', categoryId });
    return { success: true };
}
