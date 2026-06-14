import { computed, unref, type MaybeRefOrGetter } from 'vue';

// Deterministic gradient fallback palette (shared with the previous inline
// implementations in UserProfileModal/DMUserCard).
const GRADIENTS = [
    'linear-gradient(120deg, #4338ca 0%, #7e22ce 55%, #be185d 100%)',
    'linear-gradient(120deg, #0e7490 0%, #1d4ed8 60%, #6d28d9 100%)',
    'linear-gradient(120deg, #047857 0%, #0e7490 60%, #4338ca 100%)',
    'linear-gradient(120deg, #b45309 0%, #be185d 60%, #7e22ce 100%)',
    'linear-gradient(120deg, #be123c 0%, #9333ea 60%, #4338ca 100%)',
    'linear-gradient(120deg, #1e40af 0%, #0f766e 60%, #65a30d 100%)',
];

// Deterministic hash → gradient index (same algorithm used across the app).
const gradientFor = (name: string): string => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
};

export interface BannerSource {
    bannerUrl?: string | null;
    bannerColor?: string | null;
    username?: string | null;
}

// Resolves the BASE layer (no image): solid color > deterministic gradient.
const resolveBase = (source: BannerSource | null | undefined): string => {
    const bannerColor = source?.bannerColor?.trim();
    if (bannerColor) {
        return bannerColor;
    }
    return gradientFor(source?.username ?? '');
};

const resolve = (source: BannerSource | null | undefined): string => {
    const bannerUrl = source?.bannerUrl?.trim();
    const base = resolveBase(source);

    // Priority chain: uploaded image > solid color > deterministic gradient.
    // The image is layered ON TOP of the base color/gradient so a broken or
    // expired URL (404) simply reveals the base beneath instead of an empty
    // dark rectangle. A CSS background-image has no onerror, so this is the
    // graceful-degradation path for the background-driven banner sites.
    if (bannerUrl) {
        return `center / cover no-repeat url("${bannerUrl}"), ${base}`;
    }
    return base;
};

/**
 * Resolves the CSS `background` value for a user banner following the priority
 * chain: bannerUrl image > bannerColor solid > deterministic hashed gradient.
 *
 * Accepts a ref, getter, or plain object so it can be used reactively in
 * components or imperatively (`resolveBannerStyle`).
 */
export function useUserBanner(source: MaybeRefOrGetter<BannerSource | null | undefined>) {
    const bannerStyle = computed(() => {
        const value = typeof source === 'function' ? (source as () => BannerSource)() : unref(source);
        return resolve(value);
    });

    return { bannerStyle };
}

// Imperative helper for non-reactive call sites.
export function resolveBannerStyle(source: BannerSource | null | undefined): string {
    return resolve(source);
}
