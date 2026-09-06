import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { useAuthStore } from './auth';
import api from '../api/axios';
import { hydrateCache, persistCache, clearPersistedCache, COMMUNITY_MEMBERS_CACHE_KEY } from '../composables/persistedCache';

// Bitfield de permisos (debe coincidir con el backend)
export const Permissions = {
    ADMINISTRATOR:    1 << 0,
    MANAGE_COMMUNITY: 1 << 1,
    MANAGE_CHANNELS:  1 << 2,
    MANAGE_ROLES:     1 << 3,
    KICK_MEMBERS:     1 << 4,
    BAN_MEMBERS:      1 << 5,
    MANAGE_MESSAGES:  1 << 6,
    CREATE_INVITES:   1 << 7,
} as const;

// Mirrors the backend's ALL_PERMISSIONS shortcut (lib/permissions.ts): the
// OR of every known permission bit, granted to owners and ADMINISTRATOR holders.
export const ALL_PERMISSIONS = Object.values(Permissions).reduce((a, b) => a | b, 0);

export interface Channel {
    id: string;
    categoryId: string;
    name: string;
    type: string; // 'text' | 'voice' | 'dm'
    order: number;
}

export interface Category {
    id: string;
    communityId: string;
    name: string;
    order: number;
    channels: Channel[];
}

export interface Role {
    id: string;
    communityId: string;
    name: string;
    color: string | null;
    permissions: number;
    position: number;
}

export interface CommunityMember {
    id: string;
    userId: string;
    joinedAt: string;
    isOwner: boolean;
    user: {
        id: string;
        username: string;
        tag: string;
        avatarUrl: string | null;
        status: string;
    };
    roles: Role[];
}

export interface CommunityBan {
    id: string;
    userId: string;
    reason: string | null;
    createdAt: string;
    user: {
        id: string;
        username: string;
        tag: string;
        avatarUrl: string | null;
    };
}

export interface Community {
    id: string;
    name: string;
    description: string | null;
    iconUrl: string | null;
    ownerId: string;
    createdAt: string;
    categories: Category[];
    roles: Role[];
    isOwner: boolean;
    myPermissions: number;
    myRoleIds: string[];
    memberCount: number;
}

// Structural delta describing exactly what changed inside a community,
// mirrors `CommunityChange` in nexo-backend/src/sockets/io.ts. Kept as a
// local copy since desktop and backend don't share a package.
export type CommunityChange =
    | { type: 'community.updated'; community: { id: string; name: string; iconUrl: string | null; description: string | null } }
    | { type: 'channel.created' | 'channel.updated'; channel: { id: string; name: string; type: string; order: number; categoryId: string } }
    | { type: 'channel.deleted'; channelId: string }
    | { type: 'category.created' | 'category.updated'; category: { id: string; name: string; order: number } }
    | { type: 'category.deleted'; categoryId: string }
    | { type: 'role.created' | 'role.updated'; role: { id: string; name: string; color: string | null; permissions: number; position: number } }
    | { type: 'role.deleted'; roleId: string }
    | { type: 'member.roles'; userId: string; roleIds: string[] }
    | { type: 'member.removed'; userId: string };

