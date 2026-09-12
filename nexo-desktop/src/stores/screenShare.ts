import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { Socket } from 'socket.io-client';
import api from '../api/axios';
import { RTC_CONFIG, useVoiceStore } from './voice';
import { useAuthStore } from './auth';
import {
    DEFAULT_SCREEN_SHARE_OPTIONS,
    getPreset,
    buildDisplayMediaConstraints,
    sanitizeScreenShareOptions,
    type ScreenSharePreset,
    type OptimizeFor,
    type ScreenShareOptions,
} from '../lib/screenShare/presets';
import { applyScreenCodecPreferences } from '../lib/screenShare/codecs';
import { createStatsSampler, type VideoStatsSnapshot } from '../lib/screenShare/stats';

const OPTIONS_STORAGE_KEY = 'nexo:screenShare:options';

type ScreenSignal =
    | { type: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit; kind: 'screen'; shareId: string }
    | { type: 'ice'; candidate: RTCIceCandidateInit; kind: 'screen'; shareId: string }
    | { type: 'screen-stop-watching'; kind: 'screen'; shareId: string }
    | { type: 'reject'; kind: 'screen'; shareId: string; reason: 'full'; max: number };

export type WatchState = 'idle' | 'connecting' | 'playing' | 'failed' | 'full' | 'ended';

