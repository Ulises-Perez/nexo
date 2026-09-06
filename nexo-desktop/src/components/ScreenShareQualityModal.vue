<template>
  <BaseModal :show="screenShareStore.showQualityPicker" width="460px" panel-class="bg-[#313338] rounded-xl flex flex-col" @close="cancel">
    <template #header="{ titleId, close }">
      <header class="p-6 pb-2 relative">
        <button
          type="button"
          @click="close"
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
  </BaseModal>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useScreenShareStore, QUALITY_PRESETS } from '../stores/screenShare';
import BaseModal from './ui/BaseModal.vue';

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
