import { Server } from 'socket.io';
import { socketAuth, AuthenticatedSocket } from '../middlewares/socketAuth';
import { prisma } from '../db/prisma';
import { Permissions, getMemberContext, hasPermission, getCommunityIdOfChannel, isUserMemberOfChannel } from '../lib/permissions';
import { MAX_ATTACHMENTS_PER_MESSAGE, MAX_MESSAGE_LENGTH, validateAttachmentInput, type AttachmentInput } from '../lib/attachments';
import { collectAttachmentKeys, purgeAttachmentObjects } from '../lib/attachmentCleanup';
import {
    addVoiceParticipant,
    removeVoiceParticipant,
    getVoiceParticipants,
    findVoiceChannelOfSocket,
    findVoiceSessionsOfUser,
    getCommunityIdOfVoiceChannel,
    setParticipantMuted,
    setParticipantSharing,
    getVoiceStates,
} from './voiceState';

const userSockets = new Map<string, Set<string>>();

// Offline announcements are debounced: a user whose last socket drops gets a
// short grace window to come back (app restart, network blip, backend
// redeploy). If they reconnect in time, contacts never see an offline/online
// flap and the database is not written twice.
const OFFLINE_GRACE_MS = 8000;
const pendingOffline = new Map<string, NodeJS.Timeout>();

// Access-check + delivery target for send_message, collapsed into a single
// query (vs. isUserMemberOfChannel's separate conversation lookup for DMs).
type SendContext =
    | { kind: 'dm'; userAId: string; userBId: string }
    | { kind: 'community'; communityId: string };

// This runs on every single message send — the hottest path in the app — so a
// valid result is cached briefly in memory to skip the DB round trip on
// consecutive sends. Only VALID contexts are cached (never null/denied), so
// someone freshly added to a channel isn't stuck failing for the TTL window.
// Trade-off: someone removed from a channel can still send for up to
// SEND_CONTEXT_TTL_MS afterwards.
const sendContextCache = new Map<string, { ctx: SendContext; expiresAt: number }>();
const SEND_CONTEXT_TTL_MS = 30_000;

// Purga periódica de entradas vencidas — sin esto el Map crece sin límite
// (una entrada por par userId:channelId visto alguna vez) porque las lecturas
// solo ignoran las entradas vencidas, no las borran.
const SEND_CONTEXT_PURGE_INTERVAL_MS = 5 * 60_000;
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of sendContextCache) {
        if (entry.expiresAt <= now) sendContextCache.delete(key);
    }
}, SEND_CONTEXT_PURGE_INTERVAL_MS).unref();

// Drops every cached send context of a user (keys are `${userId}:${channelId}`)
// so a kicked/banned member cannot keep sending for the remaining TTL.
export function invalidateSendContext(userId: string): void {
    const prefix = `${userId}:`;
    for (const key of sendContextCache.keys()) {
        if (key.startsWith(prefix)) sendContextCache.delete(key);
    }
}

async function getChannelSendContext(userId: string, channelId: string): Promise<SendContext | null> {
    const cacheKey = `${userId}:${channelId}`;
    const cached = sendContextCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.ctx;

    const channel = await prisma.channel.findUnique({
        where: { id: channelId },
        select: {
            type: true,
            conversation: { select: { userAId: true, userBId: true } },
            category: {
                select: {
                    communityId: true,
                    community: { select: { members: { where: { userId }, select: { userId: true } } } }
                }
            }
        }
    });
    if (!channel) return null;

    let ctx: SendContext | null = null;
    if (channel.type === 'dm') {
        const conv = channel.conversation;
        if (conv && (conv.userAId === userId || conv.userBId === userId)) {
            ctx = { kind: 'dm', userAId: conv.userAId, userBId: conv.userBId };
        }
    } else {
        const communityId = channel.category?.communityId;
        if (communityId && (channel.category?.community?.members?.length ?? 0) > 0) {
            ctx = { kind: 'community', communityId };
        }
    }

    if (ctx) sendContextCache.set(cacheKey, { ctx, expiresAt: Date.now() + SEND_CONTEXT_TTL_MS });
    return ctx;
}

const updateUserStatus = async (userId: string, status: string) => {
    await prisma.user.update({
        where: { id: userId },
        data: { status },
    });
};

const getFriendsOfUser = async (userId: string): Promise<string[]> => {
    const friendships = await prisma.friendship.findMany({
        where: {
            OR: [{ userAId: userId }, { userBId: userId }],
        },
    });
    return friendships.map(f => f.userAId === userId ? f.userBId : f.userAId);
};