export const useScreenShareStore = defineStore('screenShare', () => {
    // ===================== Estado =====================

    const isSharing = ref(false);
    const localShareId = ref<string | null>(null);

    // Quién estoy mirando ahora mismo: sharerSocketId -> true. Se activa
    // apenas se pide mirar (para mostrar "conectando...") — el stream real
    // puede tardar un instante más en llegar (ver streamReady).
    const watching = ref<Record<string, boolean>>({});
    const streamReady = ref<Record<string, boolean>>({});

    // A qué transmisión apunta el visor grande (nulo = visor cerrado)
    const activeViewer = ref<{ socketId: string; username: string } | null>(null);

    // Capture settings actually granted by the browser for the active local
    // share (may differ from the requested preset — the OS/monitor picks
    // the real surface resolution/refresh rate).
    const captureSettings = ref<{
        width: number | null;
        height: number | null;
        frameRate: number | null;
        displaySurface: string | null;
    } | null>(null);

    // Last options the user picked to start a share, persisted across
    // restarts so the quality picker remembers the previous choice.
    // Sanitized field-wise: a stale/unknown preset id (e.g. a preset removed
    // in a later release) never throws — it falls back per-field instead of
    // discarding the whole stored value.
    const loadStoredOptions = (): ScreenShareOptions => {
        try {
            const raw = localStorage.getItem(OPTIONS_STORAGE_KEY);
            if (!raw) return DEFAULT_SCREEN_SHARE_OPTIONS;
            return sanitizeScreenShareOptions(JSON.parse(raw));
        } catch {
            return DEFAULT_SCREEN_SHARE_OPTIONS;
        }
    };
    const lastOptions = ref<ScreenShareOptions>(loadStoredOptions());

    // Account is the source of truth for cross-device persistence;
    // localStorage is only the offline/first-run fallback. The store is
    // created before login resolves (Dashboard setup), so `authStore.user`
    // isn't known synchronously here — hydration re-runs once it is (see the
    // `immediate: true` watcher below).
    const authStore = useAuthStore();

    const hydrateFromAccount = () => {
        const accountValue = authStore.user?.screenSharePrefs;
        if (accountValue == null) return; // no account preference yet — keep localStorage/default
        const sanitized = sanitizeScreenShareOptions(accountValue);
        lastOptions.value = sanitized;
        try {
            localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(sanitized));
        } catch {
            // Persistence is best-effort (private browsing, quota, etc.).
        }
    };

    // Only ever assigns `lastOptions` (read by the quality modal/preview on
    // open) — never `currentShareOptions`, which is set once per share in
    // `startSharing` and left alone for the rest of that share's lifetime.
    watch(() => authStore.user?.screenSharePrefs, hydrateFromAccount, { immediate: true });

    const optionsEqual = (a: ScreenShareOptions, b: unknown): boolean => {
        if (!b || typeof b !== 'object') return false;
        const other = b as Record<string, unknown>;
        return a.presetId === other.presetId && a.optimizeFor === other.optimizeFor && a.codec === other.codec;
    };

    // Best-effort, non-fatal: a failed write-through never blocks or delays
    // sharing — it just means cross-device sync didn't happen this time.
    const writeThroughOptions = (options: ScreenShareOptions) => {
        if (!authStore.user || optionsEqual(options, authStore.user.screenSharePrefs)) return;
        authStore.user.screenSharePrefs = options;
        api.patch('/users/me', { screenSharePrefs: options }).catch((err) => {
            console.warn('[ScreenShare] No se pudo sincronizar la preferencia de calidad con la cuenta:', err);
        });
    };

    // Live aggregated stats for the local share, across all current watchers.
    const sharerStats = ref<{
        totalKbps: number;
        limitation: VideoStatsSnapshot['limitation'];
        codec: string | null;
        viewers: number;
        maxViewers: number;
    } | null>(null);

    // Viewer-side connection lifecycle for the active watched share.
    const watchState = ref<WatchState>('idle');
    const watchError = ref<string | null>(null);
    const watchHasAudio = ref(false);
    const watchStats = ref<VideoStatsSnapshot | null>(null);

    // Objetos WebRTC (fuera de la reactividad de Vue, mismo criterio que voice.ts)
    let socket: Socket | null = null;
    let localScreenStream: MediaStream | null = null;
    const sharePeers = new Map<string, RTCPeerConnection>();  // watcherSocketId -> pc (yo comparto)
    const watchPeers = new Map<string, RTCPeerConnection>();  // sharerSocketId  -> pc (yo miro)
    const remoteStreams = new Map<string, MediaStream>();     // sharerSocketId  -> stream que estoy mirando

    // Options in effect for the share currently being broadcast (null while
    // not sharing) — needed by acceptWatcher (viewer cap) and applyEncodingCaps
    // (degradation preference).
    let currentShareOptions: ScreenShareOptions | null = null;

    // Per-watcher outbound stats samplers for the local share, aggregated
    // into sharerStats on a fixed tick (see startSharerStatsAggregation).
    const shareStatSamplers = new Map<string, { stop(): void }>();
    const shareStatsBySocket = new Map<string, VideoStatsSnapshot>();
    let sharerStatsTimer: ReturnType<typeof setInterval> | null = null;

    // Per-share inbound stats sampler on the viewer side.
    const watchStatSamplers = new Map<string, { stop(): void }>();

    const getRemoteStream = (sharerSocketId: string): MediaStream | null => {
        return remoteStreams.get(sharerSocketId) ?? null;
    };

    // Vista previa para quien comparte — sin esto, compartir solo (sin nadie
    // más mirando) no da ninguna confirmación visual de que la captura anda.
    const getLocalStream = (): MediaStream | null => localScreenStream;

    // ===================== Límite de bitrate/fps =====================

    const applyEncodingCaps = async (
        sender: RTCRtpSender,
        preset: ScreenSharePreset,
        optimizeFor: OptimizeFor
    ) => {
        try {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
            params.encodings[0].maxBitrate = preset.maxBitrateKbps * 1000;
            // fpsMax, not fps: for fixed-fps presets they're equal, but for
            // 'source' fps=60/fpsMax=120 — capping at fps would silently
            // defeat the "bursts to 120fps" promise the preset advertises.
            params.encodings[0].maxFramerate = preset.fpsMax;
            params.encodings[0].scaleResolutionDownBy = 1;
            params.degradationPreference = optimizeFor === 'motion' ? 'maintain-framerate' : 'maintain-resolution';
            await sender.setParameters(params);
        } catch (error) {
            // No fatal: sigue compartiendo, solo sin el límite de bitrate aplicado.
            console.error('[ScreenShare] No se pudo aplicar el límite de bitrate:', error);
        }
    };

    // ===================== Stats agregados (lado de quien comparte) =====================

    const startSharerStatsAggregation = () => {
        if (sharerStatsTimer) return;
        sharerStatsTimer = setInterval(() => {
            if (!currentShareOptions) return;
            const maxViewers = getPreset(currentShareOptions.presetId).maxWatchers;
            if (sharePeers.size === 0) {
                sharerStats.value = { totalKbps: 0, limitation: 'none', codec: null, viewers: 0, maxViewers };
                return;
            }
            let totalKbps = 0;
            let limitation: VideoStatsSnapshot['limitation'] = 'none';
            let codec: string | null = null;
            shareStatsBySocket.forEach((snap) => {
                totalKbps += snap.bitrateKbps ?? 0;
                if (limitation === 'none' && snap.limitation && snap.limitation !== 'none') {
                    limitation = snap.limitation;
                }
                if (!codec && snap.codec) codec = snap.codec;
            });
            sharerStats.value = { totalKbps, limitation, codec, viewers: sharePeers.size, maxViewers };
        }, 1000);
    };

    const stopSharerStatsAggregation = () => {
        if (sharerStatsTimer) {
            clearInterval(sharerStatsTimer);
            sharerStatsTimer = null;
        }
        shareStatSamplers.forEach((sampler) => sampler.stop());
        shareStatSamplers.clear();
        shareStatsBySocket.clear();
        sharerStats.value = null;
    };

    // ===================== Lado de quien comparte =====================

    const startSharing = async (options: ScreenShareOptions) => {
        if (!socket || isSharing.value) return;
        try {
            const preset = getPreset(options.presetId);
            const constraints = buildDisplayMediaConstraints(preset);
            localScreenStream = await navigator.mediaDevices.getDisplayMedia(constraints);
            // Whether audio actually made it in is the browser picker's call
            // (its own "share system audio" toggle), not a pre-flight guess —
            // read it back from the resulting stream instead of asking twice.
            const hasAudio = localScreenStream.getAudioTracks().length > 0;
            const [track] = localScreenStream.getVideoTracks();
            if (track) {
                track.contentHint = options.optimizeFor;
                // Se dispara si el usuario corta desde la barra nativa de
                // "Dejar de compartir" de WebView2, no solo desde el botón de Nexo.
                track.onended = () => stopSharing();

                const settings = track.getSettings() as MediaTrackSettings & { displaySurface?: string };
                captureSettings.value = {
                    width: settings.width ?? null,
                    height: settings.height ?? null,
                    frameRate: settings.frameRate ?? null,
                    displaySurface: settings.displaySurface ?? null,
                };
            }

            localShareId.value = crypto.randomUUID();
            currentShareOptions = options;
            lastOptions.value = options;
            try {
                localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(options));
            } catch {
                // Persistence is best-effort (private browsing, quota, etc.).
            }
            writeThroughOptions(options);

            socket.emit('start_screen_share', {
                shareId: localShareId.value,
                presetId: options.presetId,
                audio: hasAudio,
                codec: options.codec,
            });
            isSharing.value = true;
            startSharerStatsAggregation();
        } catch (error) {
            console.error('[ScreenShare] No se pudo iniciar el compartir pantalla:', error);
        }
    };

    // Crea (o recrea) la conexión hacia un espectador específico, en respuesta
    // a una oferta suya — nunca proactivo, el que comparte nunca inicia.
    const acceptWatcher = async (watcherSocketId: string, offerSdp: RTCSessionDescriptionInit) => {
        if (!socket || !isSharing.value || !localScreenStream || !localShareId.value || !currentShareOptions) return;

        const preset = getPreset(currentShareOptions.presetId);

        // Viewer cap per quality tier: reject instead of growing the mesh
        // fan-out past what this preset's bitrate/fps budget can sustain.
        if (!sharePeers.has(watcherSocketId) && sharePeers.size >= preset.maxWatchers) {
            socket.emit('voice_signal', {
                to: watcherSocketId,
                signal: { type: 'reject', kind: 'screen', shareId: localShareId.value, reason: 'full', max: preset.maxWatchers },
            });
            return;
        }

        const existing = sharePeers.get(watcherSocketId);
        if (existing) existing.close();

        const pc = new RTCPeerConnection(RTC_CONFIG);
        sharePeers.set(watcherSocketId, pc);

        const [videoTrack] = localScreenStream.getVideoTracks();
        const [audioTrack] = localScreenStream.getAudioTracks();
        const videoSender = videoTrack ? pc.addTrack(videoTrack, localScreenStream) : null;
        if (audioTrack) pc.addTrack(audioTrack, localScreenStream);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket?.emit('voice_signal', {
                    to: watcherSocketId,
                    signal: { type: 'ice', kind: 'screen', shareId: localShareId.value, candidate: event.candidate.toJSON() },
                });
            }
        };

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));

            const videoTransceiver = pc.getTransceivers().find((t) => t.sender.track === videoTrack);
            if (videoTransceiver) {
                applyScreenCodecPreferences(videoTransceiver, currentShareOptions.codec, 'send');
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (videoSender) await applyEncodingCaps(videoSender, preset, currentShareOptions.optimizeFor);
            socket.emit('voice_signal', {
                to: watcherSocketId,
                signal: { type: 'answer', kind: 'screen', shareId: localShareId.value, sdp: pc.localDescription },
            });

            const sampler = createStatsSampler(pc, 'outbound', (snap) => {
                shareStatsBySocket.set(watcherSocketId, snap);
            });
            shareStatSamplers.set(watcherSocketId, sampler);
        } catch (error) {
            console.error('[ScreenShare] Error aceptando espectador:', error);
            pc.close();
            sharePeers.delete(watcherSocketId);
        }
    };

    const dropWatcher = (watcherSocketId: string) => {
        const pc = sharePeers.get(watcherSocketId);
        if (pc) {
            pc.close();
            sharePeers.delete(watcherSocketId);
        }
        const sampler = shareStatSamplers.get(watcherSocketId);
        if (sampler) {
            sampler.stop();
            shareStatSamplers.delete(watcherSocketId);
        }
        shareStatsBySocket.delete(watcherSocketId);
    };

    const stopSharing = () => {
        if (!isSharing.value) return;
        sharePeers.forEach(pc => pc.close());
        sharePeers.clear();
        stopSharerStatsAggregation();
        if (localScreenStream) {
            localScreenStream.getTracks().forEach(t => t.stop());
            localScreenStream = null;
        }
        socket?.emit('stop_screen_share');
        isSharing.value = false;
        localShareId.value = null;
        currentShareOptions = null;
        captureSettings.value = null;
    };

    // ===================== Lado de quien mira =====================

    const stopWatchStatsSampler = (sharerSocketId: string) => {
        const sampler = watchStatSamplers.get(sharerSocketId);
        if (sampler) {
            sampler.stop();
            watchStatSamplers.delete(sharerSocketId);
        }
    };

    // El espectador siempre inicia la oferta (igual que el que entra a un
    // canal de voz siempre ofrece primero en voice.ts).
    const watchShare = async (sharerSocketId: string, shareId: string, username: string) => {
        if (!socket || watchPeers.has(sharerSocketId)) return;

        watching.value[sharerSocketId] = true;
        activeViewer.value = { socketId: sharerSocketId, username };
        watchState.value = 'connecting';
        watchError.value = null;
        watchHasAudio.value = false;
        watchStats.value = null;

        const pc = new RTCPeerConnection(RTC_CONFIG);
        watchPeers.set(sharerSocketId, pc);
        const videoTransceiver = pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
        // The viewer doesn't independently choose a codec — 'auto' just
        // avoids stripping useful codecs from the receive capabilities.
        applyScreenCodecPreferences(videoTransceiver, 'auto', 'recv');

        pc.ontrack = (event) => {
            const [stream] = event.streams;
            if (stream) {
                remoteStreams.set(sharerSocketId, stream);
                streamReady.value[sharerSocketId] = true;
                if (activeViewer.value?.socketId === sharerSocketId) watchState.value = 'playing';
            }
            if (event.track.kind === 'audio') {
                watchHasAudio.value = true;
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket?.emit('voice_signal', {
                    to: sharerSocketId,
                    signal: { type: 'ice', kind: 'screen', shareId, candidate: event.candidate.toJSON() },
                });
            }
        };

        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'failed' && activeViewer.value?.socketId === sharerSocketId) {
                watchState.value = 'failed';
                watchError.value = 'No se pudo conectar';
            }
        };

        const sampler = createStatsSampler(pc, 'inbound', (snap) => {
            if (activeViewer.value?.socketId === sharerSocketId) watchStats.value = snap;
        });
        watchStatSamplers.set(sharerSocketId, sampler);

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('voice_signal', {
                to: sharerSocketId,
                signal: { type: 'offer', kind: 'screen', shareId, sdp: pc.localDescription },
            });
        } catch (error) {
            console.error('[ScreenShare] Error pidiendo mirar:', error);
            stopWatching(sharerSocketId);
        }
    };

    const acceptAnswer = async (sharerSocketId: string, answerSdp: RTCSessionDescriptionInit) => {
        const pc = watchPeers.get(sharerSocketId);
        if (!pc) return;
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
        } catch (error) {
            console.error('[ScreenShare] Error aceptando respuesta:', error);
        }
    };

    // Corta solo esta conexión puntual — el que comparte libera ese
    // encode+subida al instante en vez de esperar el timeout de ICE, sin
    // tocar a otros espectadores ni al audio de la llamada.
    const stopWatching = (sharerSocketId: string) => {
        const pc = watchPeers.get(sharerSocketId);
        const shareId = pc ? findShareIdFor(sharerSocketId) : null;
        if (pc) {
            pc.close();
            watchPeers.delete(sharerSocketId);
        }
        stopWatchStatsSampler(sharerSocketId);
        remoteStreams.delete(sharerSocketId);
        delete watching.value[sharerSocketId];
        delete streamReady.value[sharerSocketId];
        if (activeViewer.value?.socketId === sharerSocketId) {
            activeViewer.value = null;
            // 'full' and 'ended' are terminal states set by the caller right
            // before invoking stopWatching — don't clobber them back to idle.
            if (watchState.value !== 'full' && watchState.value !== 'ended') watchState.value = 'idle';
            watchStats.value = null;
        }
        if (shareId) {
            socket?.emit('voice_signal', {
                to: sharerSocketId,
                signal: { type: 'screen-stop-watching', kind: 'screen', shareId },
            });
        }
    };

    // shareId no se guarda aparte del lado del espectador — se reconstruye
    // desde el roster de voz, que es la fuente de verdad de qué shareId está
    // activo para ese participante en este momento.
    const findShareIdFor = (sharerSocketId: string): string | null => {
        for (const participants of Object.values(voiceStore.voiceStates)) {
            const match = participants.find(p => p.socketId === sharerSocketId);
            if (match) return match.shareId;
        }
        return null;
    };

    // ===================== Señalización entrante =====================

    const handleScreenSignal = async (data: { from: string; userId: string; signal: ScreenSignal | Record<string, unknown> }) => {
        const { from, signal } = data;
        if (!signal || (signal as ScreenSignal).kind !== 'screen') return;
        const s = signal as ScreenSignal;
        try {
            if (s.type === 'offer') {
                // Alguien quiere mirar MI transmisión.
                if (s.shareId !== localShareId.value) return;
                await acceptWatcher(from, s.sdp);
            } else if (s.type === 'answer') {
                // Respuesta a una oferta MÍA hacia alguien que estoy mirando.
                await acceptAnswer(from, s.sdp);
            } else if (s.type === 'ice') {
                // Puede ser para una conexión donde YO comparto o donde YO miro —
                // se distingue por si el shareId es el mío (comparto) o ajeno (miro).
                const pc = s.shareId === localShareId.value
                    ? sharePeers.get(from)
                    : watchPeers.get(from);
                if (pc) await pc.addIceCandidate(new RTCIceCandidate(s.candidate));
            } else if (s.type === 'screen-stop-watching') {
                dropWatcher(from);
            } else if (s.type === 'reject') {
                // The sharer is at its viewer cap for the active preset —
                // this is an expected rejection, not an ICE failure.
                if (s.reason === 'full' && activeViewer.value?.socketId === from) {
                    watchState.value = 'full';
                    watchError.value = `La transmisión está llena (máximo ${s.max} espectadores)`;
                }
                stopWatching(from);
            }
        } catch (error) {
            console.error('[ScreenShare] Error procesando señal:', error);
        }
    };

    // ===================== Ciclo de vida =====================

    const bindSocket = (s: Socket) => {
        socket = s;
        socket.on('voice_signal', handleScreenSignal);
    };

    const unbindSocket = () => {
        stopSharing();
        watchPeers.forEach((_, sharerSocketId) => stopWatching(sharerSocketId));
        socket = null;
    };

    // Si se corta la llamada de voz, no tiene sentido seguir compartiendo ni mirando.
    const voiceStore = useVoiceStore();
    watch(() => voiceStore.connectedChannelId, (channelId) => {
        if (channelId) return;
        stopSharing();
        Array.from(watchPeers.keys()).forEach(stopWatching);
    });

    // Si quien comparto deja de compartir (o se desconecta), cortar mi visor
    // automáticamente en vez de quedar mirando un frame congelado.
    watch(() => voiceStore.voiceStates, (states) => {
        const stillSharing = new Set<string>();
        Object.values(states).forEach(participants => {
            participants.forEach(p => { if (p.sharing) stillSharing.add(p.socketId); });
        });
        Object.keys(watching.value).forEach(sharerSocketId => {
            if (!stillSharing.has(sharerSocketId)) {
                if (activeViewer.value?.socketId === sharerSocketId) watchState.value = 'ended';
                stopWatching(sharerSocketId);
            }
        });
    }, { deep: true });

    return {
        isSharing,
        localShareId,
        watching,
        streamReady,
        activeViewer,
        captureSettings,
        lastOptions,
        sharerStats,
        watchState,
        watchError,
        watchHasAudio,
        watchStats,
        getRemoteStream,
        getLocalStream,
        startSharing,
        stopSharing,
        watchShare,
        stopWatching,
        bindSocket,
        unbindSocket,
    };
});
