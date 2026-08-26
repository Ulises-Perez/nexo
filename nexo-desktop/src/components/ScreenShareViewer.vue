<template>
  <div v-if="screenShareStore.activeViewer" ref="containerEl" class="fixed inset-0 bg-black z-40 flex flex-col">
    <header class="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/70 to-transparent">
      <p class="text-gray-200 font-medium text-[14px]">
        Viendo la pantalla de <span class="font-semibold">{{ screenShareStore.activeViewer.username }}</span>
      </p>
      <div class="flex items-center gap-2">
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

    <div v-if="!isReady" class="flex-1 flex flex-col items-center justify-center gap-3">
      <div class="w-8 h-8 border-2 border-white/10 border-t-indigo-400 rounded-full animate-spin"></div>
      <p class="text-gray-400 text-[13px]">Conectando...</p>
    </div>
    <video
      v-show="isReady"
      ref="videoEl"
      autoplay
      @dblclick="toggleFullscreen"
      class="flex-1 w-full h-full object-contain bg-black cursor-pointer"
    ></video>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue';
import { useScreenShareStore } from '../stores/screenShare';

const screenShareStore = useScreenShareStore();
const videoEl = ref<HTMLVideoElement | null>(null);
const containerEl = ref<HTMLDivElement | null>(null);
const isFullscreen = ref(false);

const isReady = computed(() => {
  const socketId = screenShareStore.activeViewer?.socketId;
  return !!socketId && !!screenShareStore.streamReady[socketId];
});

watch(
  () => [screenShareStore.activeViewer?.socketId, isReady.value] as const,
  ([socketId]) => {
    if (!socketId || !videoEl.value) return;
    const stream = screenShareStore.getRemoteStream(socketId);
    if (stream) videoEl.value.srcObject = stream;
  }
);

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

const close = () => {
  const socketId = screenShareStore.activeViewer?.socketId;
  if (socketId) screenShareStore.stopWatching(socketId);
};
</script>