// IDs de los usuarios con los que se comparte una conversación DM
const getDMPartnersOfUser = async (userId: string): Promise<string[]> => {
    const conversations = await prisma.conversation.findMany({
        where: {
            OR: [{ userAId: userId }, { userBId: userId }],
        },
        select: { userAId: true, userBId: true },
    });
    return conversations.map(c => c.userAId === userId ? c.userBId : c.userAId);
};

// Notifies friends and DM partners of a status change (online/offline) with a
// single multi-room emit; the room list is de-duplicated so nobody gets the
// event twice.
const emitStatusToFriends = async (io: Server, userId: string, status: string) => {
    const [friendIds, dmPartnerIds] = await Promise.all([
        getFriendsOfUser(userId),
        getDMPartnersOfUser(userId),
    ]);

    const rooms = Array.from(new Set([...friendIds, ...dmPartnerIds]), id => `user:${id}`);
    if (rooms.length === 0) return;
    io.to(rooms).emit('friend_status', { userId, status });
};

// Runs when the offline grace window elapses without a reconnection.
const announceOffline = async (io: Server, userId: string) => {
    pendingOffline.delete(userId);
    // A socket may have connected while the timer was firing.
    if (userSockets.has(userId)) return;
    try {
        await updateUserStatus(userId, 'offline');
        await emitStatusToFriends(io, userId, 'offline');
        console.log(`[Socket.io] User ${userId} está offline`);
    } catch (error) {
        console.error('[Socket.io] Error notificando offline:', error);
    }
};

const getCommunityIdsOfUser = async (userId: string): Promise<string[]> => {
    const memberships = await prisma.communityMember.findMany({
        where: { userId },
        select: { communityId: true },
    });
    return memberships.map(m => m.communityId);
};

// Route a message event to the right realtime audience.
// DM channels deliver to both participants' personal rooms (`user:<id>`) so the
// message arrives even when the recipient does not have the conversation open;
// the recipient only joins a channel room while actively viewing it. Community
// channels keep broadcasting to the channel room as before.
const emitToChannelMembers = async (io: Server, channelId: string, event: string, payload: unknown) => {
    const conversation = await prisma.conversation.findUnique({
        where: { channelId },
        select: { userAId: true, userBId: true },
    });
    if (conversation) {
        io.to([`user:${conversation.userAId}`, `user:${conversation.userBId}`]).emit(event, payload);
        return;
    }
    io.to(channelId).emit(event, payload);
};

// Removes a socket from whatever voice channel it is in: drops the
// participant, leaves the `voice:<channelId>` room and optionally notifies the
// rest. Module-level (and exported) because join_voice evicts other sockets
// of the same user, and io.ts evicts kicked/banned members.
export const removeSocketFromVoice = async (io: Server, socketId: string, notify = true) => {
    const channelId = findVoiceChannelOfSocket(socketId);
    if (!channelId) return;

    // Resolve the community before removal: once the last participant leaves
    // the channel entry is gone and the stored communityId with it.
    const communityId = getCommunityIdOfVoiceChannel(channelId);
    removeVoiceParticipant(channelId, socketId);
    io.in(socketId).socketsLeave(`voice:${channelId}`);

    if (notify) {
        io.to(`voice:${channelId}`).emit('voice_peer_left', { socketId, channelId });
        emitVoiceStateUpdate(io, channelId, communityId);
    }
};

// Broadcasts the current roster of a voice channel to its community room.
// The community id is stored on each participant at join time, so this never
// touches the database; callers that already know it pass it explicitly
// (needed right after the last participant left).
const emitVoiceStateUpdate = (io: Server, channelId: string, communityId?: string | null) => {
    const target = communityId ?? getCommunityIdOfVoiceChannel(channelId);
    if (!target) return;
    io.to(`community:${target}`).emit('voice_state_update', {
        channelId,
        participants: getVoiceParticipants(channelId),
    });
};

