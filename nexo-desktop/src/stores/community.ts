import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { useAuthStore } from './auth';
import api from '../api/axios';

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
    memberCount: number;
}

export const useCommunityStore = defineStore('community', () => {
    const communities = ref<Community[]>([]);
    const activeCommunityId = ref<string>('');
    const activeChannelId = ref<string>('');
    const isLoading = ref(false);

    // Miembros (con sus roles) de la comunidad activa — fuente única para el chat y la lista
    const activeMembers = ref<CommunityMember[]>([]);
    const activeMembersCommunityId = ref<string>('');

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

    const fetchCommunities = async () => {
        const authStore = useAuthStore();
        if (!authStore.token) return;

        isLoading.value = true;
        try {
            const response = await api.get('/communities');
            communities.value = response.data;

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
            await api.patch(`/communities/${communityId}`, data);
            await fetchCommunities();
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
            await api.post(`/communities/${communityId}/channels`, { name, type, categoryId });
            await fetchCommunities();
            return true;
        } catch (error) {
            console.error('Error creating channel:', error);
            return false;
        }
    };

    const renameChannel = async (channelId: string, name: string): Promise<boolean> => {
        try {
            await api.patch(`/channels/${channelId}`, { name });
            await fetchCommunities();
            return true;
        } catch (error) {
            console.error('Error renaming channel:', error);
            return false;
        }
    };

    const deleteChannel = async (channelId: string): Promise<boolean> => {
        try {
            await api.delete(`/channels/${channelId}`);
            await fetchCommunities();
            return true;
        } catch (error) {
            console.error('Error deleting channel:', error);
            return false;
        }
    };

    const createCategory = async (communityId: string, name: string): Promise<boolean> => {
        try {
            await api.post(`/communities/${communityId}/categories`, { name });
            await fetchCommunities();
            return true;
        } catch (error) {
            console.error('Error creating category:', error);
            return false;
        }
    };

    const renameCategory = async (categoryId: string, name: string): Promise<boolean> => {
        try {
            await api.patch(`/categories/${categoryId}`, { name });
            await fetchCommunities();
            return true;
        } catch (error) {
            console.error('Error renaming category:', error);
            return false;
        }
    };

    const deleteCategory = async (categoryId: string): Promise<boolean> => {
        try {
            await api.delete(`/categories/${categoryId}`);
            await fetchCommunities();
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
            await fetchCommunities();
            return response.data;
        } catch (error) {
            console.error('Error creating role:', error);
            return null;
        }
    };

    const updateRole = async (communityId: string, roleId: string, data: { name?: string; color?: string | null; permissions?: number }): Promise<boolean> => {
        try {
            await api.patch(`/communities/${communityId}/roles/${roleId}`, data);
            await fetchCommunities();
            return true;
        } catch (error) {
            console.error('Error updating role:', error);
            return false;
        }
    };

    const deleteRole = async (communityId: string, roleId: string): Promise<boolean> => {
        try {
            await api.delete(`/communities/${communityId}/roles/${roleId}`);
            await fetchCommunities();
            return true;
        } catch (error) {
            console.error('Error deleting role:', error);
            return false;
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
        const community = communities.value.find(c => c.id === communityId);
        if (community) {
            community.memberCount = community.memberCount + 1;
        }
    };

    // Carga (o limpia) los miembros de la comunidad activa
    const loadActiveMembers = async (communityId: string) => {
        activeMembersCommunityId.value = communityId;
        if (!communityId) {
            activeMembers.value = [];
            return;
        }
        const members = await fetchMembers(communityId);
        // Evitar sobrescribir si el usuario ya cambió de comunidad mientras cargaba
        if (activeMembersCommunityId.value === communityId) {
            activeMembers.value = members;
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

    return {
        communities,
        activeCommunityId,
        activeChannelId,
        activeCommunity,
        activeMembers,
        isLoading,
        can,
        channelUnreads,
        getChannelUnread,
        incrementChannelUnread,
        clearChannelUnread,
        getCommunityUnread,
        loadActiveMembers,
        addActiveMember,
        getMemberRoleColor,
        fetchCommunities,
        setActiveCommunity,
        setActiveChannel,
        generateInviteCode,
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