export const useCommunityStore = defineStore('community', () => {
    const communities = ref<Community[]>([]);
    const activeCommunityId = ref<string>('');
    const activeChannelId = ref<string>('');
    const isLoading = ref(false);
    // Community to activate once the Dashboard has mounted and loaded the
    // list (set by the invite flow, which navigates to the Dashboard whose
    // onMounted resets the active community before fetching).
    const pendingCommunityId = ref<string>('');

    // Miembros (con sus roles) de la comunidad activa — fuente única para el chat y la lista
    const activeMembers = ref<CommunityMember[]>([]);
    const activeMembersCommunityId = ref<string>('');
    // ¿Sigue en vuelo la carga de la comunidad activa? (solo en cache-miss —
    // ver loadActiveMembers). Reemplaza el uso previo del `isLoading` genérico
    // de fetchCommunities, que nunca reflejaba esto.
    const isActiveMembersLoading = ref(false);

    // Cache de miembros por comunidad (stale-while-revalidate + persistido en
    // localStorage), mismo patrón que messageCache/dmProfileCache: entrar a
    // una comunidad ya visitada pinta al instante en vez de esperar la red.
    const membersCache = ref<Map<string, CommunityMember[]>>(
        new Map(hydrateCache<Array<[string, CommunityMember[]]>>(COMMUNITY_MEMBERS_CACHE_KEY, 1) ?? [])
    );
    let persistMembersTimer: ReturnType<typeof setTimeout> | null = null;
    const schedulePersistMembers = () => {
        if (persistMembersTimer) clearTimeout(persistMembersTimer);
        persistMembersTimer = setTimeout(() => {
            persistMembersTimer = null;
            persistCache(COMMUNITY_MEMBERS_CACHE_KEY, 1, Array.from(membersCache.value.entries()));
        }, 400);
    };

    // Contador de no leídos por canal de comunidad (en memoria; se reinicia al recargar).
    // channelId -> cantidad de mensajes sin leer.
    const channelUnreads = ref<Map<string, number>>(new Map());

    const getChannelUnread = (channelId: string): number => {
        return channelUnreads.value.get(channelId) ?? 0;
    };

    const incrementChannelUnread = (channelId: string) => {
        channelUnreads.value.set(channelId, getChannelUnread(channelId) + 1);
    };

    const clearChannelUnread = (channelId: string) => {
        channelUnreads.value.delete(channelId);
    };

    // Suma de no leídos de todos los canales de una comunidad (para el punto agregado del rail)
    const getCommunityUnread = (communityId: string): number => {
        const community = communities.value.find(c => c.id === communityId);
        if (!community) return 0;
        let total = 0;
        for (const category of community.categories) {
            for (const channel of category.channels) {
                total += getChannelUnread(channel.id);
            }
        }
        return total;
    };

    const activeCommunity = computed(() =>
        communities.value.find(c => c.id === activeCommunityId.value) ?? null
    );

    // ¿Tiene el usuario este permiso en la comunidad activa (o la indicada)?
    const can = (flag: number, communityId?: string): boolean => {
        const community = communityId
            ? communities.value.find(c => c.id === communityId)
            : activeCommunity.value;
        if (!community) return false;
        if (community.isOwner) return true;
        return (community.myPermissions & flag) === flag;
    };

    // Recomputes `myPermissions` for a community from its current
    // `myRoleIds`/`roles`, mirroring the backend's ALL_PERMISSIONS shortcut
    // in getUserCommunities/canManage* (community.service.ts / permissions.ts).
    const recomputeMyPermissions = (community: Community) => {
        if (community.isOwner) {
            community.myPermissions = ALL_PERMISSIONS;
            return;
        }
        const heldRoles = community.roles.filter(r => community.myRoleIds.includes(r.id));
        let permissions = heldRoles.reduce((acc, r) => acc | r.permissions, 0);
        if (permissions & Permissions.ADMINISTRATOR) {
            permissions = ALL_PERMISSIONS;
        }
        community.myPermissions = permissions;
    };

    // Locates the community that currently owns a channel/category. Some REST
    // mutations (rename/delete) only take the channel/category id, not the
    // community id, so callers need this to route the resulting local patch.
    const findChannelCommunityId = (channelId: string): string | null => {
        for (const community of communities.value) {
            for (const category of community.categories) {
                if (category.channels.some(ch => ch.id === channelId)) return community.id;
            }
        }
        return null;
    };

    const findCategoryCommunityId = (categoryId: string): string | null => {
        for (const community of communities.value) {
            if (community.categories.some(cat => cat.id === categoryId)) return community.id;
        }
        return null;
    };

    // Runs `mutate` over the loaded member lists of a community (the active
    // list and the persisted cache) and schedules a cache persist.
    const patchMemberRoles = (communityId: string, mutate: (members: CommunityMember[]) => void) => {
        if (activeMembersCommunityId.value === communityId) {
            mutate(activeMembers.value);
        }
        const cachedMembers = membersCache.value.get(communityId);
        if (cachedMembers && cachedMembers !== activeMembers.value) {
            mutate(cachedMembers);
        }
        if (cachedMembers) schedulePersistMembers();
    };

    // Applies a structural delta (see CommunityChange) to `communities` (and,
    // where relevant, activeMembers/membersCache) in place, without a
    // refetch. Used both by the REST mutation helpers below (from the
    // response they just got) and by the `community_updated` socket handler
    // (from the broadcasted change) — applying the same patch twice is a
    // no-op, so the two paths never conflict. Returns false when the
    // community isn't known locally (caller should fall back to a refetch).
    const applyCommunityChange = (communityId: string, change: CommunityChange): boolean => {
        const community = communities.value.find(c => c.id === communityId);
        if (!community) return false;

        switch (change.type) {
            case 'community.updated': {
                community.name = change.community.name;
                community.iconUrl = change.community.iconUrl;
                community.description = change.community.description;
                break;
            }
            case 'channel.created':
            case 'channel.updated': {
                const category = community.categories.find(cat => cat.id === change.channel.categoryId);
                if (category) {
                    const channel: Channel = {
                        id: change.channel.id,
                        categoryId: change.channel.categoryId,
                        name: change.channel.name,
                        type: change.channel.type,
                        order: change.channel.order,
                    };
                    const idx = category.channels.findIndex(ch => ch.id === channel.id);
                    if (idx === -1) category.channels.push(channel);
                    else category.channels.splice(idx, 1, channel);
                    category.channels.sort((a, b) => a.order - b.order);
                }
                break;
            }
            case 'channel.deleted': {
                for (const category of community.categories) {
                    const idx = category.channels.findIndex(ch => ch.id === change.channelId);
                    if (idx !== -1) {
                        category.channels.splice(idx, 1);
                        break;
                    }
                }
                break;
            }
            case 'category.created':
            case 'category.updated': {
                const idx = community.categories.findIndex(cat => cat.id === change.category.id);
                if (idx === -1) {
                    community.categories.push({
                        id: change.category.id,
                        communityId,
                        name: change.category.name,
                        order: change.category.order,
                        channels: [],
                    });
                } else {
                    community.categories[idx].name = change.category.name;
                    community.categories[idx].order = change.category.order;
                }
                community.categories.sort((a, b) => a.order - b.order);
                break;
            }
            case 'category.deleted': {
                const idx = community.categories.findIndex(cat => cat.id === change.categoryId);
                if (idx !== -1) community.categories.splice(idx, 1);
                break;
            }
            case 'role.created':
            case 'role.updated': {
                const role: Role = {
                    id: change.role.id,
                    communityId,
                    name: change.role.name,
                    color: change.role.color,
                    permissions: change.role.permissions,
                    position: change.role.position,
                };
                const idx = community.roles.findIndex(r => r.id === role.id);
                if (idx === -1) community.roles.push(role);
                else community.roles.splice(idx, 1, role);
                community.roles.sort((a, b) => b.position - a.position);
                if (community.myRoleIds.includes(role.id)) recomputeMyPermissions(community);
                // Members already loaded hold their own copies of the role
                // objects (name/color drive the member list and username
                // colors), so refresh those copies too.
                patchMemberRoles(communityId, members => {
                    for (const member of members) {
                        const i = member.roles.findIndex(r => r.id === role.id);
                        if (i !== -1) member.roles.splice(i, 1, role);
                    }
                });
                break;
            }
            case 'role.deleted': {
                const idx = community.roles.findIndex(r => r.id === change.roleId);
                if (idx !== -1) community.roles.splice(idx, 1);
                if (community.myRoleIds.includes(change.roleId)) {
                    community.myRoleIds = community.myRoleIds.filter(id => id !== change.roleId);
                    recomputeMyPermissions(community);
                }
                patchMemberRoles(communityId, members => {
                    for (const member of members) {
                        const i = member.roles.findIndex(r => r.id === change.roleId);
                        if (i !== -1) member.roles.splice(i, 1);
                    }
                });
                break;
            }
            case 'member.roles': {
                const authStore = useAuthStore();
                if (change.userId === authStore.user?.id) {
                    community.myRoleIds = change.roleIds;
                    recomputeMyPermissions(community);
                }
                const newRoles = community.roles.filter(r => change.roleIds.includes(r.id));
                if (activeMembersCommunityId.value === communityId) {
                    const member = activeMembers.value.find(m => m.userId === change.userId);
                    if (member) member.roles = newRoles;
                }
                const cachedMembers = membersCache.value.get(communityId);
                if (cachedMembers) {
                    const cachedMember = cachedMembers.find(m => m.userId === change.userId);
                    if (cachedMember) {
                        cachedMember.roles = newRoles;
                        schedulePersistMembers();
                    }
                }
                break;
            }
            case 'member.removed': {
                if (activeMembersCommunityId.value === communityId) {
                    const idx = activeMembers.value.findIndex(m => m.userId === change.userId);
                    if (idx !== -1) activeMembers.value.splice(idx, 1);
                }
                const cachedMembers = membersCache.value.get(communityId);
                if (cachedMembers) {
                    const idx = cachedMembers.findIndex(m => m.userId === change.userId);
                    if (idx !== -1) {
                        cachedMembers.splice(idx, 1);
                        schedulePersistMembers();
                    }
                }
                community.memberCount = Math.max(0, community.memberCount - 1);
                break;
            }
        }

        return true;
    };

    const fetchCommunities = async () => {
        const authStore = useAuthStore();
        if (!authStore.token) return;

        isLoading.value = true;
        try {
            const response = await api.get('/communities');
            communities.value = (response.data as Community[]).map((c) => ({ ...c, myRoleIds: c.myRoleIds ?? [] }));

            // NO auto-seleccionar comunidad - el usuario debe elegir explícitamente
            // La vista de Friends se muestra cuando no hay comunidad activa
        } catch (error) {
            console.error('Error fetching communities:', error);
        } finally {
            isLoading.value = false;
        }
    };

    const setActiveCommunity = (id: string) => {
        activeCommunityId.value = id;
    };

    const setActiveChannel = (id: string) => {
        activeChannelId.value = id;
    };

    const generateInviteCode = async (communityId: string): Promise<string | null> => {
        try {
            const response = await api.post(`/communities/${communityId}/invite`);
            return response.data.inviteCode;
        } catch (error) {
            console.error('Error generating invite:', error);
            return null;
        }
    };

    const leaveCommunity = async (communityId: string): Promise<boolean> => {
        try {
            await api.delete(`/communities/${communityId}/leave`);
            removeCommunityLocally(communityId);
            return true;
        } catch (error) {
            console.error('Error leaving community:', error);
            return false;
        }
    };

    // Quita la comunidad del estado local (al salir, ser expulsado o que se elimine)
    const removeCommunityLocally = (communityId: string) => {
        communities.value = communities.value.filter(c => c.id !== communityId);

        // Permission hygiene: el cache de miembros de esta comunidad no debe
        // sobrevivir a perder el acceso.
        if (membersCache.value.delete(communityId)) {
            schedulePersistMembers();
        }

        if (activeCommunityId.value === communityId) {
            activeCommunityId.value = '';
            activeChannelId.value = '';
        }
    };

    const createCommunity = async (name: string, iconUrl?: string): Promise<string | null> => {
        try {
            const response = await api.post('/communities', { name, iconUrl });
            // To cleanly get all nested data like categories, we can just refetch
            await fetchCommunities();
            return response.data.id;
        } catch (error) {
            console.error('Error creating community:', error);
            return null;
        }
    };

    const updateCommunity = async (communityId: string, data: { name?: string; iconUrl?: string; description?: string }): Promise<boolean> => {
        try {
            const response = await api.patch(`/communities/${communityId}`, data);
            const updated = response.data;
            if (!applyCommunityChange(communityId, {
                type: 'community.updated',
                community: { id: updated.id, name: updated.name, iconUrl: updated.iconUrl, description: updated.description },
            })) {
                await fetchCommunities();
            }
            return true;
        } catch (error) {
            console.error('Error updating community:', error);
            return false;
        }
    };

    const deleteCommunity = async (communityId: string): Promise<boolean> => {
        try {
            await api.delete(`/communities/${communityId}`);
            removeCommunityLocally(communityId);
            return true;
        } catch (error) {
            console.error('Error deleting community:', error);
            return false;
        }
    };

    // ===================== Canales y categorías =====================

    const createChannel = async (communityId: string, categoryId: string, name: string, type: 'text' | 'voice'): Promise<boolean> => {
        try {
            const response = await api.post(`/communities/${communityId}/channels`, { name, type, categoryId });
            const channel = response.data;
            if (!applyCommunityChange(communityId, {
                type: 'channel.created',
                channel: { id: channel.id, name: channel.name, type: channel.type, order: channel.order, categoryId: channel.categoryId },
            })) {
                await fetchCommunities();
            }
            return true;
        } catch (error) {
            console.error('Error creating channel:', error);
            return false;
        }
    };

    const renameChannel = async (channelId: string, name: string): Promise<boolean> => {
        try {
            const response = await api.patch(`/channels/${channelId}`, { name });
            const channel = response.data;
            const communityId = findChannelCommunityId(channelId);
            if (!communityId || !applyCommunityChange(communityId, {
                type: 'channel.updated',
                channel: { id: channel.id, name: channel.name, type: channel.type, order: channel.order, categoryId: channel.categoryId },
            })) {
                await fetchCommunities();
            }
            return true;
        } catch (error) {
            console.error('Error renaming channel:', error);
            return false;
        }
    };

    const deleteChannel = async (channelId: string): Promise<boolean> => {
        const communityId = findChannelCommunityId(channelId);
        try {
            await api.delete(`/channels/${channelId}`);
            if (!communityId || !applyCommunityChange(communityId, { type: 'channel.deleted', channelId })) {
                await fetchCommunities();
            }
            return true;
        } catch (error) {
            console.error('Error deleting channel:', error);
            return false;
        }
    };

    const createCategory = async (communityId: string, name: string): Promise<boolean> => {
        try {
            const response = await api.post(`/communities/${communityId}/categories`, { name });
            const category = response.data;
            if (!applyCommunityChange(communityId, {
                type: 'category.created',
                category: { id: category.id, name: category.name, order: category.order },
            })) {
                await fetchCommunities();
            }
            return true;
        } catch (error) {
            console.error('Error creating category:', error);
            return false;
        }
    };

    const renameCategory = async (categoryId: string, name: string): Promise<boolean> => {
        try {
            const response = await api.patch(`/categories/${categoryId}`, { name });
            const category = response.data;
            const communityId = findCategoryCommunityId(categoryId);
            if (!communityId || !applyCommunityChange(communityId, {
                type: 'category.updated',
                category: { id: category.id, name: category.name, order: category.order },
            })) {
                await fetchCommunities();
            }
            return true;
        } catch (error) {
            console.error('Error renaming category:', error);
            return false;
        }
    };

    const deleteCategory = async (categoryId: string): Promise<boolean> => {
        const communityId = findCategoryCommunityId(categoryId);
        try {
            await api.delete(`/categories/${categoryId}`);
            if (!communityId || !applyCommunityChange(communityId, { type: 'category.deleted', categoryId })) {
                await fetchCommunities();
            }
            return true;
        } catch (error) {
            console.error('Error deleting category:', error);
            return false;
        }
    };

    // ===================== Roles =====================

    const createRole = async (communityId: string, data: { name: string; color?: string | null; permissions?: number }): Promise<Role | null> => {
        try {
            const response = await api.post(`/communities/${communityId}/roles`, data);
            const role = response.data;
            if (!applyCommunityChange(communityId, {
                type: 'role.created',
                role: { id: role.id, name: role.name, color: role.color, permissions: role.permissions, position: role.position },
            })) {
                await fetchCommunities();
            }
            return role;
        } catch (error) {
            console.error('Error creating role:', error);
            return null;
        }
    };

    const updateRole = async (communityId: string, roleId: string, data: { name?: string; color?: string | null; permissions?: number }): Promise<boolean> => {
        try {
            const response = await api.patch(`/communities/${communityId}/roles/${roleId}`, data);
            const role = response.data;
            if (!applyCommunityChange(communityId, {
                type: 'role.updated',
                role: { id: role.id, name: role.name, color: role.color, permissions: role.permissions, position: role.position },
            })) {
                await fetchCommunities();
            }
            return true;
        } catch (error) {
            console.error('Error updating role:', error);
            return false;
        }
    };

    const deleteRole = async (communityId: string, roleId: string): Promise<boolean> => {
        try {
            await api.delete(`/communities/${communityId}/roles/${roleId}`);
            if (!applyCommunityChange(communityId, { type: 'role.deleted', roleId })) {
                await fetchCommunities();
            }
            return true;
        } catch (error) {
            console.error('Error deleting role:', error);
            return false;
        }
    };

    // ===================== Invitaciones =====================

    interface InviteInfo {
        id: string;
        name: string;
        iconUrl: string | null;
        _count: {
            members: number;
        };
    }

    const fetchInviteInfo = async (code: string): Promise<{ ok: true; info: InviteInfo } | { ok: false; error: string }> => {
        try {
            const response = await api.get(`/invites/${code}`);
            if (response.status === 200) {
                return { ok: true, info: response.data };
            }
            return { ok: false, error: response.data?.error || 'Esta invitación es inválida o expiró.' };
        } catch (error: any) {
            console.error(error);
            return { ok: false, error: error.response?.data?.error || 'Error de conexión con el servidor.' };
        }
    };

    const joinByInvite = async (code: string): Promise<{ ok: boolean; communityId?: string; error?: string }> => {
        try {
            const response = await api.post(`/invites/${code}/join`);
            if (response.status === 200) {
                return { ok: true, communityId: response.data.communityId };
            }
            return { ok: false, error: response.data?.error || 'No pudimos unirte a la comunidad.' };
        } catch (error: any) {
            console.error(error);
            return { ok: false, error: error.response?.data?.error || 'Error de conexión con el servidor. Intenta nuevamente.' };
        }
    };

    // ===================== Miembros y moderación =====================

    const fetchMembers = async (communityId: string): Promise<CommunityMember[]> => {
        try {
            const response = await api.get(`/communities/${communityId}/members`);
            return response.data;
        } catch (error) {
            console.error('Error fetching members:', error);
            return [];
        }
    };

    const setMemberRoles = async (communityId: string, userId: string, roleIds: string[]): Promise<boolean> => {
        try {
            await api.put(`/communities/${communityId}/members/${userId}/roles`, { roleIds });
            return true;
        } catch (error) {
            console.error('Error setting member roles:', error);
            return false;
        }
    };

    const kickMember = async (communityId: string, userId: string): Promise<boolean> => {
        try {
            await api.delete(`/communities/${communityId}/members/${userId}`);
            return true;
        } catch (error) {
            console.error('Error kicking member:', error);
            return false;
        }
    };

    const banMember = async (communityId: string, userId: string, reason?: string): Promise<boolean> => {
        try {
            await api.post(`/communities/${communityId}/bans`, { userId, reason });
            return true;
        } catch (error) {
            console.error('Error banning member:', error);
            return false;
        }
    };

    const fetchBans = async (communityId: string): Promise<CommunityBan[]> => {
        try {
            const response = await api.get(`/communities/${communityId}/bans`);
            return response.data;
        } catch (error) {
            console.error('Error fetching bans:', error);
            return [];
        }
    };

    const unbanMember = async (communityId: string, userId: string): Promise<boolean> => {
        try {
            await api.delete(`/communities/${communityId}/bans/${userId}`);
            return true;
        } catch (error) {
            console.error('Error unbanning member:', error);
            return false;
        }
    };

    // Appends a new member to the active member list when the community matches
    const addActiveMember = (communityId: string, member: CommunityMember) => {
        if (activeMembersCommunityId.value !== communityId) return;
        if (activeMembers.value.some(m => m.userId === member.userId)) return;
        activeMembers.value.push(member);

        const cached = membersCache.value.get(communityId);
        if (cached && !cached.some(m => m.userId === member.userId)) {
            cached.push(member);
            schedulePersistMembers();
        }

        const community = communities.value.find(c => c.id === communityId);
        if (community) {
            community.memberCount = community.memberCount + 1;
        }
    };

    // Como fetchMembers pero sin tragarse el error: un fallo transitorio al
    // revalidar en segundo plano no debe pisar un cache bueno con [].
    const fetchMembersOrThrow = async (communityId: string): Promise<CommunityMember[]> => {
        const response = await api.get(`/communities/${communityId}/members`);
        return response.data;
    };

    // Carga (o limpia) los miembros de la comunidad activa. Stale-while-
    // revalidate: si ya hay cache para esta comunidad se pinta al instante y
    // se revalida en segundo plano; solo un cache-miss real muestra loading.
    const loadActiveMembers = async (communityId: string) => {
        activeMembersCommunityId.value = communityId;
        if (!communityId) {
            activeMembers.value = [];
            isActiveMembersLoading.value = false;
            return;
        }

        const cached = membersCache.value.get(communityId);
        if (cached) {
            activeMembers.value = cached;
            isActiveMembersLoading.value = false;
            void revalidateActiveMembers(communityId);
            return;
        }

        activeMembers.value = [];
        isActiveMembersLoading.value = true;
        try {
            const members = await fetchMembersOrThrow(communityId);
            membersCache.value.set(communityId, members);
            schedulePersistMembers();
            // Evitar sobrescribir si el usuario ya cambió de comunidad mientras cargaba
            if (activeMembersCommunityId.value === communityId) {
                activeMembers.value = members;
            }
        } catch (error) {
            console.error('Error fetching members:', error);
        } finally {
            if (activeMembersCommunityId.value === communityId) {
                isActiveMembersLoading.value = false;
            }
        }
    };

    const revalidateActiveMembers = async (communityId: string) => {
        try {
            const members = await fetchMembersOrThrow(communityId);
            membersCache.value.set(communityId, members);
            schedulePersistMembers();
            if (activeMembersCommunityId.value === communityId) {
                activeMembers.value = members;
            }
        } catch (error) {
            console.error('Error revalidating members:', error);
        }
    };

    // Versión cache-aware de fetchMembers para un lookup puntual (p. ej. el
    // modal de perfil buscando UN miembro) sin tocar el estado de "comunidad
    // activa". Cache-hit: devuelve al instante y revalida en segundo plano;
    // cache-miss: espera la red y de paso deja el cache tibio para la próxima.
    const getMembersCached = async (communityId: string): Promise<CommunityMember[]> => {
        const cached = membersCache.value.get(communityId);
        if (cached) {
            void revalidateActiveMembers(communityId);
            return cached;
        }
        try {
            const members = await fetchMembersOrThrow(communityId);
            membersCache.value.set(communityId, members);
            schedulePersistMembers();
            return members;
        } catch (error) {
            console.error('Error fetching members:', error);
            return [];
        }
    };

    // Color del rol más alto (con color) de un usuario en la comunidad activa, o null
    const getMemberRoleColor = (userId: string): string | null => {
        const member = activeMembers.value.find(m => m.userId === userId);
        if (!member) return null;
        // roles ya vienen ordenados por posición descendente desde el backend
        const colored = member.roles.find(r => r.color);
        return colored?.color ?? null;
    };

    // Cargar/limpiar miembros automáticamente al cambiar de comunidad activa
    watch(activeCommunityId, (id) => {
        loadActiveMembers(id);
    });

    // Clear all per-user state, memory and persisted (logout / account switch).
    const reset = () => {
        if (persistMembersTimer) {
            clearTimeout(persistMembersTimer);
            persistMembersTimer = null;
        }
        communities.value = [];
        activeCommunityId.value = '';
        activeChannelId.value = '';
        pendingCommunityId.value = '';
        activeMembers.value = [];
        activeMembersCommunityId.value = '';
        isActiveMembersLoading.value = false;
        isLoading.value = false;
        membersCache.value.clear();
        channelUnreads.value.clear();
        clearPersistedCache(COMMUNITY_MEMBERS_CACHE_KEY);
    };

    return {
        reset,
        communities,
        activeCommunityId,
        activeChannelId,
        pendingCommunityId,
        activeCommunity,
        activeMembers,
        isLoading,
        isActiveMembersLoading,
        can,
        channelUnreads,
        getChannelUnread,
        incrementChannelUnread,
        clearChannelUnread,
        getCommunityUnread,
        loadActiveMembers,
        addActiveMember,
        getMembersCached,
        getMemberRoleColor,
        applyCommunityChange,
        fetchCommunities,
        setActiveCommunity,
        setActiveChannel,
        generateInviteCode,
        fetchInviteInfo,
        joinByInvite,
        leaveCommunity,
        removeCommunityLocally,
        createCommunity,
        updateCommunity,
        deleteCommunity,
        createChannel,
        renameChannel,
        deleteChannel,
        createCategory,
        renameCategory,
        deleteCategory,
        createRole,
        updateRole,
        deleteRole,
        fetchMembers,
        setMemberRoles,
        kickMember,
        banMember,
        fetchBans,
        unbanMember
    };
});
