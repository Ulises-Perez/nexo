import { defineStore } from 'pinia';
import api from '../api/axios';

// Small stale-free (not stale-while-revalidate — profile data is cheap and
// rarely stale-sensitive for this modal) cache: a hit inside FRESH_MS returns
// instantly without a request; concurrent callers for the same key share one
// in-flight request instead of firing duplicates (e.g. reopening the profile
// modal for the same user twice in a row).
const FRESH_MS = 60_000;

interface CacheEntry<T> {
    data: T;
    fetchedAt: number;
}

export const useUsersStore = defineStore('users', () => {
    const profileCache = new Map<string, CacheEntry<any>>();
    const profileInFlight = new Map<string, Promise<any>>();
    const mutualFriendsCache = new Map<string, CacheEntry<any[]>>();
    const mutualFriendsInFlight = new Map<string, Promise<any[]>>();
    const mutualCommunitiesCache = new Map<string, CacheEntry<any[]>>();
    const mutualCommunitiesInFlight = new Map<string, Promise<any[]>>();

    async function cachedGet<T>(
        cache: Map<string, CacheEntry<T>>,
        inFlight: Map<string, Promise<T>>,
        key: string,
        url: string
    ): Promise<T> {
        const cached = cache.get(key);
        if (cached && Date.now() - cached.fetchedAt < FRESH_MS) {
            return cached.data;
        }

        const existing = inFlight.get(key);
        if (existing) return existing;

        const promise = api.get(url)
            .then(response => {
                cache.set(key, { data: response.data, fetchedAt: Date.now() });
                return response.data as T;
            })
            .finally(() => {
                inFlight.delete(key);
            });
        inFlight.set(key, promise);
        return promise;
    }

    const fetchProfile = (id: string): Promise<any> =>
        cachedGet(profileCache, profileInFlight, id, `/users/${id}`);

    const fetchMutualFriends = (id: string): Promise<any[]> =>
        cachedGet(mutualFriendsCache, mutualFriendsInFlight, id, `/users/${id}/mutual-friends`);

    const fetchMutualCommunities = (id: string): Promise<any[]> =>
        cachedGet(mutualCommunitiesCache, mutualCommunitiesInFlight, id, `/users/${id}/mutual-communities`);

    const reset = () => {
        profileCache.clear();
        profileInFlight.clear();
        mutualFriendsCache.clear();
        mutualFriendsInFlight.clear();
        mutualCommunitiesCache.clear();
        mutualCommunitiesInFlight.clear();
    };

    return {
        fetchProfile,
        fetchMutualFriends,
        fetchMutualCommunities,
        reset,
    };
});
