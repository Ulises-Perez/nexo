import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '../api/axios';

export interface Friend {
    id: string;
    username: string;
    tag: string;
    avatarUrl: string | null;
    status: string;
}

export interface FriendRequest {
    id: string;
    senderId: string;
    receiverId: string;
    status: string;
    createdAt: string;
    sender: {
        id: string;
        username: string;
        tag: string;
        avatarUrl: string | null;
    };
}

export interface SearchResult {
    id: string;
    username: string;
    tag: string;
    avatarUrl: string | null;
    status: string;
}

export const useFriendsStore = defineStore('friends', () => {
    const friends = ref<Friend[]>([]);
    const pendingRequests = ref<FriendRequest[]>([]);
    const searchResults = ref<SearchResult[]>([]);
    const isSearching = ref(false);
    const isLoading = ref(false);

    const fetchFriends = async () => {
        isLoading.value = true;
        try {
            const response = await api.get('/friends');
            friends.value = response.data;
        } catch (error) {
            console.error('[FriendsStore - fetchFriends Error]', error);
        } finally {
            isLoading.value = false;
        }
    };

    const fetchPendingRequests = async () => {
        try {
            const response = await api.get('/friends/requests/pending');
            pendingRequests.value = response.data;
        } catch (error) {
            console.error('[FriendsStore - fetchPendingRequests Error]', error);
        }
    };

    const searchUsers = async (query: string) => {
        if (!query.trim()) {
            searchResults.value = [];
            return;
        }

        isSearching.value = true;
        try {
            const response = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
            searchResults.value = response.data;
        } catch (error) {
            console.error('[FriendsStore - searchUsers Error]', error);
            searchResults.value = [];
        } finally {
            isSearching.value = false;
        }
    };

    const sendFriendRequest = async (receiverId: string) => {
        try {
            await api.post('/friends/request', { receiverId });
            // Remover de resultados de búsqueda
            searchResults.value = searchResults.value.filter(u => u.id !== receiverId);
            return { success: true };
        } catch (error: any) {
            const message = error.response?.data?.error || 'Error al enviar solicitud';
            return { success: false, error: message };
        }
    };

    const acceptRequest = async (requestId: string) => {
        try {
            await api.patch(`/friends/request/${requestId}/accept`);
            pendingRequests.value = pendingRequests.value.filter(r => r.id !== requestId);
            await fetchFriends();
            return { success: true };
        } catch (error: any) {
            const message = error.response?.data?.error || 'Error al aceptar solicitud';
            return { success: false, error: message };
        }
    };

    const rejectRequest = async (requestId: string) => {
        try {
            await api.patch(`/friends/request/${requestId}/reject`);
            pendingRequests.value = pendingRequests.value.filter(r => r.id !== requestId);
            return { success: true };
        } catch (error: any) {
            const message = error.response?.data?.error || 'Error al rechazar solicitud';
            return { success: false, error: message };
        }
    };

    // Estado de la relación con otro usuario: self | friends | pending_sent | pending_received | none
    const getFriendStatus = async (userId: string): Promise<{ status: string; requestId?: string }> => {
        try {
            const response = await api.get(`/friends/status/${userId}`);
            return response.data;
        } catch (error) {
            console.error('[FriendsStore - getFriendStatus Error]', error);
            return { status: 'none' };
        }
    };

    const removeFriend = async (userId: string) => {
        try {
            await api.delete(`/friends/${userId}`);
            friends.value = friends.value.filter(f => f.id !== userId);
            return { success: true };
        } catch (error: any) {
            const message = error.response?.data?.error || 'Error al eliminar amigo';
            return { success: false, error: message };
        }
    };

    const clearSearch = () => {
        searchResults.value = [];
    };

    const updateFriendStatus = (friendId: string, status: string) => {
        const friend = friends.value.find(f => f.id === friendId);
        if (friend) {
            friend.status = status;
        }
    };

    // Granular socket-driven mutations (no REST calls inside these actions)

    const addPendingRequest = (request: FriendRequest) => {
        if (pendingRequests.value.some(r => r.id === request.id)) return;
        pendingRequests.value.unshift(request);
    };

    const addFriend = (friend: Friend) => {
        if (friends.value.some(f => f.id === friend.id)) return;
        friends.value.push(friend);
    };

    const removeFriendLocally = (userId: string) => {
        friends.value = friends.value.filter(f => f.id !== userId);
    };

    return {
        friends,
        pendingRequests,
        searchResults,
        isSearching,
        isLoading,
        fetchFriends,
        fetchPendingRequests,
        searchUsers,
        sendFriendRequest,
        acceptRequest,
        rejectRequest,
        getFriendStatus,
        removeFriend,
        clearSearch,
        updateFriendStatus,
        addPendingRequest,
        addFriend,
        removeFriendLocally,
    };
});
