import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Socket } from 'socket.io-client';
import { hydrateCache, persistCache, VOICE_USER_AUDIO_CACHE_KEY } from '../composables/persistedCache';

export interface VoiceParticipant {
    socketId: string;
    userId: string;
    username: string;
    avatarUrl: string | null;
    muted: boolean;
    sharing: boolean;
    shareId: string | null;
}

// Compartido con screenShare.ts: misma config (solo STUN) para las conexiones de pantalla.
export const RTC_CONFIG: RTCConfiguration = {
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
    // True entre que el socket se cae y logra reingresar al mismo canal —
    // sin esto el panel sigue mostrando "Voz conectada" durante todo el
    // corte (p. ej. un reinicio del backend) y la gente reingresa a mano
    // en vez de esperar a que el reingreso automático haga su trabajo.
    const isReconnecting = ref(false);

    // Estado de voz de todos los canales visibles: channelId -> participantes
    const voiceStates = ref<Record<string, VoiceParticipant[]>>({});

    // Quién está hablando ahora mismo: socketId -> true
    const speaking = ref<Record<string, boolean>>({});

    // Ajustes de audio locales por usuario (no afectan a nadie más ni al
    // servidor): volumen 0..100 (ausente = 100, default) y mute local
    // (presente = muteado para mí). Claveados por userId, no por socketId,
    // porque el socketId cambia en cada reconexión y estos ajustes deben
    // sobrevivir a eso.
    const cachedUserAudio = hydrateCache<{ volumes: Record<string, number>; mutes: Record<string, true> }>(
        VOICE_USER_AUDIO_CACHE_KEY,
        1
    );
    const sanitizedVolumes: Record<string, number> = {};
    if (cachedUserAudio?.volumes) {
        for (const [userId, vol] of Object.entries(cachedUserAudio.volumes)) {
            if (typeof vol === 'number' && Number.isFinite(vol) && vol >= 0 && vol <= 100) {
                sanitizedVolumes[userId] = vol;
            }
        }
    }
    const sanitizedMutes: Record<string, true> = {};
    if (cachedUserAudio?.mutes) {
        for (const userId of Object.keys(cachedUserAudio.mutes)) {
            if (cachedUserAudio.mutes[userId]) sanitizedMutes[userId] = true;
        }
    }
    const userVolumes = ref<Record<string, number>>(sanitizedVolumes);
    const localMutes = ref<Record<string, true>>(sanitizedMutes);

    // Persistir estos ajustes es debounced (no write-through): setUserVolume
    // se llama en cada tick de un slider.
    let persistUserAudioTimer: ReturnType<typeof setTimeout> | null = null;
    const schedulePersistUserAudio = () => {
        if (persistUserAudioTimer) clearTimeout(persistUserAudioTimer);
        persistUserAudioTimer = setTimeout(() => {
            persistUserAudioTimer = null;
            // Solo se persisten las entradas que no están en su default: un
            // volumen en 100 o un mute ausente no aportan nada al hidratar.
            const volumes: Record<string, number> = {};
            for (const [userId, vol] of Object.entries(userVolumes.value)) {
                if (vol !== 100) volumes[userId] = vol;
            }
            const mutes: Record<string, true> = {};
            for (const [userId, muted] of Object.entries(localMutes.value)) {
                if (muted) mutes[userId] = true;
            }
            persistCache(VOICE_USER_AUDIO_CACHE_KEY, 1, { volumes, mutes });
        }, 150);
    };

    // Objetos WebRTC (fuera de la reactividad de Vue)
    let socket: Socket | null = null;
    let localStream: MediaStream | null = null;
    const peers = new Map<string, RTCPeerConnection>();
    const audioElements = new Map<string, HTMLAudioElement>();

    // Distingue la primera conexión del socket de una reconexión (drop de red,
    // reinicio del backend, laptop suspendida, etc.).
    let hasConnectedBefore = false;

    // Contador de generación: se incrementa en cada intento de unión (manual o
    // de reingreso automático) y en leaveVoice. Cualquier continuación async
    // (un sleep de reintento, un callback de ack) que observe que la
    // generación cambió debe abortar en silencio — así un reintento viejo no
    // pisa una unión más nueva cuando el usuario cambia de canal, se
    // desconecta a mano, o un rejoin más reciente lo reemplaza.
    let intentoDeUnion = 0;

    const getParticipants = (channelId: string): VoiceParticipant[] => {
        return voiceStates.value[channelId] ?? [];
    };

    const isSpeaking = (socketId: string): boolean => {
        return !!speaking.value[socketId];
    };

    // Traduce el socketId de un peer (efímero, cambia en cada reconexión) a
    // su userId (estable) usando el roster del canal conectado actualmente.
    const userIdForSocket = (socketId: string): string | undefined =>
        (voiceStates.value[connectedChannelId.value] ?? []).find(p => p.socketId === socketId)?.userId;

    // Aplica volumen + mute (local, por-usuario) y deafen (global) al <audio>
    // de un peer. Punto central que reemplaza la lógica de mute dispersa que
    // antes solo vivía en toggleDeafen y en pc.ontrack: el mute local
    // sobrevive al toggle de deafen (al desensordecer, vuelven a sonar todos
    // menos los que tienen mute local activo).
    const applyOutputState = (socketId: string) => {
        const audio = audioElements.get(socketId);
        if (!audio) return;
        const userId = userIdForSocket(socketId);
        const vol = userId !== undefined ? (userVolumes.value[userId] ?? 100) : 100;
        audio.volume = vol / 100;
        audio.muted = isDeafened.value || (userId !== undefined && !!localMutes.value[userId]);
    };

    const applyAllOutputState = () => audioElements.forEach((_, socketId) => applyOutputState(socketId));

    const ownSocketId = (): string | undefined => socket?.id;

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
    const vadBuffers = new Map<string, Uint8Array>();
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
            // Alocado una sola vez acá, no en cada tick del loop de VAD, para
            // no presionar al GC con un peer más ni con más frecuencia.
            vadBuffers.set(socketId, new Uint8Array(analyser.fftSize));
            startVadLoop();
        } catch (error) {
            console.error('[Voice] No se pudo analizar el audio:', error);
        }
    };

    const unwatchStream = (socketId: string) => {
        vadSources.get(socketId)?.disconnect();
        vadSources.delete(socketId);
        analysers.delete(socketId);
        vadBuffers.delete(socketId);
        lastSpoke.delete(socketId);
        delete speaking.value[socketId];
        if (analysers.size === 0) stopVadLoop();
    };

    const startVadLoop = () => {
        if (vadTimer) return;
        vadTimer = setInterval(() => {
            const now = Date.now();
            analysers.forEach((analyser, socketId) => {
                const data = vadBuffers.get(socketId);
                if (!data) return;
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
            applyOutputState(remoteSocketId);

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
        // Las señales de screen share viajan por el mismo evento pero las
        // maneja screenShare.ts en su propio listener — acá se ignoran para
        // no enrutarlas por error a la conexión de audio de ese mismo peer.
        if (signal?.kind === 'screen') return;
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

        socket.on('connect', () => {
            // Toda reconexión (drop de red, backend reiniciado, laptop
            // suspendida) llega con un socket.id nuevo: el server ya nos
            // sacó de voiceChannels en su handler de disconnect, así que
            // localmente hay que reflejar eso y reingresar si seguíamos
            // "conectados" a un canal — si no, el audio P2P sigue sonando
            // pero el roster del servidor ya no nos tiene, y nadie ve a
            // nadie hasta el próximo refresh manual.
            if (hasConnectedBefore && connectedChannelId.value) {
                const channelId = connectedChannelId.value;
                connectedChannelId.value = '';
                peers.forEach((_, socketId) => destroyPeer(socketId));
                peers.clear();
                rejoinVoice(channelId);
            }
            hasConnectedBefore = true;
        });

        socket.on('disconnect', () => {
            // Todavía "conectados" a un canal según nuestro estado: es un
            // corte a reconectar, no una salida voluntaria (leaveVoice ya
            // limpia connectedChannelId antes de desconectar el socket).
            if (connectedChannelId.value) {
                isReconnecting.value = true;
            }
        });

        socket.on('voice_joined', (data: { channelId: string; peers: VoiceParticipant[] }) => {
            // Un voice_joined puede llegar tarde: el server tardó más que el
            // timeout del ack y para cuando responde ya abandonamos (o el
            // usuario se desconectó a mano). Sin micrófono local no podemos
            // participar — el audio no viajaría en ninguna dirección y
            // quedaríamos "en la llamada" sin escuchar ni hablar, justo el
            // síntoma que este arreglo elimina. localStream en null significa
            // que pasamos por leaveVoice, o sea que NO estamos en ninguna
            // llamada: avisarle al server para que nos saque de su roster.
            if (!localStream) {
                socket?.emit('leave_voice');
                return;
            }

            // Idempotencia: si un ack se perdió pero la unión ya había tenido
            // éxito, el reintento reemitió join_voice, el server hizo un
            // leave+rejoin, y este cliente recibe voice_joined dos veces.
            // createPeer pisaría las entradas del Map sin cerrar la
            // RTCPeerConnection vieja (quedaría viva y rota). En el flujo
            // normal de primera unión esto es un no-op inofensivo: peers ya
            // está vacío.
            peers.forEach((_, id) => destroyPeer(id));
            peers.clear();

            connectedChannelId.value = data.channelId;
            isConnecting.value = false;
            isReconnecting.value = false;

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

        socket.on('voice_session_replaced', (_data: { channelId: string }) => {
            // Nos unimos a voz desde otra instancia (navegador / otra PC): el
            // server ya nos sacó de la llamada. Desmontar sin avisarle de vuelta
            // (sería redundante, el server ya lo sabe).
            const estabaEnVoz = !!connectedChannelId.value || isConnecting.value;
            tearDownVoice({ notifyServer: false });
            if (estabaEnVoz) {
                alert('Te uniste a voz desde otro dispositivo. Esta sesión se desconectó de la llamada.');
            }
        });

        socket.on('voice_state_update', (data: { channelId: string; participants: VoiceParticipant[] }) => {
            if (data.participants.length === 0) {
                delete voiceStates.value[data.channelId];
            } else {
                voiceStates.value[data.channelId] = data.participants;
            }
            // Cierra la carrera donde pc.ontrack se dispara antes de que
            // voiceStates conozca el userId de ese socket: sin esto, un audio
            // recién creado podría aplicar volumen/mute de default (100,
            // sin mute) en vez del ajuste local guardado para ese usuario.
            applyAllOutputState();
        });
    };

    const unbindSocket = () => {
        leaveVoice();
        socket = null;
        voiceStates.value = {};
        hasConnectedBefore = false;
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

    // (Re)adquiere el stream local del micrófono. Si ya había un stream vivo
    // (D5: p. ej. un reingreso automático anterior que nunca pasó por
    // leaveVoice) lo cierra primero — si no, el anterior queda abierto y
    // pisado sin liberarse, y el indicador de micrófono del sistema se queda
    // encendido de más. Las fallas se propagan hacia el llamador.
    // Devuelve false si otra unión nos superó mientras pedíamos el micrófono
    // (p. ej. doble click rápido en un canal): en ese caso suelta el stream
    // recién obtenido en vez de pisar el del intento ganador, que quedaría
    // vivo y fuera del alcance de cualquier leaveVoice posterior.
    const acquireLocalStream = async (miIntento: number): Promise<boolean> => {
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });

        if (miIntento !== intentoDeUnion) {
            stream.getTracks().forEach(t => t.stop());
            return false;
        }

        // 'speech' le indica al pipeline WebRTC/OS que priorice inteligibilidad
        // de voz por sobre fidelidad musical en el procesamiento de la señal.
        stream.getAudioTracks().forEach(t => (t.contentHint = 'speech'));

        localStream = stream;
        if (isMuted.value) {
            localStream.getAudioTracks().forEach(t => (t.enabled = false));
        }
        return true;
    };

    type ResultadoJoin = 'ok' | 'retryable' | 'permanent-forbidden' | 'permanent-notfound';

    // Emite join_voice con ack (con precedente en chat.ts, send_message) y
    // traduce la respuesta del servidor a un resultado simple para el caller.
    const emitJoinWithAck = (channelId: string): Promise<ResultadoJoin> => {
        return new Promise(resolve => {
            if (!socket) {
                // El caller acota esto con su propio deadline/retry.
                resolve('retryable');
                return;
            }
            socket.timeout(10000).emit(
                'join_voice',
                { channelId },
                (err: Error | null, res?: { ok: boolean; code?: 'not_found' | 'forbidden' | 'error'; retryable?: boolean }) => {
                    if (err || !res) {
                        resolve('retryable');
                        return;
                    }
                    if (res.ok) {
                        resolve('ok');
                        return;
                    }
                    if (res.retryable) {
                        resolve('retryable');
                        return;
                    }
                    if (res.code === 'forbidden') {
                        resolve('permanent-forbidden');
                        return;
                    }
                    if (res.code === 'not_found') {
                        resolve('permanent-notfound');
                        return;
                    }
                    resolve('retryable');
                }
            );
        });
    };

    // Camino de abandono compartido entre joinVoice y rejoinVoice: salida
    // limpia y completa + aviso audible y honesto al usuario. No agrega un
    // botón de "reintentar": el canal de voz mismo es el reintento.
    const abandonarReconexion = (miIntento: number, mensaje: string) => {
        // Nunca pisar una unión más nueva (p. ej. el usuario ya reingresó a mano).
        if (miIntento !== intentoDeUnion) return;
        leaveVoice(); // ya destruye peers, para el VAD, corta el micrófono y limpia los tres flags
        // connectedChannelId ya quedó en '' acá, así que el propio sonido de
        // "wasConnected" de leaveVoice no suena — hay que reproducirlo a mano
        // para que se note audiblemente que la llamada terminó.
        playLeaveSound();
        alert(mensaje);
    };

    const esperar = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

    // Postgres en Railway suele responder entre 10-30s tras un reinicio; 60s
    // cubre eso con margen. ~6 intentos por cliente es carga despreciable, y
    // el deadline garantiza que el estado zombie está acotado.
    const REINTENTOS_DELAYS_MS = [2000, 4000, 8000, 15000, 15000];
    const REINTENTO_DEADLINE_MS = 60_000;

    // ±25%: dispersa la tormenta de reconexión (todos los clientes reingresan
    // a la vez tras un redeploy del backend).
    const conJitter = (ms: number) => Math.round(ms * (1 + (Math.random() * 0.5 - 0.25)));

    const joinVoice = async (channelId: string) => {
        if (!socket) return;
        if (connectedChannelId.value === channelId) return;

        // Cambiar de canal: salir del actual primero
        if (connectedChannelId.value) {
            leaveVoice();
        }

        const miIntento = ++intentoDeUnion;
        isConnecting.value = true;

        try {
            // false = otra unión nos superó mientras pedíamos el micrófono; esa
            // otra es la dueña del estado ahora, así que cortamos en silencio.
            if (!(await acquireLocalStream(miIntento))) return;
        } catch (error) {
            console.error('[Voice] No se pudo acceder al micrófono:', error);
            abandonarReconexion(miIntento, 'No se pudo acceder al micrófono. Revisa los permisos del sistema.');
            return;
        }

        const resultado = await emitJoinWithAck(channelId);
        if (miIntento !== intentoDeUnion) return;

        if (resultado === 'ok') return; // el handler de voice_joined completa la unión

        const mensajes: Record<Exclude<ResultadoJoin, 'ok'>, string> = {
            'permanent-forbidden': 'No tenés acceso a este canal de voz.',
            'permanent-notfound': 'Este canal de voz ya no existe.',
            retryable: 'El servidor no respondió. Probá de nuevo.',
        };
        abandonarReconexion(miIntento, mensajes[resultado]);
    };

    // Reingreso automático tras una reconexión de socket (drop de red, redeploy
    // del backend, laptop suspendida). A diferencia de joinVoice (unión manual,
    // un solo intento, falla rápido), reintenta con backoff acotado — un fallo
    // transitorio de DB justo después de un restart no debe dejar al usuario
    // colgado en "Reconectando..." para siempre.
    const rejoinVoice = async (channelId: string) => {
        const miIntento = ++intentoDeUnion;
        isReconnecting.value = true;
        // Mantiene pasable el guard de salida temprana de leaveVoice y el panel visible.
        isConnecting.value = true;

        try {
            // false = otra unión nos superó mientras pedíamos el micrófono.
            if (!(await acquireLocalStream(miIntento))) return;
        } catch (error) {
            console.error('[Voice] No se pudo acceder al micrófono al reingresar:', error);
            abandonarReconexion(miIntento, 'No se pudo acceder al micrófono. Revisa los permisos del sistema.');
            return;
        }

        const inicio = Date.now();
        let intentoIndex = 0;

        while (true) {
            if (miIntento !== intentoDeUnion) return; // un rejoin/leave/join más nuevo nos superó
            if (connectedChannelId.value === channelId) return; // ya conectados por otra vía (un voice_joined llegó entre intentos)

            const resultado = await emitJoinWithAck(channelId);
            if (miIntento !== intentoDeUnion) return;

            if (resultado === 'ok') return; // el handler de voice_joined completa la unión

            if (resultado === 'permanent-forbidden' || resultado === 'permanent-notfound') {
                // Reintentar contra un rechazo real estaría mal.
                abandonarReconexion(
                    miIntento,
                    resultado === 'permanent-forbidden'
                        ? 'No tenés acceso a este canal de voz.'
                        : 'Este canal de voz ya no existe.'
                );
                return;
            }

            // resultado === 'retryable'
            const excedioDeadline = Date.now() - inicio >= REINTENTO_DEADLINE_MS;
            const sinIntentosRestantes = intentoIndex >= REINTENTOS_DELAYS_MS.length;
            if (excedioDeadline || sinIntentosRestantes) {
                abandonarReconexion(miIntento, 'El servidor no respondió. Probá de nuevo.');
                return;
            }

            await esperar(conJitter(REINTENTOS_DELAYS_MS[intentoIndex]));
            intentoIndex++;
        }
    };

    // Cuerpo real de leaveVoice, parametrizado para poder desmontar la
    // llamada sin avisarle al server (p. ej. cuando el propio server ya nos
    // sacó de voz porque nos unimos desde otra instancia: reemitir
    // leave_voice ahí sería redundante).
    const tearDownVoice = ({ notifyServer }: { notifyServer: boolean }) => {
        // Invalida cualquier intento de unión en vuelo (un sleep de reintento,
        // un callback de ack): salir de voz siempre debe poder cortar un
        // rejoin en curso, sin importar si había algo conectado.
        intentoDeUnion++;

        if (!connectedChannelId.value && !isConnecting.value) return;

        const wasConnected = !!connectedChannelId.value;

        if (notifyServer) socket?.emit('leave_voice');

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
        isReconnecting.value = false;

        if (wasConnected) playLeaveSound();
    };

    const leaveVoice = () => tearDownVoice({ notifyServer: true });

    const toggleMute = () => {
        isMuted.value = !isMuted.value;
        if (localStream) {
            localStream.getAudioTracks().forEach(t => (t.enabled = !isMuted.value));
        }
        socket?.emit('voice_mute', { muted: isMuted.value });
    };

    const toggleDeafen = () => {
        isDeafened.value = !isDeafened.value;
        applyAllOutputState();
        // Al ensordecer también se silencia el micrófono (como Discord)
        if (isDeafened.value && !isMuted.value) {
            toggleMute();
        }
    };

    // ===================== Ajustes locales de audio por usuario =====================
    // Nunca se limpian al desconectar un peer (destroyPeer) ni al salir del
    // canal: sobreviven a reconexiones e incluso a salir/reentrar, porque
    // están claveados por userId, no por socketId.

    const setUserVolume = (userId: string, volume: number): void => {
        const clamped = Math.min(100, Math.max(0, Math.round(volume)));
        if (clamped === 100) {
            delete userVolumes.value[userId];
        } else {
            userVolumes.value[userId] = clamped;
        }
        applyAllOutputState();
        schedulePersistUserAudio();
    };

    const getUserVolume = (userId: string): number => userVolumes.value[userId] ?? 100;

    const toggleLocalMute = (userId: string): void => {
        if (localMutes.value[userId]) {
            delete localMutes.value[userId];
        } else {
            localMutes.value[userId] = true;
        }
        applyAllOutputState();
        schedulePersistUserAudio();
    };

    const isLocallyMuted = (userId: string): boolean => !!localMutes.value[userId];

    return {
        connectedChannelId,
        isConnecting,
        isReconnecting,
        isMuted,
        isDeafened,
        voiceStates,
        speaking,
        getParticipants,
        isSpeaking,
        ownSocketId,
        bindSocket,
        unbindSocket,
        syncVoiceStates,
        joinVoice,
        leaveVoice,
        toggleMute,
        toggleDeafen,
        setUserVolume,
        getUserVolume,
        toggleLocalMute,
        isLocallyMuted,
    };
});
