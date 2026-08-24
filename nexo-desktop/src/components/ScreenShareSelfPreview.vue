<template>
  <div
    v-if="screenShareStore.isSharing"
    class="fixed bottom-4 right-4 z-30 w-[220px] bg-[#1a1b1e] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden"
  >
    <video ref="videoEl" autoplay muted class="w-full h-[124px] object-contain bg-black"></video>
    <div class="px-3 py-2 flex items-center justify-between gap-2">
      <p class="text-[12px] text-emerald-400 font-medium flex items-center gap-1.5 min-w-0">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0"></span>
        <span class="truncate">Compartiendo tu pantalla</span>
      </p>
      <button
        @click="screenShareStore.stopSharing()"
        class="text-[11px] text-gray-400 hover:text-red-400 font-medium flex-shrink-0 transition-colors"
      >
        Detener
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useScreenShareStore } from '../stores/screenShare';

const screenShareStore = useScreenShareStore();
const videoEl = ref<HTMLVideoElement | null>(null);

watch(
  () => screenShareStore.isSharing,
  (sharing) => {
    if (!sharing || !videoEl.value) return;
    videoEl.value.srcObject = screenShareStore.getLocalStream();
  },
  { flush: 'post' }
);
</script>
