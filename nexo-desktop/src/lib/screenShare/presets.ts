// Screen share quality presets and capture options.
//
// A preset bundles a resolution/framerate/bitrate target with a per-tier
// viewer cap: higher quality tiers cost more per additional watcher (mesh
// P2P has no SFU to fan out encodes), so they support fewer simultaneous
// viewers.

export type ScreenSharePresetId = '720p30' | '1080p30' | '1080p60' | '1440p60' | 'source';

export interface ScreenSharePreset {
    id: ScreenSharePresetId;
    label: string;
    description: string;
    width?: number; // omitted for 'source' (native resolution, no constraint)
    height?: number;
    fps: number; // ideal
    fpsMax: number; // max
    maxBitrateKbps: number;
    maxWatchers: number;
    recommended?: boolean;
}

export const SCREEN_SHARE_PRESETS: readonly ScreenSharePreset[] = [
    {
        id: '720p30',
        label: '720p',
        description: '1280x720 · up to 30fps',
        width: 1280,
        height: 720,
        fps: 30,
        fpsMax: 30,
        maxBitrateKbps: 2000,
        maxWatchers: 8,
    },
    {
        id: '1080p30',
        label: '1080p',
        description: '1920x1080 · up to 30fps',
        width: 1920,
        height: 1080,
        fps: 30,
        fpsMax: 30,
        maxBitrateKbps: 4000,
        maxWatchers: 6,
    },
    {
        id: '1080p60',
        label: '1080p60',
        description: '1920x1080 · up to 60fps',
        width: 1920,
        height: 1080,
        fps: 60,
        fpsMax: 60,
        maxBitrateKbps: 6500,
        maxWatchers: 4,
        recommended: true,
    },
    {
        id: '1440p60',
        label: '1440p60',
        description: '2560x1440 · up to 60fps',
        width: 2560,
        height: 1440,
        fps: 60,
        fpsMax: 60,
        maxBitrateKbps: 10000,
        maxWatchers: 3,
    },
    {
        id: 'source',
        label: 'Source · native resolution',
        description: 'Native resolution · up to 60fps (bursts to 120fps)',
        fps: 60,
        fpsMax: 120,
        maxBitrateKbps: 14000,
        maxWatchers: 2,
    },
] as const;

export const DEFAULT_PRESET_ID: ScreenSharePresetId = '1080p60';

export function getPreset(id: ScreenSharePresetId): ScreenSharePreset {
    const preset = SCREEN_SHARE_PRESETS.find((p) => p.id === id);
    if (!preset) throw new Error(`Unknown screen share preset: ${id}`);
    return preset;
}

// 'motion' = Smoother (maintain framerate), 'detail' = Sharper (maintain resolution)
export type OptimizeFor = 'motion' | 'detail';

export type ScreenCodec = 'auto' | 'vp9' | 'h264' | 'av1';

export interface ScreenShareOptions {
    presetId: ScreenSharePresetId;
    optimizeFor: OptimizeFor;
    codec: ScreenCodec;
}

export const DEFAULT_SCREEN_SHARE_OPTIONS: ScreenShareOptions = {
    presetId: DEFAULT_PRESET_ID,
    optimizeFor: 'motion',
    codec: 'auto',
};

const OPTIMIZE_FOR_VALUES: readonly OptimizeFor[] = ['motion', 'detail'];
const SCREEN_CODEC_VALUES: readonly ScreenCodec[] = ['auto', 'vp9', 'h264', 'av1'];

export function isScreenSharePresetId(id: unknown): id is ScreenSharePresetId {
    return typeof id === 'string' && SCREEN_SHARE_PRESETS.some((p) => p.id === id);
}

function isOptimizeFor(value: unknown): value is OptimizeFor {
    return typeof value === 'string' && (OPTIMIZE_FOR_VALUES as readonly string[]).includes(value);
}

function isScreenCodec(value: unknown): value is ScreenCodec {
    return typeof value === 'string' && (SCREEN_CODEC_VALUES as readonly string[]).includes(value);
}

// Pure, field-wise sanitizer: any unknown/missing/malformed field falls back
// to its own default instead of discarding the whole object, so a stale
// presetId (e.g. an old device's DB row, or a preset removed in a later
// release) doesn't also throw away a still-valid codec/optimizeFor choice.
// `getPreset` itself keeps throwing on an invalid id — this is what
// guarantees callers never pass it one.
export function sanitizeScreenShareOptions(raw: unknown): ScreenShareOptions {
    const candidate = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    return {
        presetId: isScreenSharePresetId(candidate.presetId)
            ? candidate.presetId
            : DEFAULT_SCREEN_SHARE_OPTIONS.presetId,
        optimizeFor: isOptimizeFor(candidate.optimizeFor)
            ? candidate.optimizeFor
            : DEFAULT_SCREEN_SHARE_OPTIONS.optimizeFor,
        codec: isScreenCodec(candidate.codec) ? candidate.codec : DEFAULT_SCREEN_SHARE_OPTIONS.codec,
    };
}

// Chromium-specific capture constraints (selfBrowserSurface, surfaceSwitching,
// monitorTypeSurfaces, systemAudio) are not yet part of lib.dom's
// MediaTrackConstraints typings, hence the casts below.
//
// Audio is always requested here — whether system audio actually gets
// captured is decided once, by the user, in the browser's own picker
// (which shows its own "share system audio" toggle whenever audio is
// requested at all). A separate pre-picker checkbox in our own UI would
// just ask the same question twice in two different dialogs; the real
// outcome is read back from the resulting stream's audio tracks after
// getDisplayMedia resolves, not decided ahead of time.
export function buildDisplayMediaConstraints(preset: ScreenSharePreset): DisplayMediaStreamOptions {
    const videoConstraints: MediaTrackConstraints & Record<string, unknown> = {
        frameRate: { ideal: preset.fps, max: preset.fpsMax },
        // Hide our own window from the picker, allow switching the shared
        // surface without restarting capture, and include whole-screen
        // sources alongside windows/tabs.
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
        monitorTypeSurfaces: 'include',
    };
    if (preset.width) videoConstraints.width = { ideal: preset.width };
    if (preset.height) videoConstraints.height = { ideal: preset.height };

    return {
        video: videoConstraints,
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            systemAudio: 'include',
        } as MediaTrackConstraints,
    };
}
