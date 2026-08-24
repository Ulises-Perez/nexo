<template>
  <div v-if="screenShareStore.activeViewer" class="fixed inset-0 bg-black/80 z-40 flex flex-col items-center justify-center">
    <header class="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4">
      <p class="text-gray-200 font-medium text-[14px]">
        Viendo la pantalla de <span class="font-semibold">{{ screenShareStore.activeViewer.username }}</span>
      </p>
      <button
        @click="close"
        class="text-gray-300 hover:text-white bg-white/[0.08] hover:bg-white/[0.14] px-4 py-2 rounded-lg font-medium transition-colors text-[13px]"
      >
        Dejar de ver
      </button>
    </header>

    <div v-if="!isReady" class="flex flex-col items-center gap-3">
      <div class="w-8 h-8 border-2 border-white/10 border-t-indigo-400 rounded-full animate-spin"></div>
      <p class="text-gray-400 text-[13px]">Conectando...</p>
    </div>
    <video
      v-show="isReady"
      ref="videoEl"
      autoplay
      class="max-w-[80vw] max-h-[80vh] rounded-lg bg-black"
    ></video>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useScreenShareStore } from '../stores/screenShare';

const screenShareStore = useScreenShareStore();
const videoEl = ref<HTMLVideoElement | null>(null);

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

const close = () => {
  const socketId = screenShareStore.activeViewer?.socketId;
  if (socketId) screenShareStore.stopWatching(socketId);
};
</script>
