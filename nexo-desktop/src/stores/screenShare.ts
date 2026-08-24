import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { Socket } from 'socket.io-client';
import { RTC_CONFIG, useVoiceStore } from './voice';

export interface QualityPreset {
    id: 'low' | 'medium' | 'high';
    label: string;
    width: number;
    height: number;
    frameRate: number;
    maxBitrateKbps: number;
}

export const QUALITY_PRESETS: QualityPreset[] = [
    { id: 'low', label: 'Baja', width: 1280, height: 720, frameRate: 15, maxBitrateKbps: 1000 },
    { id: 'medium', label: 'Media', width: 1280, height: 720, frameRate: 30, maxBitrateKbps: 2500 },
    { id: 'high', label: 'Alta', width: 1920, height: 1080, frameRate: 30, maxBitrateKbps: 4500 },
];

type ScreenSignal =
    | { type: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit; kind: 'screen'; shareId: string }
    | { type: 'ice'; candidate: RTCIceCandidateInit; kind: 'screen'; shareId: string }
    | { type: 'screen-stop-watching'; kind: 'screen'; shareId: string };

export const useScreenShareStore = defineStore('screenShare', () => {
    // ===================== Estado =====================

    const isSharing = ref(false);
    const localShareId = ref<string | null>(null);
    // Controla el modal de selección de calidad — lo abre VoicePanel.vue, lo
    // muestra Dashboard.vue (mismo criterio que el resto de los modales globales).
    const showQualityPicker = ref(false);

    // Quién estoy mirando ahora mismo: sharerSocketId -> true. Se activa
    // apenas se pide mirar (para mostrar "conectando...") — el stream real
    // puede tardar un instante más en llegar (ver streamReady).
    const watching = ref<Record<string, boolean>>({});
    const streamReady = ref<Record<string, boolean>>({});

    // A qué transmisión apunta el visor grande (nulo = visor cerrado)
    const activeViewer = ref<{ socketId: string; username: string } | null>(null);

    // Objetos WebRTC (fuera de la reactividad de Vue, mismo criterio que voice.ts)
    let socket: Socket | null = null;
    let localScreenStream: MediaStream | null = null;
    const sharePeers = new Map<string, RTCPeerConnection>();  // watcherSocketId -> pc (yo comparto)
    const watchPeers = new Map<string, RTCPeerConnection>();  // sharerSocketId  -> pc (yo miro)
    const remoteStreams = new Map<string, MediaStream>();     // sharerSocketId  -> stream que estoy mirando

    const getRemoteStream = (sharerSocketId: string): MediaStream | null => {
        return remoteStreams.get(sharerSocketId) ?? null;
    };

    // Vista previa para quien comparte — sin esto, compartir solo (sin nadie
    // más mirando) no da ninguna confirmación visual de que la captura anda.
    const getLocalStream = (): MediaStream | null => localScreenStream;

    // ===================== Límite de bitrate/fps =====================

    const applyEncodingCaps = async (sender: RTCRtpSender, preset: QualityPreset) => {
        try {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
            params.encodings[0].maxBitrate = preset.maxBitrateKbps * 1000;
            params.encodings[0].maxFramerate = preset.frameRate;
            await sender.setParameters(params);
        } catch (error) {
            // No fatal: sigue compartiendo, solo sin el límite de bitrate aplicado.
            console.error('[ScreenShare] No se pudo aplicar el límite de bitrate:', error);
        }
    };

    // ===================== Lado de quien comparte =====================

    const startSharing = async (preset: QualityPreset) => {
        if (!socket || isSharing.value) return;
        try {
            localScreenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: preset.width, max: preset.width },
                    height: { ideal: preset.height, max: preset.height },
                    frameRate: { ideal: preset.frameRate, max: preset.frameRate },
                },
                audio: false,
            });
            const [track] = localScreenStream.getVideoTracks();
            if (track) {
                track.contentHint = 'motion';
                // Se dispara si el usuario corta desde la barra nativa de
                // "Dejar de compartir" de WebView2, no solo desde el botón de Nexo.
                track.onended = () => stopSharing();
            }
            localShareId.value = crypto.randomUUID();
            currentPreset = preset;
            socket.emit('start_screen_share', { shareId: localShareId.value });
            isSharing.value = true;
        } catch (error) {
            console.error('[ScreenShare] No se pudo iniciar el compartir pantalla:', error);
        }
    };

    let currentPreset: QualityPreset = QUALITY_PRESETS[1];

    // Crea (o recrea) la conexión hacia un espectador específico, en respuesta
    // a una oferta suya — nunca proactivo, el que comparte nunca inicia.
    const acceptWatcher = async (watcherSocketId: string, offerSdp: RTCSessionDescriptionInit) => {
        if (!socket || !isSharing.value || !localScreenStream || !localShareId.value) return;

        const existing = sharePeers.get(watcherSocketId);
        if (existing) existing.close();

        const pc = new RTCPeerConnection(RTC_CONFIG);
        sharePeers.set(watcherSocketId, pc);

        const [track] = localScreenStream.getVideoTracks();
        const sender = track ? pc.addTrack(track, localScreenStream) : null;

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
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            if (sender) await applyEncodingCaps(sender, currentPreset);
            socket.emit('voice_signal', {
                to: watcherSocketId,
                signal: { type: 'answer', kind: 'screen', shareId: localShareId.value, sdp: pc.localDescription },
            });
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
    };

    const stopSharing = () => {
        if (!isSharing.value) return;
        sharePeers.forEach(pc => pc.close());
        sharePeers.clear();
        if (localScreenStream) {
            localScreenStream.getTracks().forEach(t => t.stop());
            localScreenStream = null;
        }
        socket?.emit('stop_screen_share');
        isSharing.value = false;
        localShareId.value = null;
    };

    // ===================== Lado de quien mira =====================

    // El espectador siempre inicia la oferta (igual que el que entra a un
    // canal de voz siempre ofrece primero en voice.ts).
    const watchShare = async (sharerSocketId: string, shareId: string, username: string) => {
        if (!socket || watchPeers.has(sharerSocketId)) return;

        watching.value[sharerSocketId] = true;
        activeViewer.value = { socketId: sharerSocketId, username };

        const pc = new RTCPeerConnection(RTC_CONFIG);
        watchPeers.set(sharerSocketId, pc);
        pc.addTransceiver('video', { direction: 'recvonly' });

        pc.ontrack = (event) => {
            const [stream] = event.streams;
            if (!stream) return;
            remoteStreams.set(sharerSocketId, stream);
            streamReady.value[sharerSocketId] = true;
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket?.emit('voice_signal', {
                    to: sharerSocketId,
                    signal: { type: 'ice', kind: 'screen', shareId, candidate: event.candidate.toJSON() },
                });
            }
        };

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
        remoteStreams.delete(sharerSocketId);
        delete watching.value[sharerSocketId];
        delete streamReady.value[sharerSocketId];
        if (activeViewer.value?.socketId === sharerSocketId) activeViewer.value = null;
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
            if (!stillSharing.has(sharerSocketId)) stopWatching(sharerSocketId);
        });
    }, { deep: true });

    return {
        isSharing,
        localShareId,
        showQualityPicker,
        watching,
        streamReady,
        activeViewer,
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
