<template>
  <div v-if="screenShareStore.showQualityPicker" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
    <div class="bg-[#313338] rounded-xl shadow-2xl w-[460px] flex flex-col overflow-hidden animate-fade-in-up">
      <header class="p-6 pb-2">
        <h2 class="text-xl font-bold text-gray-100">Compartir pantalla</h2>
        <p class="text-gray-400 text-[13px] mt-1">Elegí la calidad antes de elegir qué compartir</p>
      </header>

      <div class="px-6 flex flex-col">
        <div class="mb-4">
          <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Calidad</label>
          <div class="flex flex-col gap-2">
            <label
              v-for="preset in QUALITY_PRESETS"
              :key="preset.id"
              class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
              :class="selected === preset.id ? 'bg-[#404249]' : 'bg-[#2B2D31] hover:bg-[#35373C]'"
            >
              <input type="radio" :value="preset.id" v-model="selected" class="accent-indigo-500" />
              <div>
                <p class="text-gray-200 font-medium text-sm">
                  {{ preset.label }}
                  <span v-if="preset.id === 'high'" class="text-amber-400 text-xs font-normal ml-1">puede afectar tu rendimiento si estás jugando</span>
                </p>
                <p class="text-gray-500 text-xs">{{ preset.width }}×{{ preset.height }} · {{ preset.frameRate }} fps · ~{{ preset.maxBitrateKbps }} kbps</p>
              </div>
            </label>
          </div>
        </div>
      </div>

      <footer class="bg-[#2B2D31] px-6 py-4 mt-2 flex justify-between items-center rounded-b-xl border-t border-[#1E1F22]">
        <button
          type="button"
          @click="cancel"
          class="text-gray-300 hover:text-white px-4 py-2 font-medium transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          @click="confirm"
          class="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2.5 rounded font-medium transition-colors"
        >
          Compartir pantalla
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useScreenShareStore, QUALITY_PRESETS } from '../stores/screenShare';

const screenShareStore = useScreenShareStore();
const selected = ref<'low' | 'medium' | 'high'>('medium');

const cancel = () => {
  screenShareStore.showQualityPicker = false;
};

const confirm = () => {
  const preset = QUALITY_PRESETS.find(p => p.id === selected.value)!;
  screenShareStore.showQualityPicker = false;
  screenShareStore.startSharing(preset);
};
</script>
