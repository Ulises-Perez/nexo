import { computed, toValue, type MaybeRefOrGetter } from 'vue';

// Dark card/modal surface the accent-tinted text usually sits on.
const DEFAULT_SURFACE = '#1e1f23';
// Fallback name color when the accent is too low-contrast against the surface.
const DEFAULT_NAME_COLOR = '#ffffff';
// Minimum WCAG contrast ratio for the accent to be used as readable text.
const MIN_TEXT_CONTRAST = 3;

interface RGB {
    r: number;
    g: number;
    b: number;
}

// Parses #RGB / #RRGGBB into 0-255 channels. Returns null for anything invalid
// (so callers can fall back gracefully on garbage or empty input).
function parseHex(hex: string | null | undefined): RGB | null {
    if (!hex) return null;
    const value = hex.trim().replace(/^#/, '');
    if (value.length === 3) {
        const r = parseInt(value[0] + value[0], 16);
        const g = parseInt(value[1] + value[1], 16);
        const b = parseInt(value[2] + value[2], 16);
        if ([r, g, b].some(Number.isNaN)) return null;
        return { r, g, b };
    }
    if (value.length === 6) {
        const r = parseInt(value.slice(0, 2), 16);
        const g = parseInt(value.slice(2, 4), 16);
        const b = parseInt(value.slice(4, 6), 16);
        if ([r, g, b].some(Number.isNaN)) return null;
        return { r, g, b };
    }
    return null;
}

// Standard WCAG relative luminance (sRGB -> linear -> weighted sum).
function relativeLuminance({ r, g, b }: RGB): number {
    const channel = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

// WCAG contrast ratio between two colors (>= 1).
function contrastRatio(a: RGB, b: RGB): number {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    const lighter = Math.max(la, lb);
    const darker = Math.min(la, lb);
    return (lighter + 0.05) / (darker + 0.05);
}

export interface ReadableAccentOptions {
    // Surface the accent text sits on (defaults to the dark card surface).
    surface?: string;
    // Color used when the accent is too low-contrast for text.
    fallbackNameColor?: string;
}

/**
 * Guards user-chosen accent colors against unreadable combinations.
 *
 * - `nameColor`: the accent when it has enough contrast against the surface,
 *   otherwise a safe fallback (#fff by default) — so a pale/white accent never
 *   makes the username vanish on the dark card.
 * - `accentButtonStyle`: a button background of the accent (or a default indigo)
 *   paired with a label color (#fff or #111) chosen by the accent's luminance,
 *   so the button label stays legible on any accent.
 */
export function useReadableAccent(
    accent: MaybeRefOrGetter<string | null | undefined>,
    options: ReadableAccentOptions = {},
) {
    const surfaceRgb = parseHex(options.surface ?? DEFAULT_SURFACE) ?? { r: 30, g: 31, b: 35 };
    const fallbackNameColor = options.fallbackNameColor ?? DEFAULT_NAME_COLOR;

    const accentRgb = computed(() => parseHex(toValue(accent)));

    const nameColor = computed(() => {
        const rgb = accentRgb.value;
        if (!rgb) return fallbackNameColor;
        return contrastRatio(rgb, surfaceRgb) >= MIN_TEXT_CONTRAST
            ? `#${toHex(rgb)}`
            : fallbackNameColor;
    });

    const nameStyle = computed(() => ({ color: nameColor.value }));

    const accentButtonStyle = computed(() => {
        const rgb = accentRgb.value;
        if (!rgb) {
            // Default brand indigo with white label.
            return { backgroundColor: '#4f46e5', color: '#ffffff' };
        }
        // Pick the label color that contrasts best with the accent background.
        const labelColor = relativeLuminance(rgb) > 0.45 ? '#111111' : '#ffffff';
        return { backgroundColor: `#${toHex(rgb)}`, color: labelColor };
    });

    return { nameColor, nameStyle, accentButtonStyle };
}

// Re-serializes parsed channels so shorthand (#abc) and casing normalize.
function toHex({ r, g, b }: RGB): string {
    const pad = (n: number) => n.toString(16).padStart(2, '0');
    return `${pad(r)}${pad(g)}${pad(b)}`;
}
