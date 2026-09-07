import type { ScreenCodec } from './presets';

export type { ScreenCodec } from './presets';

// Pure reordering of RTCRtpCodec entries by preference, without ever
// dropping an entry — retransmission/FEC codecs (rtx/red/ulpfec/flexfec)
// and anything not in the chosen primary order simply move to the back,
// in their original relative order.
export function orderScreenCodecs(available: RTCRtpCodec[], choice: ScreenCodec): RTCRtpCodec[] {
    let primary: string[];
    switch (choice) {
        case 'h264':
            primary = ['video/h264', 'video/vp9', 'video/vp8'];
            break;
        case 'av1':
            primary = ['video/av1', 'video/vp9', 'video/h264', 'video/vp8'];
            break;
        case 'vp9':
        case 'auto':
        default:
            primary = ['video/vp9', 'video/h264', 'video/vp8'];
            break;
    }

    const primaryLower = primary.map((m) => m.toLowerCase());
    const buckets: RTCRtpCodec[][] = primaryLower.map(() => []);
    const rest: RTCRtpCodec[] = [];

    for (const codec of available) {
        const idx = primaryLower.indexOf(codec.mimeType.toLowerCase());
        if (idx >= 0) {
            buckets[idx].push(codec);
        } else {
            rest.push(codec);
        }
    }

    return [...buckets.flat(), ...rest];
}

// Applies codec ordering to a transceiver. Never throws: a failure here must
// never break connection setup, it just means codec preference falls back to
// the browser's default order.
export function applyScreenCodecPreferences(
    transceiver: RTCRtpTransceiver,
    choice: ScreenCodec,
    side: 'send' | 'recv'
): void {
    try {
        const capabilities =
            side === 'send'
                ? RTCRtpSender.getCapabilities('video')?.codecs ?? []
                : RTCRtpReceiver.getCapabilities('video')?.codecs ?? [];
        const ordered = orderScreenCodecs(capabilities, choice);
        if (ordered.length) transceiver.setCodecPreferences(ordered);
    } catch (err) {
        console.warn('[screenShare] setCodecPreferences failed', err);
    }
}

export async function detectAv1HardwareEncode(
    width: number,
    height: number,
    fps: number,
    bitrateKbps: number
): Promise<boolean> {
    if (!('mediaCapabilities' in navigator)) return false;
    try {
        const info = await navigator.mediaCapabilities.encodingInfo({
            type: 'webrtc',
            video: {
                contentType: 'video/av1',
                width,
                height,
                framerate: fps,
                bitrate: bitrateKbps * 1000,
            },
        } as unknown as MediaEncodingConfiguration);
        return !!(info.supported && info.powerEfficient);
    } catch {
        return false;
    }
}