export const setupSockets = (io: Server) => {
    io.use(socketAuth as any);

    io.on('connection', async (socket) => {
        const authSocket = socket as AuthenticatedSocket;
        const userId = authSocket.data.userId;

        console.log(`[Socket.io] Usuario Conectado. Socket ID: ${socket.id} - User ID: ${userId}`);

        // Every handler goes through this wrapper so an async rejection is
        // logged instead of becoming an unhandledRejection that kills the
        // process (see crashShutdown in server.ts).
        const on = <T extends unknown[]>(event: string, handler: (...args: T) => void | Promise<void>) =>
            socket.on(event, (...args: T) => {
                Promise.resolve()
                    .then(() => handler(...args))
                    .catch(err => console.error(`[Socket.io] ${event} handler error:`, err));
            });

        // Coming back inside the offline grace window: cancel the pending
        // announcement and skip the online write/broadcast, since from the
        // contacts' point of view this user never left.
        const pendingTimer = pendingOffline.get(userId);
        const wasStillOnline = pendingTimer !== undefined;
        if (pendingTimer) {
            clearTimeout(pendingTimer);
            pendingOffline.delete(userId);
        }

        if (!userSockets.has(userId)) {
            userSockets.set(userId, new Set());
        }
        userSockets.get(userId)!.add(socket.id);

        // Sala personal: sincrónico e infalible, se une antes que nada más
        // pueda fallar más abajo — así los DMs y eventos de estado le siguen
        // llegando a este socket aunque el resto del setup falle.
        socket.join(`user:${userId}`);

        // Datos básicos del usuario (para typing y voz). Se hidratan en el
        // bloque protegido de abajo; si falla, sigue en null y se usa el
        // fallback "Usuario" ya existente en el resto del archivo.
        let me: { username: string; avatarUrl: string | null } | null = null;

        try {
            if (userSockets.get(userId)!.size === 1 && !wasStillOnline) {
                await updateUserStatus(userId, 'online');
                await emitStatusToFriends(io, userId, 'online');
                console.log(`[Socket.io] User ${userId} está online`);
            }

            // Unirse a las salas de todas sus comunidades (para eventos en tiempo real)
            const communityIds = await getCommunityIdsOfUser(userId);
            communityIds.forEach(id => socket.join(`community:${id}`));

            me = await prisma.user.findUnique({
                where: { id: userId },
                select: { username: true, avatarUrl: true },
            });

            socket.emit('my_status', { status: 'online' });
        } catch (error) {
            // Si esto tira (p. ej. la base reiniciando), sin este catch el
            // callback de 'connection' corta acá y NUNCA se registran los
            // socket.on(...) de abajo — incluido 'disconnect'. El socket
            // queda conectado a nivel de transporte pero sin ningún listener,
            // y la entrada en userSockets nunca se limpia (queda un "zombie"
            // permanente). Loguear y seguir: la sesión queda degradada
            // (sin salas de comunidad, sin username propio) hasta que el
            // cliente reconecte solo.
            console.error('[Socket.io] Error en setup de conexión:', error);
        }

        // El cliente lo emite tras crear o unirse a una comunidad
        on('join_community_room', async (communityId: string) => {
            try {
                const ctx = await getMemberContext(userId, communityId);
                if (!ctx) return;
                socket.join(`community:${communityId}`);
            } catch (error) {
                console.error('[Socket.io] Error en join_community_room:', error);
            }
        });

        on('join_channel', async (channelId: string) => {
            try {
                // Verificar que el usuario tiene acceso al canal
                const hasAccess = await isUserMemberOfChannel(userId, channelId);
                if (!hasAccess) {
                    console.log(`[Socket.io] User ${userId} intentó unirse a canal no autorizado: ${channelId}`);
                    return;
                }
                socket.join(channelId);
                console.log(`[Socket.io] User ${userId} se unión al canal: ${channelId}`);
            } catch (error) {
                console.error('[Socket.io] Error en join_channel:', error);
            }
        });

        on('leave_channel', (channelId: string) => {
            socket.leave(channelId);
            console.log(`[Socket.io] User ${userId} abandonó el canal: ${channelId}`);
        });

        on('send_message', async (
            data: { channelId: string; content: string; attachments?: unknown[]; clientNonce?: string },
            ack?: (res: { ok: boolean; messageId?: string; error?: string }) => void
        ) => {
            // Older clients don't pass an ack callback; guard against double-ack
            // between the success path and the catch block below.
            let acked = false;
            const respond = (res: { ok: boolean; messageId?: string; error?: string }) => {
                if (acked) return;
                acked = true;
                ack?.(res);
            };

            try {
                const channelId = data?.channelId;
                const content = data?.content ?? '';
                const rawAttachments = data?.attachments;

                if (typeof channelId !== 'string' || !channelId) {
                    respond({ ok: false, error: 'channelId is required' });
                    return;
                }
                if (typeof content !== 'string') {
                    respond({ ok: false, error: 'content must be a string' });
                    return;
                }
                if (content.length > MAX_MESSAGE_LENGTH) {
                    respond({ ok: false, error: `content exceeds ${MAX_MESSAGE_LENGTH} characters` });
                    return;
                }
                if (rawAttachments !== undefined && !Array.isArray(rawAttachments)) {
                    respond({ ok: false, error: 'attachments must be an array' });
                    return;
                }
                if (rawAttachments && rawAttachments.length > MAX_ATTACHMENTS_PER_MESSAGE) {
                    respond({ ok: false, error: `at most ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message` });
                    return;
                }

                const attachments: AttachmentInput[] = [];
                for (const raw of rawAttachments ?? []) {
                    const result = validateAttachmentInput(raw);
                    if (!result.ok) {
                        respond({ ok: false, error: result.error });
                        return;
                    }
                    attachments.push(result.value);
                }

                if (content.trim() === '' && attachments.length === 0) {
                    console.log(`[Socket.io] send_message cancelado: datos vacíos`);
                    respond({ ok: false, error: 'message is empty' });
                    return;
                }

                // Verificar acceso al canal y obtener el público de entrega en una sola query.
                const ctx = await getChannelSendContext(userId, channelId);
                if (!ctx) {
                    console.log(`[Socket.io] User ${userId} intentó enviar mensaje a canal no autorizado: ${channelId}`);
                    respond({ ok: false });
                    return;
                }

                const newMessage = await prisma.message.create({
                    data: {
                        content,
                        channelId,
                        userId,
                        attachments: attachments.length > 0 ? {
                            create: attachments.map(att => ({
                                name: att.name,
                                size: att.size,
                                mimeType: att.mimeType,
                                url: att.url,
                                objectKey: att.objectKey,
                                type: att.type
                            }))
                        } : undefined
                    },
                    include: {
                        user: {
                            select: { id: true, username: true, avatarUrl: true, status: true }
                        },
                        attachments: true
                    }
                });

                // Persistido: la subida termina acá. Fallas de entrega en tiempo real
                // (broadcast) no deben tumbar el ack.
                respond({ ok: true, messageId: newMessage.id });

                if (ctx.kind === 'dm') {
                    // Reaparece la conversación para quien la hubiese ocultado.
                    await prisma.conversation.updateMany({
                        where: { channelId },
                        data: { hiddenForA: false, hiddenForB: false }
                    });
                }

                // clientNonce se refleja tal cual a todos los clientes (incluido el
                // emisor) para que puedan reconciliar su eco optimista — no se persiste.
                const nonce = typeof data.clientNonce === 'string' && data.clientNonce.length <= 64
                    ? data.clientNonce
                    : undefined;
                const payload = nonce ? { ...newMessage, clientNonce: nonce } : newMessage;

                // El color de rol se resuelve en el cliente vía
                // communityStore.getMemberRoleColor; no se adjunta aquí
                // para evitar dos queries por mensaje en la ruta más caliente.
                if (ctx.kind === 'dm') {
                    io.to(`user:${ctx.userAId}`).emit('new_message', payload);
                    io.to(`user:${ctx.userBId}`).emit('new_message', payload);
                } else {
                    io.to(channelId).emit('new_message', payload);
                    io.to(`community:${ctx.communityId}`).emit('channel_unread', { channelId, communityId: ctx.communityId, senderId: userId });
                }

            } catch (error) {
                console.error('[Socket.io] Error guardando mensaje:', error);
                respond({ ok: false });
            }
        });

        // Editar un mensaje propio
        on('edit_message', async (data: { messageId: string; content: string }) => {
            try {
                const { messageId, content } = data;
                if (!messageId || !content || content.trim() === '') return;

                const message = await prisma.message.findUnique({ where: { id: messageId } });
                if (!message || message.userId !== userId) return;

                const updated = await prisma.message.update({
                    where: { id: messageId },
                    data: { content: content.trim(), isEdited: true },
                    include: {
                        user: {
                            select: { id: true, username: true, avatarUrl: true, status: true }
                        },
                        attachments: true
                    }
                });

                await emitToChannelMembers(io, message.channelId, 'message_updated', updated);
            } catch (error) {
                console.error('[Socket.io] Error editando mensaje:', error);
            }
        });

        // Eliminar un mensaje (autor, o moderador con MANAGE_MESSAGES en la comunidad)
        on('delete_message', async (data: { messageId: string }) => {
            try {
                const { messageId } = data;
                if (!messageId) return;

                const message = await prisma.message.findUnique({ where: { id: messageId } });
                if (!message) return;

                if (message.userId !== userId) {
                    const communityId = await getCommunityIdOfChannel(message.channelId);
                    if (!communityId) return; // En DMs solo el autor puede borrar
                    const ctx = await getMemberContext(userId, communityId);
                    if (!hasPermission(ctx, Permissions.MANAGE_MESSAGES)) return;
                }

                const keys = await collectAttachmentKeys({ messageId });
                await prisma.message.delete({ where: { id: messageId } });
                purgeAttachmentObjects(keys);
                await emitToChannelMembers(io, message.channelId, 'message_deleted', { messageId, channelId: message.channelId });
            } catch (error) {
                console.error('[Socket.io] Error eliminando mensaje:', error);
            }
        });

        // Indicador de "escribiendo..."
        on('typing', (data: { channelId: string }) => {
            if (typeof data?.channelId !== 'string' || !data.channelId) return;
            // Only sockets that actually joined the channel room may signal typing in it.
            if (!socket.rooms.has(data.channelId)) return;
            socket.to(data.channelId).emit('user_typing', {
                channelId: data.channelId,
                userId,
                username: me?.username ?? 'Usuario',
            });
        });

        // ===================== Canales de Voz (señalización WebRTC) =====================

        const leaveVoice = (notify = true) => removeSocketFromVoice(io, socket.id, notify);

        on('join_voice', async (
            data: { channelId: string },
            ack?: (res: { ok: boolean; code?: 'not_found' | 'forbidden' | 'error'; retryable?: boolean }) => void
        ) => {
            // Mismo guard anti-doble-ack que send_message: clientes viejos no
            // mandan ack, y el catch de abajo no debe pisar una respuesta ya enviada.
            let acked = false;
            const respond = (res: { ok: boolean; code?: 'not_found' | 'forbidden' | 'error'; retryable?: boolean }) => {
                if (acked) return;
                acked = true;
                ack?.(res);
            };

            try {
                const { channelId } = data;
                if (!channelId) {
                    respond({ ok: false, code: 'not_found', retryable: false });
                    return;
                }

                const channel = await prisma.channel.findUnique({ where: { id: channelId } });
                if (!channel || channel.type !== 'voice') {
                    respond({ ok: false, code: 'not_found', retryable: false });
                    return;
                }

                const hasAccess = await isUserMemberOfChannel(userId, channelId);
                if (!hasAccess) {
                    console.log(`[Socket.io] User ${userId} sin acceso a canal de voz: ${channelId}`);
                    respond({ ok: false, code: 'forbidden', retryable: false });
                    return;
                }

                // Si ya estaba en otro canal de voz, salir primero
                await leaveVoice();

                // Repara una sesión degradada: un socket que se conectó con la DB
                // caída tiene `me === null` y nunca se unió a sus salas
                // `community:*`. La DB ya probadamente responde (el chequeo de
                // acceso de arriba pasó), así que si esto tira, cae al catch
                // externo y responde retryable — correcto.
                if (!me) {
                    me = await prisma.user.findUnique({
                        where: { id: userId },
                        select: { username: true, avatarUrl: true },
                    });
                }
                const communityId = await getCommunityIdOfChannel(channelId);
                if (communityId) {
                    socket.join(`community:${communityId}`);
                }

                // Una sola sesión de voz por usuario: si está en voz desde otra
                // instancia (navegador, otra PC), esa sesión se reemplaza por esta.
                // Se hace acá, justo antes de leer `existingPeers`, para no dejar
                // ningún await entre el chequeo y el alta propia (evita una
                // ventana de carrera con un segundo join casi simultáneo).
                for (const stale of findVoiceSessionsOfUser(userId, socket.id)) {
                    await removeSocketFromVoice(io, stale.socketId);
                    io.to(stale.socketId).emit('voice_session_replaced', { channelId: stale.channelId });
                }

                const existingPeers = getVoiceParticipants(channelId);

                const newParticipant = {
                    socketId: socket.id,
                    userId,
                    username: me?.username ?? 'Usuario',
                    avatarUrl: me?.avatarUrl ?? null,
                    muted: false,
                    sharing: false,
                    shareId: null,
                    // Stored so roster broadcasts never query the DB per event.
                    communityId,
                };
                addVoiceParticipant(channelId, newParticipant);

                socket.join(`voice:${channelId}`);

                // El que entra recibe la lista de peers existentes (él inicia las ofertas WebRTC)
                socket.emit('voice_joined', { channelId, peers: existingPeers });

                // Los demás se enteran del nuevo peer (esperan su oferta)
                socket.to(`voice:${channelId}`).emit('voice_peer_joined', {
                    channelId,
                    peer: newParticipant,
                });

                // Trabajo principal ya hecho: ack antes del broadcast de estado,
                // para que una falla en emitVoiceStateUpdate no envenene el ack.
                respond({ ok: true });

                emitVoiceStateUpdate(io, channelId);
            } catch (error) {
                console.error('[Socket.io] Error en join_voice:', error);
                respond({ ok: false, code: 'error', retryable: true });
            }
        });

        on('leave_voice', async () => {
            try {
                await leaveVoice();
            } catch (error) {
                console.error('[Socket.io] Error en leave_voice:', error);
            }
        });

        // Relay de señalización WebRTC (ofertas, respuestas y candidatos ICE)
        on('voice_signal', (data: { to: string; signal: any }) => {
            if (typeof data?.to !== 'string' || !data.to || !data?.signal) return;
            // Only relay signaling between two sockets that share the same voice channel.
            const ownChannel = findVoiceChannelOfSocket(socket.id);
            const targetChannel = findVoiceChannelOfSocket(data.to);
            if (!ownChannel || !targetChannel || ownChannel !== targetChannel) return;
            io.to(data.to).emit('voice_signal', {
                from: socket.id,
                userId,
                signal: data.signal,
            });
        });

        on('voice_mute', async (data: { muted: boolean }) => {
            const channelId = findVoiceChannelOfSocket(socket.id);
            if (!channelId) return;
            setParticipantMuted(channelId, socket.id, !!data?.muted);
            emitVoiceStateUpdate(io, channelId);
        });

        on('start_screen_share', async (data: { shareId: string; presetId?: string; audio?: boolean; codec?: string }) => {
            const channelId = findVoiceChannelOfSocket(socket.id);
            if (!channelId || typeof data?.shareId !== 'string') return;
            // Quality metadata is optional: an older client that only sends
            // `shareId` keeps working exactly as before (info stays undefined).
            const info = typeof data?.presetId === 'string'
                ? { presetId: data.presetId, audio: !!data.audio, codec: typeof data.codec === 'string' ? data.codec : '' }
                : undefined;
            setParticipantSharing(channelId, socket.id, true, data.shareId, info);
            emitVoiceStateUpdate(io, channelId);
        });

        on('stop_screen_share', async () => {
            const channelId = findVoiceChannelOfSocket(socket.id);
            if (!channelId) return;
            setParticipantSharing(channelId, socket.id, false, null);
            emitVoiceStateUpdate(io, channelId);
        });

        // El cliente pide el estado de voz de los canales de una comunidad
        on('get_voice_states', (data: { channelIds: string[] }, callback?: (states: any) => void) => {
            if (!Array.isArray(data?.channelIds)) return;
            const states = getVoiceStates(data.channelIds);
            if (typeof callback === 'function') {
                callback(states);
            } else {
                socket.emit('voice_states', states);
            }
        });

        on('disconnect', async () => {
            console.log(`[Socket.io] Usuario Desconectado. Socket ID: ${socket.id} - User ID: ${userId}`);

            // Tres fallas aisladas a propósito, no un único try/catch: este es
            // el handler más frecuente de todos (corre en cada logout, cierre
            // de app, corte de red), así que ningún error acá puede tirar el
            // proceso — pero tampoco puede dejar la limpieza de userSockets
            // acoplada a una llamada que puede fallar (leaveVoice), ni el aviso
            // de "offline" silenciado por un error que no tiene nada que ver.

            try {
                await leaveVoice();
            } catch (error) {
                console.error('[Socket.io] Error saliendo de voz en disconnect:', error);
            }

            // Limpieza sincrónica, infalible: siempre corre, pase lo que pase arriba.
            userSockets.get(userId)?.delete(socket.id);
            const isLastSocket = userSockets.get(userId)?.size === 0;
            if (isLastSocket) {
                userSockets.delete(userId);
            }

            if (isLastSocket) {
                // Debounced: the DB write and the broadcast happen only if the
                // user does not come back within OFFLINE_GRACE_MS.
                const existing = pendingOffline.get(userId);
                if (existing) clearTimeout(existing);
                const timer = setTimeout(() => { void announceOffline(io, userId); }, OFFLINE_GRACE_MS);
                timer.unref();
                pendingOffline.set(userId, timer);
            }
        });
    });
};
