<template>
  <div
    v-if="screenShareStore.isSharing"
    class="fixed bottom-4 right-4 z-30 w-[220px] bg-[#1a1b1e] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden"
  >
    <div class="relative">
      <video ref="videoEl" autoplay muted class="w-full h-[124px] object-contain bg-black"></video>

      <!-- Stats strip -->
      <p
        v-if="statsLine"
        class="absolute bottom-1 left-1 right-1 text-[10px] leading-tight text-gray-300 bg-black/60 rounded px-1.5 py-0.5 truncate"
      >
        {{ statsLine }}
      </p>
    </div>

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

    <!-- Warnings -->
    <div v-if="captureMismatch || limitationWarning" class="px-3 pb-2 flex flex-col gap-1">
      <p v-if="captureMismatch" class="text-[10px] text-amber-400 leading-tight">{{ captureMismatch }}</p>
      <p v-if="limitationWarning" class="text-[10px] text-amber-400 leading-tight">{{ limitationWarning }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useScreenShareStore } from '../stores/screenShare';
import { getPreset } from '../lib/screenShare/presets';

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

// "1920×1080 @ 60 · VP9 · 6.2 Mbps · 2/4 viewers" — every field is optional,
// null fields are simply omitted from the joined line.
const statsLine = computed(() => {
  const capture = screenShareStore.captureSettings;
  const stats = screenShareStore.sharerStats;
  const parts: string[] = [];

  const hasRes = !!capture?.width && !!capture?.height;
  const hasFps = !!capture?.frameRate;
  if (hasRes && hasFps) {
    parts.push(`${capture!.width}×${capture!.height} @ ${Math.round(capture!.frameRate!)}`);
  } else if (hasRes) {
    parts.push(`${capture!.width}×${capture!.height}`);
  } else if (hasFps) {
    parts.push(`@ ${Math.round(capture!.frameRate!)}`);
  }

  if (stats?.codec) parts.push(stats.codec.toUpperCase());
  if (stats?.totalKbps != null) parts.push(`${(stats.totalKbps / 1000).toFixed(1)} Mbps`);
  if (stats?.viewers != null && stats?.maxViewers != null) parts.push(`${stats.viewers}/${stats.maxViewers} espectadores`);

  return parts.join(' · ');
});

// Warns when the actually-achieved capture falls meaningfully short of what
// was requested (the browser/OS may silently cap resolution or fps).
const captureMismatch = computed(() => {
  const capture = screenShareStore.captureSettings;
  if (!capture) return null;

  const preset = getPreset(screenShareStore.lastOptions.presetId);
  const requestedFps = preset.fps;
  const actualFps = capture.frameRate;

  const fpsShortfall = actualFps != null && requestedFps - actualFps > 3;
  const resShortfall =
    !!preset.width && !!preset.height && !!capture.width && !!capture.height &&
    (capture.width < preset.width || capture.height < preset.height);

  if (!fpsShortfall && !resShortfall) return null;

  const actualRes = capture.width && capture.height ? `${capture.width}×${capture.height}` : null;
  const requestedRes = preset.width && preset.height ? `${preset.width}×${preset.height}` : null;

  const actualLabel = [actualRes, actualFps != null ? `${Math.round(actualFps)}fps` : null].filter(Boolean).join(' @ ');
  const requestedLabel = [requestedRes, `${requestedFps}fps`].filter(Boolean).join(' @ ');

  return `Capturando a ${actualLabel} (se pidió ${requestedLabel})`;
});

const limitationWarning = computed(() => {
  const limitation = screenShareStore.sharerStats?.limitation;
  if (limitation !== 'cpu' && limitation !== 'bandwidth') return null;
  return 'Tu CPU/ancho de banda está limitando la calidad — probá un preset menor o el códec H264';
});
</script>
