import { reactive } from 'vue';
import api from '../api/axios';
import { hydrateCache, persistCache, DM_PROFILE_CACHE_KEY } from './persistedCache';

export interface DMProfileExtra {
    createdAt: string | null;
    bio: string | null;
    bannerUrl: string | null;
    bannerColor: string | null;
    accentColor: string | null;
    pronouns: string | null;
    customStatus: string | null;
    mutualFriends: Array<{ id: string; username: string; tag: string; avatarUrl: string | null; status: string }>;
    mutualCommunities: Array<{ id: string; name: string; iconUrl: string | null }>;
}

// Cache a nivel de módulo (sobrevive a que DMUserCard se desmonte al cerrar el
// DM) para que reabrir un DM ya visitado muestre su info al instante en vez de
// repetir las 3 llamadas de red cada vez. Stale-while-revalidate, igual patrón
// que messageCache en stores/chat.ts. Hidratado desde localStorage para que
// esto también sea instantáneo tras reiniciar la app, no solo en la sesión.
const cache = reactive(new Map<string, DMProfileExtra>(
    hydrateCache<Array<[string, DMProfileExtra]>>(DM_PROFILE_CACHE_KEY, 1) ?? []
));
const loading = reactive(new Set<string>());

// Write-through: son payloads chicos y poco frecuentes (uno por usuario visto,
// no por mensaje), a diferencia de messageCache no hace falta debounce.
const persist = () => persistCache(DM_PROFILE_CACHE_KEY, 1, Array.from(cache.entries()));

// Perfil + ambos "en común" en 1 sola llamada — evita 2 round-trips de red
// extra (cada uno paga el mismo costo fijo de latencia). Devuelve `null` si el
// endpoint no está disponible (backend viejo aún sin este deploy) para que el
// caller haga fallback, en vez de propagar cualquier error.
const tryFetchCombined = async (userId: string): Promise<DMProfileExtra | null> => {
    try {
        const { data } = await api.get(`/users/${userId}/profile-card`);
        return {
            createdAt: data.user.createdAt ?? null,
            bio: data.user.bio ?? null,
            bannerUrl: data.user.bannerUrl ?? null,
            bannerColor: data.user.bannerColor ?? null,
            accentColor: data.user.accentColor ?? null,
            pronouns: data.user.pronouns ?? null,
            customStatus: data.user.customStatus ?? null,
            mutualFriends: data.mutualFriends ?? [],
            mutualCommunities: data.mutualCommunities ?? [],
        };
    } catch {
        return null;
    }
};

const fetchExtra = async (userId: string): Promise<void> => {
    loading.add(userId);
    try {
        const combined = await tryFetchCombined(userId);
        if (combined) {
            cache.set(userId, combined);
            persist();
            return;
        }

        // Fallback: backend sin el endpoint combinado desplegado todavía.
        const [userRes, friendsRes, communitiesRes] = await Promise.all([
            api.get(`/users/${userId}`),
            api.get(`/users/${userId}/mutual-friends`),
            api.get(`/users/${userId}/mutual-communities`),
        ]);
        cache.set(userId, {
            createdAt: userRes.data.createdAt ?? null,
            bio: userRes.data.bio ?? null,
            bannerUrl: userRes.data.bannerUrl ?? null,
            bannerColor: userRes.data.bannerColor ?? null,
            accentColor: userRes.data.accentColor ?? null,
            pronouns: userRes.data.pronouns ?? null,
            customStatus: userRes.data.customStatus ?? null,
            mutualFriends: friendsRes.data ?? [],
            mutualCommunities: communitiesRes.data ?? [],
        });
        persist();
    } catch (error) {
        console.error('[DM_PROFILE_CACHE] Error cargando datos del usuario:', error);
    } finally {
        loading.delete(userId);
    }
};

// Sirve la entrada cacheada de inmediato si existe (y revalida en segundo
// plano); en un cache-miss dispara el fetch. Llamar en mount y en cada cambio
// de usuario — es seguro llamarla repetidas veces para el mismo id.
export const loadDMProfileExtra = (userId: string): void => {
    void fetchExtra(userId);
};

export const getDMProfileExtra = (userId: string): DMProfileExtra | null => cache.get(userId) ?? null;

// "Cargando" solo cuando todavía no hay nada que mostrar para este usuario —
// una revalidación en segundo plano de una entrada ya cacheada no cuenta.
export const isDMProfileExtraLoading = (userId: string): boolean => loading.has(userId) && !cache.has(userId);
