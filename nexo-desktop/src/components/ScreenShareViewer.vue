<template>
  <div v-if="screenShareStore.activeViewer" ref="containerEl" class="fixed inset-0 bg-black z-40 flex flex-col">
    <header class="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/70 to-transparent">
      <p class="text-gray-200 font-medium text-[14px]">
        Viendo la pantalla de <span class="font-semibold">{{ screenShareStore.activeViewer.username }}</span>
      </p>
      <div class="flex items-center gap-2">
        <!-- Mute/unmute (solo si el share trae audio) -->
        <button
          v-if="screenShareStore.watchHasAudio"
          @click="toggleMute"
          class="text-gray-300 hover:text-white bg-white/[0.08] hover:bg-white/[0.14] p-2.5 rounded-lg transition-colors"
          :title="isMuted ? 'Activar sonido' : 'Silenciar'"
        >
          <svg v-if="!isMuted" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v3.5m0 7V19c0 .891-1.077 1.337-1.707.707L5.586 15zM17 8l4 8m0-8l-4 8" />
          </svg>
        </button>

        <!-- Estadísticas -->
        <button
          @click="showStats = !showStats"
          class="relative text-gray-300 hover:text-white bg-white/[0.08] hover:bg-white/[0.14] p-2.5 rounded-lg transition-colors"
          title="Estadísticas de la transmisión"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>

          <div
            v-if="showStats && screenShareStore.watchStats"
            class="absolute top-full right-0 mt-2 w-56 bg-[#1a1b1e] border border-white/[0.08] rounded-lg shadow-2xl p-3 text-left cursor-default"
            @click.stop
          >
            <dl class="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
              <dt class="text-gray-500">Resolución</dt>
              <dd class="text-gray-200 text-right">
                {{ screenShareStore.watchStats.width != null && screenShareStore.watchStats.height != null
                  ? `${screenShareStore.watchStats.width}×${screenShareStore.watchStats.height}`
                  : '—' }}
              </dd>
              <dt class="text-gray-500">FPS</dt>
              <dd class="text-gray-200 text-right">{{ screenShareStore.watchStats.fps ?? '—' }}</dd>
              <dt class="text-gray-500">Códec</dt>
              <dd class="text-gray-200 text-right">{{ screenShareStore.watchStats.codec ?? '—' }}</dd>
              <dt class="text-gray-500">Bitrate</dt>
              <dd class="text-gray-200 text-right">
                {{ screenShareStore.watchStats.bitrateKbps != null ? `${screenShareStore.watchStats.bitrateKbps} kbps` : '—' }}
              </dd>
              <dt class="text-gray-500">RTT</dt>
              <dd class="text-gray-200 text-right">
                {{ screenShareStore.watchStats.rttMs != null ? `${screenShareStore.watchStats.rttMs} ms` : '—' }}
              </dd>
              <dt class="text-gray-500">Pérdida</dt>
              <dd class="text-gray-200 text-right">
                {{ screenShareStore.watchStats.packetLossPct != null ? `${screenShareStore.watchStats.packetLossPct}%` : '—' }}
              </dd>
            </dl>
          </div>
        </button>

        <button
          @click="toggleFullscreen"
          class="text-gray-300 hover:text-white bg-white/[0.08] hover:bg-white/[0.14] p-2.5 rounded-lg transition-colors"
          :title="isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'"
        >
          <svg v-if="!isFullscreen" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V5m0 4H5m4 0L4 4m11 5V5m0 4h4m-4 0l5-5M9 15v4m0-4H5m4 0l-5 5m11-5v4m0-4h4m-4 0l5 5" />
          </svg>
        </button>
        <button
          @click="close"
          class="text-gray-300 hover:text-white bg-white/[0.08] hover:bg-white/[0.14] px-4 py-2 rounded-lg font-medium transition-colors text-[13px]"
        >
          Dejar de ver
        </button>
      </div>
    </header>

    <!-- Conectando -->
    <div v-if="screenShareStore.watchState === 'connecting'" class="flex-1 flex flex-col items-center justify-center gap-3">
      <div class="w-8 h-8 border-2 border-white/10 border-t-indigo-400 rounded-full animate-spin"></div>
      <p class="text-gray-400 text-[13px]">Conectando con la transmisión de {{ screenShareStore.activeViewer.username }}…</p>
    </div>

    <!-- Error -->
    <div v-else-if="screenShareStore.watchState === 'failed'" class="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <p class="text-gray-300 text-[14px] font-medium">No se pudo conectar. Generalmente es un problema de red o NAT.</p>
      <button
        @click="retry"
        class="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2 rounded-lg font-medium transition-colors text-[13px]"
      >
        Reintentar
      </button>
    </div>

    <!-- Sala llena -->
    <div v-else-if="screenShareStore.watchState === 'full'" class="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <p class="text-gray-300 text-[14px] font-medium">{{ fullMessage }}</p>
    </div>

    <!-- Transmisión terminada -->
    <div
      v-else-if="screenShareStore.watchState === 'ended'"
      @click="close"
      class="flex-1 flex flex-col items-center justify-center gap-3 cursor-pointer"
    >
      <p class="text-gray-300 text-[14px] font-medium">La transmisión terminó</p>
    </div>

    <!-- Reproduciendo -->
    <video
      v-show="screenShareStore.watchState === 'playing'"
      ref="videoEl"
      autoplay
      playsinline
      @dblclick="toggleFullscreen"
      class="flex-1 w-full h-full object-contain bg-black cursor-pointer"
    ></video>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { useScreenShareStore } from '../stores/screenShare';
