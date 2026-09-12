<template>
  <BaseModal :show="show" width="480px" panel-class="bg-[#313338] rounded-xl flex flex-col" @close="close">
    <template #header="{ titleId, close: closeModal }">
      <header class="p-6 pb-2 relative">
        <button
          type="button"
          @click="closeModal"
          aria-label="Cerrar"
          class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-black/20 hover:bg-black/40 text-gray-300 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
        <h2 :id="titleId" class="text-xl font-bold text-gray-100">Compartir pantalla</h2>
        <p class="text-gray-400 text-[13px] mt-1">Elegí la calidad antes de elegir qué compartir</p>
      </header>
    </template>

    <div class="px-6 flex flex-col max-h-[60vh] overflow-y-auto custom-scrollbar">
      <!-- Presets de calidad -->
      <div class="mb-4">
        <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Calidad</label>
        <div class="flex flex-col gap-2">
          <label
            v-for="preset in SCREEN_SHARE_PRESETS"
            :key="preset.id"
            class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
            :class="presetId === preset.id ? 'bg-[#404249]' : 'bg-[#2B2D31] hover:bg-[#35373C]'"
          >
            <input type="radio" :value="preset.id" v-model="presetId" class="accent-indigo-500" />
            <div class="min-w-0 flex-1">
              <p class="text-gray-200 font-medium text-sm flex items-center gap-2">
                {{ preset.label }}
                <span
                  v-if="preset.recommended"
                  class="text-[10px] font-bold uppercase tracking-wide text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded"
                >
                  Recomendado
                </span>
              </p>
              <p class="text-gray-500 text-xs">
                ~{{ formatMbps(preset.maxBitrateKbps) }} Mbps de subida por espectador · hasta {{ preset.maxWatchers }} espectadores
              </p>
            </div>
          </label>
        </div>
      </div>

      <!-- Optimizar para -->
      <div class="mb-4">
        <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Optimizar para</label>
        <div class="flex bg-[#2B2D31] rounded-lg p-1 gap-1">
          <button
            type="button"
            @click="optimizeFor = 'motion'"
            class="flex-1 text-sm font-medium py-1.5 rounded-md transition-colors"
            :class="optimizeFor === 'motion' ? 'bg-[#404249] text-gray-100' : 'text-gray-400 hover:text-gray-200'"
          >
            Más fluido
          </button>
          <button
            type="button"
            @click="optimizeFor = 'detail'"
            class="flex-1 text-sm font-medium py-1.5 rounded-md transition-colors"
            :class="optimizeFor === 'detail' ? 'bg-[#404249] text-gray-100' : 'text-gray-400 hover:text-gray-200'"
          >
            Más nítido
          </button>
        </div>
      </div>

      <!-- Avanzado -->
      <div class="mb-4 border-t border-[#26272b] pt-3">
        <button
          type="button"
          @click="advancedOpen = !advancedOpen"
          class="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-200 uppercase tracking-widest transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-3 w-3 transition-transform"
            :class="{ 'rotate-90': advancedOpen }"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
          </svg>
          Avanzado
        </button>

        <div v-if="advancedOpen" class="mt-3">
          <label class="block text-xs text-gray-400 mb-1.5">Códec de video</label>
          <select
            v-model="codec"
            class="w-full bg-[#1E1F22] text-gray-200 text-sm rounded-lg px-3 py-2 border border-transparent focus:border-indigo-500 outline-none"
          >
            <option value="auto">Automático</option>
            <option value="vp9">VP9</option>
            <option value="h264">H264</option>
            <option v-if="av1Supported" value="av1">AV1</option>
          </select>
        </div>
      </div>
    </div>

    <footer class="bg-[#2B2D31] px-6 py-4 mt-2 flex justify-between items-center rounded-b-xl border-t border-[#1E1F22]">
      <button
        type="button"
        @click="close"
        class="text-gray-300 hover:text-white px-4 py-2 font-medium transition-colors"
      >
        Cancelar
      </button>
      <div class="flex flex-col items-end gap-1">
        <button
          type="button"
          @click="confirm"
          class="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2.5 rounded font-medium transition-colors"
        >
          Compartir pantalla
        </button>
        <p class="text-gray-500 text-[11px]">El audio del sistema se activa en el selector de Windows</p>
      </div>
    </footer>
  </BaseModal>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useScreenShareStore } from '../stores/screenShare';
import {
  SCREEN_SHARE_PRESETS,
  DEFAULT_SCREEN_SHARE_OPTIONS,
  type ScreenSharePresetId,
  type OptimizeFor,
  type ScreenCodec,
  type ScreenShareOptions,
} from '../lib/screenShare/presets';
import { detectAv1HardwareEncode } from '../lib/screenShare/codecs';
import BaseModal from './ui/BaseModal.vue';

// Dumb, prop-driven modal: it only assembles the chosen options and reports
// them up via `confirm`. It never calls a store action directly — the parent
// (VoicePanel.vue) owns starting the share.
const props = withDefaults(defineProps<{ show?: boolean }>(), { show: false });

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', options: ScreenShareOptions): void;
}>();

const screenShareStore = useScreenShareStore();

const presetId = ref<ScreenSharePresetId>(DEFAULT_SCREEN_SHARE_OPTIONS.presetId);
const optimizeFor = ref<OptimizeFor>(DEFAULT_SCREEN_SHARE_OPTIONS.optimizeFor);
const codec = ref<ScreenCodec>(DEFAULT_SCREEN_SHARE_OPTIONS.codec);
const advancedOpen = ref(false);
const av1Supported = ref(false);

const formatMbps = (kbps: number): string => {
  const mbps = kbps / 1000;
  return Number.isInteger(mbps) ? String(mbps) : mbps.toFixed(1);
};

// Reset fields from the last-used options every time the modal opens.
watch(
  () => props.show,
  (isShown) => {
    if (!isShown) return;
    const last = screenShareStore.lastOptions;
    presetId.value = last.presetId;
    optimizeFor.value = last.optimizeFor;
    codec.value = last.codec;
  }
);

onMounted(async () => {
  // 1080p60 preset numbers, per the hardware-probe contract.
  av1Supported.value = await detectAv1HardwareEncode(1920, 1080, 60, 6500);
});

const close = () => emit('close');

const confirm = () => {
  emit('confirm', {
    presetId: presetId.value,
    optimizeFor: optimizeFor.value,
    codec: codec.value,
  });
};
</script>
