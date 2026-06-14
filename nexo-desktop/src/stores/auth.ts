import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '../api/axios';
import router from '../router';

export interface UserConnection {
    id: string;
    platform: string;
    name: string;
    url: string | null;
}

export interface User {
    id: string;
    username: string;
    tag: string;
    avatarUrl: string | null;
    status: string;
    createdAt: string;
    // Rich profile fields (all optional — populated by the richer backend).
    bio?: string | null;
    bannerUrl?: string | null;
    bannerColor?: string | null;
    accentColor?: string | null;
    pronouns?: string | null;
    customStatus?: string | null;
    connections?: UserConnection[];
    // Only present on /users/me.
    email?: string;
}

export const useAuthStore = defineStore('auth', () => {
    const token = ref<string | null>(localStorage.getItem('nexo_token') || null);
    // The /users/me response is assigned wholesale, so every field of `User`
    // (including the rich profile fields) is already mapped here.
    const user = ref<User | null>(null);

    const setToken = (newToken: string) => {
        token.value = newToken;
        localStorage.setItem('nexo_token', newToken);
    };

    const removeToken = () => {
        token.value = null;
        user.value = null;
        localStorage.removeItem('nexo_token');
    };

    const fetchUser = async () => {
        if (!token.value) return;
        try {
            const response = await api.get('/users/me');
            user.value = response.data;
        } catch (error) {
            console.error('Error fetching user', error);
            removeToken();
            router.push('/login');
        }
    };

    return { token, user, setToken, removeToken, fetchUser };
});
