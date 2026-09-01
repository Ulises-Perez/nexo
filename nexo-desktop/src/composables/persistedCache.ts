// Helpers genéricos para respaldar caches en memoria sobre localStorage, así
// sobreviven a un reinicio de la app. El round-trip de red a producción tiene
// un piso de ~400-700ms (medido, no es un query lento — es la distancia física
// al host) que ningún cache en memoria puede evitar en un arranque en frío:
// esto le da a la primera pintura algo que mostrar sin esperar red.
// Nunca lanza: localStorage corrupto, lleno o inaccesible degrada a cache
// frío en vez de romper el arranque.

export const MESSAGE_CACHE_KEY = 'nexo_cache_messages_v1';
export const DM_PROFILE_CACHE_KEY = 'nexo_cache_dm_profiles_v1';
export const COMMUNITY_MEMBERS_CACHE_KEY = 'nexo_cache_community_members_v1';
export const VOICE_USER_AUDIO_CACHE_KEY = 'nexo_voice_user_audio_v1';

export const hydrateCache = <T>(key: string, version: number): T | null => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.v !== version) return null;
        return parsed.data as T;
    } catch (error) {
        console.warn(`[PERSISTED_CACHE] No se pudo leer "${key}":`, error);
        return null;
    }
};

export const persistCache = (key: string, version: number, data: unknown): void => {
    try {
        localStorage.setItem(key, JSON.stringify({ v: version, data }));
    } catch (error) {
        console.warn(`[PERSISTED_CACHE] No se pudo guardar "${key}":`, error);
    }
};

export const clearPersistedCache = (...keys: string[]): void => {
    for (const key of keys) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.warn(`[PERSISTED_CACHE] No se pudo limpiar "${key}":`, error);
        }
    }
};