import { useVoiceStore } from '../stores/voice';

const screenShareStore = useScreenShareStore();
const voiceStore = useVoiceStore();
const videoEl = ref<HTMLVideoElement | null>(null);
const containerEl = ref<HTMLDivElement | null>(null);
const isFullscreen = ref(false);
const isMuted = ref(false);
const showStats = ref(false);

const fullMessage = 'Esta transmisión está llena';

watch(
  () => [screenShareStore.activeViewer?.socketId, screenShareStore.watchState] as const,
  ([socketId, state]) => {
    if (!socketId || !videoEl.value || state !== 'playing') return;
    const stream = screenShareStore.getRemoteStream(socketId);
    if (stream) {
      videoEl.value.srcObject = stream;
      videoEl.value.muted = isMuted.value;
    }
  }
);

const toggleMute = () => {
  isMuted.value = !isMuted.value;
  if (videoEl.value) videoEl.value.muted = isMuted.value;
};

const onFullscreenChange = () => {
  isFullscreen.value = document.fullscreenElement === containerEl.value;
};
document.addEventListener('fullscreenchange', onFullscreenChange);
onUnmounted(() => document.removeEventListener('fullscreenchange', onFullscreenChange));

// Se pide fullscreen sobre el contenedor (no el <video> solo) para que el
// header y el botón de "Dejar de ver" sigan visibles y clickeables encima.
const toggleFullscreen = () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else if (containerEl.value) {
    containerEl.value.requestFullscreen();
  }
};

// 'ended' auto-closes the viewer after a short grace period so the user has
// a moment to read the message, or immediately on click (see template).
let endedTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => screenShareStore.watchState,
  (state) => {
    if (endedTimer) {
      clearTimeout(endedTimer);
      endedTimer = null;
    }
    if (state === 'ended') {
      endedTimer = setTimeout(close, 3000);
    }
  }
);
onUnmounted(() => {
  if (endedTimer) clearTimeout(endedTimer);
});

// `activeViewer` only carries socketId/username, not the shareId watchShare
// needs — the same gap the store itself works around internally (see
// findShareIdFor) by reconstructing it from the voice roster, which is the
// source of truth for "what shareId is this socket currently sharing".
const findShareId = (socketId: string): string | null => {
  for (const participants of Object.values(voiceStore.voiceStates)) {
    const match = participants.find(p => p.socketId === socketId);
    if (match) return match.shareId;
  }
  return null;
};

const retry = () => {
  const viewer = screenShareStore.activeViewer;
  if (!viewer) return;
  const shareId = findShareId(viewer.socketId);
  if (!shareId) return;
  screenShareStore.watchShare(viewer.socketId, shareId, viewer.username);
};

const close = () => {
  const socketId = screenShareStore.activeViewer?.socketId;
  if (socketId) screenShareStore.stopWatching(socketId);
};
</script>
