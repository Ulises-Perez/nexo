import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Socket } from 'socket.io-client';

export interface VoiceParticipant {
    socketId: string;
    userId: string;
    username: string;
    avatarUrl: string | null;
    muted: boolean;
}

const RTC_CONFIG: RTCConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ],
};

export const useVoiceStore = defineStore('voice', () => {
    // Canal de voz al que estoy conectado ('' = ninguno)
    const connectedChannelId = ref<string>('');
    const isConnecting = ref(false);
    const isMuted = ref(false);
    const isDeafened = ref(false);

    // Estado de voz de todos los canales visibles: channelId -> participantes
    const voiceStates = ref<Record<string, VoiceParticipant[]>>({});

    // Quién está hablando ahora mismo: socketId -> true
    const speaking = ref<Record<string, boolean>>({});

    // Objetos WebRTC (fuera de la reactividad de Vue)
    let socket: Socket | null = null;
    let localStream: MediaStream | null = null;
    const peers = new Map<string, RTCPeerConnection>();
    const audioElements = new Map<string, HTMLAudioElement>();

    const getParticipants = (channelId: string): VoiceParticipant[] => {
        return voiceStates.value[channelId] ?? [];
    };

    const isSpeaking = (socketId: string): boolean => {
        return !!speaking.value[socketId];
    };

    // ===================== Sonidos de conexión (WebAudio, sin assets) =====================

    let audioCtx: AudioContext | null = null;

    const ensureAudioCtx = (): AudioContext => {
        if (!audioCtx) audioCtx = new AudioContext();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    };

    const playTone = (notes: Array<{ freq: number; at: number }>, duration = 0.18, volume = 0.12) => {
        try {
            const ctx = ensureAudioCtx();
            notes.forEach(({ freq, at }) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.value = freq;
                const t = ctx.currentTime + at;
                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(volume, t + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
                osc.connect(gain).connect(ctx.destination);
                osc.start(t);
                osc.stop(t + duration + 0.05);
            });
        } catch {
            // Audio no disponible: ignorar
        }
    };

    // Dos tonos ascendentes al entrar, descendentes al salir (estilo Discord)
    const playJoinSound = () => playTone([{ freq: 540, at: 0 }, { freq: 740, at: 0.12 }]);
    const playLeaveSound = () => playTone([{ freq: 640, at: 0 }, { freq: 420, at: 0.12 }]);

    // ===================== Detección de voz (anillo verde al hablar) =====================

    const analysers = new Map<string, AnalyserNode>();
    const vadSources = new Map<string, MediaStreamAudioSourceNode>();
    const lastSpoke = new Map<string, number>();
    let vadTimer: ReturnType<typeof setInterval> | null = null;

    const SPEAKING_THRESHOLD = 0.02; // RMS mínimo para considerar que hay voz
    const SPEAKING_HOLD_MS = 350;    // El anillo se mantiene un instante tras dejar de hablar

    const watchStream = (socketId: string, stream: MediaStream) => {
        try {
            const ctx = ensureAudioCtx();
            unwatchStream(socketId);
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            vadSources.set(socketId, source);
            analysers.set(socketId, analyser);
            startVadLoop();
        } catch (error) {
            console.error('[Voice] No se pudo analizar el audio:', error);
        }
    };

    const unwatchStream = (socketId: string) => {
        vadSources.get(socketId)?.disconnect();
        vadSources.delete(socketId);
        analysers.delete(socketId);
        lastSpoke.delete(socketId);
        delete speaking.value[socketId];
        if (analysers.size === 0) stopVadLoop();
    };

    const startVadLoop = () => {
        if (vadTimer) return;
        vadTimer = setInterval(() => {
            const now = Date.now();
            analysers.forEach((analyser, socketId) => {
                const data = new Uint8Array(analyser.fftSize);
                analyser.getByteTimeDomainData(data);
                let sum = 0;
                for (let i = 0; i < data.length; i++) {
                    const v = (data[i] - 128) / 128;
                    sum += v * v;
                }
                const rms = Math.sqrt(sum / data.length);
                if (rms > SPEAKING_THRESHOLD) lastSpoke.set(socketId, now);
                const speakingNow = now - (lastSpoke.get(socketId) ?? 0) < SPEAKING_HOLD_MS;
                if (!!speaking.value[socketId] !== speakingNow) {
                    speaking.value[socketId] = speakingNow;
                }
            });
        }, 120);
    };

    const stopVadLoop = () => {
        if (vadTimer) {
            clearInterval(vadTimer);
            vadTimer = null;
        }
    };

    // ===================== WebRTC (malla P2P) =====================

    const createPeer = (remoteSocketId: string, initiator: boolean): RTCPeerConnection => {
        const pc = new RTCPeerConnection(RTC_CONFIG);
        peers.set(remoteSocketId, pc);

        if (localStream) {
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream!));
        }

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket?.emit('voice_signal', {
                    to: remoteSocketId,
                    signal: { type: 'ice', candidate: event.candidate.toJSON() },
                });
            }
        };

        pc.ontrack = (event) => {
            const [stream] = event.streams;
            if (!stream) return;
            let audio = audioElements.get(remoteSocketId);
            if (!audio) {
                audio = new Audio();
                audio.autoplay = true;
                audioElements.set(remoteSocketId, audio);
            }
            audio.srcObject = stream;
            audio.muted = isDeafened.value;

            // Analizar el audio remoto para el indicador de "hablando"
            watchStream(remoteSocketId, stream);
        };

        if (initiator) {
            pc.onnegotiationneeded = async () => {
                try {
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    socket?.emit('voice_signal', {
                        to: remoteSocketId,
                        signal: { type: 'offer', sdp: pc.localDescription },
                    });
                } catch (error) {
                    console.error('[Voice] Error creando oferta:', error);
                }
            };
        }

        return pc;
    };

    const destroyPeer = (remoteSocketId: string) => {
        const pc = peers.get(remoteSocketId);
        if (pc) {
            pc.close();
            peers.delete(remoteSocketId);
        }
        const audio = audioElements.get(remoteSocketId);
        if (audio) {
            audio.srcObject = null;
            audioElements.delete(remoteSocketId);
        }
        unwatchStream(remoteSocketId);
    };

    const handleSignal = async (data: { from: string; userId: string; signal: any }) => {
        const { from, signal } = data;
        try {
            let pc = peers.get(from);

            if (signal.type === 'offer') {
                if (!pc) pc = createPeer(from, false);
                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket?.emit('voice_signal', {
                    to: from,
                    signal: { type: 'answer', sdp: pc.localDescription },
                });
            } else if (signal.type === 'answer') {
                if (!pc) return;
                await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            } else if (signal.type === 'ice') {
                if (!pc) return;
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
        } catch (error) {
            console.error('[Voice] Error procesando señal:', error);
        }
    };

    // ===================== Eventos de socket =====================

    // Llamar una vez después de conectar el socket del chat
    const bindSocket = (s: Socket) => {
        socket = s;

        socket.on('voice_joined', (data: { channelId: string; peers: VoiceParticipant[] }) => {
            connectedChannelId.value = data.channelId;
            isConnecting.value = false;

            // Conectado por completo: sonido de entrada y análisis del micrófono propio
            playJoinSound();
            if (localStream && socket?.id) {
                watchStream(socket.id, localStream);
            }

            // El recién llegado inicia las ofertas hacia los peers existentes
            data.peers.forEach(peer => createPeer(peer.socketId, true));
        });

        socket.on('voice_peer_joined', (data: { channelId: string; peer: VoiceParticipant }) => {
            // El nuevo peer nos enviará una oferta; aquí solo avisamos con sonido
            if (data.channelId === connectedChannelId.value && !isDeafened.value) {
                playJoinSound();
            }
        });

        socket.on('voice_peer_left', (data: { socketId: string; channelId: string }) => {
            destroyPeer(data.socketId);
            if (data.channelId === connectedChannelId.value && !isDeafened.value) {
                playLeaveSound();
            }
        });

        socket.on('voice_signal', handleSignal);

        socket.on('voice_state_update', (data: { channelId: string; participants: VoiceParticipant[] }) => {
            if (data.participants.length === 0) {
                delete voiceStates.value[data.channelId];
            } else {
                voiceStates.value[data.channelId] = data.participants;
            }
        });
    };

    const unbindSocket = () => {
        leaveVoice();
        socket = null;
        voiceStates.value = {};
    };

    // Pide el estado de voz de los canales indicados (al entrar a una comunidad)
    const syncVoiceStates = (channelIds: string[]) => {
        if (!socket || channelIds.length === 0) return;
        socket.emit('get_voice_states', { channelIds }, (states: Record<string, VoiceParticipant[]>) => {
            channelIds.forEach(id => {
                if (states[id]) {
                    voiceStates.value[id] = states[id];
                } else {
                    delete voiceStates.value[id];
                }
            });
        });
    };

    // ===================== Acciones =====================

    const joinVoice = async (channelId: string) => {
        if (!socket) return;
        if (connectedChannelId.value === channelId) return;

        // Cambiar de canal: salir del actual primero
        if (connectedChannelId.value) {
            leaveVoice();
        }

        isConnecting.value = true;
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (isMuted.value) {
                localStream.getAudioTracks().forEach(t => (t.enabled = false));
            }
            socket.emit('join_voice', { channelId });
        } catch (error) {
            isConnecting.value = false;
            console.error('[Voice] No se pudo acceder al micrófono:', error);
            alert('No se pudo acceder al micrófono. Revisa los permisos del sistema.');
        }
    };

    const leaveVoice = () => {
        if (!connectedChannelId.value && !isConnecting.value) return;

        const wasConnected = !!connectedChannelId.value;

        socket?.emit('leave_voice');

        peers.forEach((_, socketId) => destroyPeer(socketId));
        peers.clear();

        // Dejar de analizar el micrófono propio
        if (socket?.id) unwatchStream(socket.id);
        stopVadLoop();
        speaking.value = {};

        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }

        connectedChannelId.value = '';
        isConnecting.value = false;

        if (wasConnected) playLeaveSound();
    };

    const toggleMute = () => {
        isMuted.value = !isMuted.value;
        if (localStream) {
            localStream.getAudioTracks().forEach(t => (t.enabled = !isMuted.value));
        }
        socket?.emit('voice_mute', { muted: isMuted.value });
    };

    const toggleDeafen = () => {
        isDeafened.value = !isDeafened.value;
        audioElements.forEach(audio => (audio.muted = isDeafened.value));
        // Al ensordecer también se silencia el micrófono (como Discord)
        if (isDeafened.value && !isMuted.value) {
            toggleMute();
        }
    };

    return {
        connectedChannelId,
        isConnecting,
        isMuted,
        isDeafened,
        voiceStates,
        speaking,
        getParticipants,
        isSpeaking,
        bindSocket,
        unbindSocket,
        syncVoiceStates,
        joinVoice,
        leaveVoice,
        toggleMute,
        toggleDeafen,
    };
});
