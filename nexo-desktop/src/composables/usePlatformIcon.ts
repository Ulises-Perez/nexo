// Shared platform metadata for user connections: human label + inline brand
// glyph (monochrome `currentColor` SVGs). Used by the settings modal and the
// profile modal so the icon set stays consistent and DRY.

export const PLATFORMS = [
    'playstation', 'xbox', 'steam', 'spotify', 'twitch', 'youtube',
    'github', 'twitter', 'instagram', 'tiktok', 'riot', 'epicgames',
] as const;

export type Platform = (typeof PLATFORMS)[number];

const LABELS: Record<string, string> = {
    playstation: 'PlayStation',
    xbox: 'Xbox',
    steam: 'Steam',
    spotify: 'Spotify',
    twitch: 'Twitch',
    youtube: 'YouTube',
    github: 'GitHub',
    twitter: 'X (Twitter)',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    riot: 'Riot Games',
    epicgames: 'Epic Games',
};

// Inner path markup only; the wrapper <svg> is injected by `platformIcon` with
// the requested size class. Each glyph paints with currentColor.
const PATHS: Record<string, string> = {
    github: '<path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 016 0C17 4.6 18 4.9 18 4.9c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"/>',
    twitter: '<path d="M18.9 2H22l-7.6 8.7L23.3 22h-7l-5.5-7.2L4.5 22H1.4l8.1-9.3L.8 2h7.2l5 6.6L18.9 2zm-2.4 18h1.7L7.6 3.8H5.8L16.5 20z"/>',
    instagram: '<path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.1.4.3 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.1-1 .3-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.1-.4-.3-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.1 1-.3 2.2-.4 1.3-.1 1.7-.1 4.9-.1zm0 3.5a6.3 6.3 0 100 12.6 6.3 6.3 0 000-12.6zm0 10.4a4.1 4.1 0 110-8.2 4.1 4.1 0 010 8.2zm6.5-10.6a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"/>',
    youtube: '<path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 00.5 6.2 31 31 0 000 12a31 31 0 00.5 5.8 3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1A31 31 0 0024 12a31 31 0 00-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z"/>',
    twitch: '<path d="M4.3 0L1 4.4V20h5.3v3.6h3.1l3.6-3.6h4.4L23 13.5V0H4.3zm16.9 12.6l-3.1 3.1h-4.4l-3.1 3.1v-3.1H6.9V2.1h14.3v10.5zM18 5.6h-2.1v5.3H18V5.6zm-5.3 0h-2.1v5.3h2.1V5.6z"/>',
    steam: '<path d="M12 .5C5.9.5.9 5.2.2 11.1l6.4 2.6a3.4 3.4 0 011.9-.6h.3l2.8-4.1v-.1a4.5 4.5 0 119 .1 4.5 4.5 0 01-4.6 4.5h-.1l-4 2.9v.2a3.4 3.4 0 01-6.7.8L.7 15.6A11.8 11.8 0 0012 23.5a11.5 11.5 0 100-23zM7.6 18l-1.5-.6a2.6 2.6 0 004.7-1.4 2.6 2.6 0 00-3.6-2.4l1.5.6a1.9 1.9 0 11-1.5 3.5l-.1.3zm9.8-9.5a3 3 0 10-3 3 3 3 0 003-3zm-5.3 0a2.3 2.3 0 112.3 2.3 2.3 2.3 0 01-2.3-2.3z"/>',
    spotify: '<path d="M12 0a12 12 0 100 24 12 12 0 000-24zm5.5 17.3a.7.7 0 01-1 .3c-2.7-1.7-6.1-2-10.1-1.1a.7.7 0 11-.3-1.5c4.4-1 8.2-.6 11.2 1.2.4.3.5.7.2 1.1zm1.5-3.3a.9.9 0 01-1.3.3c-3.1-1.9-7.8-2.5-11.5-1.4a.9.9 0 11-.5-1.7c4.2-1.3 9.4-.6 13 1.6.4.2.6.8.3 1.2zm.1-3.4C15.4 8.2 8.9 8 5.4 9.1a1.1 1.1 0 11-.6-2.1C8.8 5.7 16 5.9 20 8.3a1.1 1.1 0 01-1.1 1.9z"/>',
    playstation: '<path d="M8.9 3.4v17l3.8 1.2V7.6c0-.7.3-1.1.8-1 .7.2.8.8.8 1.4v5.7c2.3 1.1 4.2-.1 4.2-3 0-3-1.1-4.4-4.2-5.5-1.2-.4-3.4-1.1-5.2-1.8zM14 18.6l6-2.2c.7-.2.8-.6.2-.8-.6-.2-1.6-.3-2.3 0L14 17v1.6zM2.3 18.2c-.7.2-.8.6-.1.9.9.3 2.2.4 2.9.1l3.1-1.1v-1.7l-2.7 1c-.3.1-.8.2-1.1.1-.3-.1-.2-.3.1-.4l3.7-1.3v-1.7l-4.1 1.5c-.7.3-1.3.6-1.7.6z"/>',
    xbox: '<path d="M12 0a12 12 0 00-8 3 16 16 0 018 9 16 16 0 018-9 12 12 0 00-8-3zM2.6 5A12 12 0 001 11.9c0 3 1.1 5.7 2.9 7.8 1.4-3.6 4.3-7.7 6-9.8C7.5 7 4.4 5.4 2.6 5zm18.8 0c-1.8.4-4.9 2-7.3 4.9 1.7 2.1 4.6 6.2 6 9.8a11.9 11.9 0 002.9-7.8c0-2.5-.7-4.8-1.6-6.9zM12 13.4c-1.7 2.1-4.6 6.3-5.4 9.1A11.9 11.9 0 0012 24c2 0 3.8-.5 5.4-1.5-.8-2.8-3.7-7-5.4-9.1z"/>',
    tiktok: '<path d="M16.6 5.8a4.3 4.3 0 01-1-2.8h-3.3v13.4a2.6 2.6 0 11-2.6-2.6c.3 0 .5 0 .7.1v-3.4a6 6 0 00-.7 0 6 6 0 106 6V8.7a7.5 7.5 0 004.4 1.4V6.8a4.3 4.3 0 01-3.5-1z"/>',
    riot: '<path d="M4 4l13 4 1 6-2 .5L15 11l-1 4.5-1.5.3L11.5 11l-1 5-1.5.2L8 9.5 6.7 16 5 16.3 4 4zm2 14h12l-.5 2H6.3L6 18z"/>',
    epicgames: '<path d="M5 2h14a1 1 0 011 1v15.5L12 22 4 18.5V3a1 1 0 011-1zm3 4v9h2v-3.5h2V11H10V8h3V6H8zm6 0v9h2V6h-2z"/>',
};

const GENERIC_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" class="ICON_CLASS" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.8 10.2a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1.5-1.5m-2.1-4.1a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7L11.4 6"/></svg>';

export function platformLabel(platform: string): string {
    return LABELS[platform] ?? platform;
}

/** Returns inline SVG markup (v-html) for a platform glyph at the given size. */
export function platformIcon(platform: string, sizeClass = 'h-4 w-4'): string {
    const path = PATHS[platform];
    if (path) {
        return `<svg xmlns="http://www.w3.org/2000/svg" class="${sizeClass}" viewBox="0 0 24 24" fill="currentColor">${path}</svg>`;
    }
    return GENERIC_ICON.replace('ICON_CLASS', sizeClass);
}
