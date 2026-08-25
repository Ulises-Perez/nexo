<template>
  <!-- Banner de actualización disponible, estilo "reload bar" anclado arriba. -->
  <div
    v-if="updaterStore.updateAvailable"
    class="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-4 bg-[#2B2D31] border-b border-white/[0.06] px-4 py-2.5 shadow-lg"
  >
    <span class="text-[13px] text-gray-200">
      Nueva versión disponible<span v-if="updaterStore.version">: v{{ updaterStore.version }}</span>
    </span>

    <span v-if="updaterStore.error" class="text-[12px] text-red-400">
      {{ updaterStore.error }}
    </span>

    <div v-if="updaterStore.isDownloading" class="flex items-center gap-2">
      <span class="text-[12px] text-gray-400">Descargando... {{ updaterStore.downloadProgress }}%</span>
      <div class="w-32 h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
        <div
          class="h-full bg-indigo-500 transition-all duration-200"
          :style="{ width: updaterStore.downloadProgress + '%' }"
        ></div>
      </div>
    </div>

    <button
      v-else
      type="button"
      @click="updaterStore.installUpdate()"
      class="bg-indigo-500 hover:bg-indigo-600 text-white text-[12px] font-semibold px-3.5 py-1.5 rounded-lg transition-colors"
    >
      Actualizar
    </button>

    <button
      type="button"
      @click="updaterStore.dismiss()"
      :disabled="updaterStore.isDownloading"
      class="text-gray-400 hover:text-white text-[15px] leading-none px-1 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      aria-label="Cerrar"
    >
      ×
    </button>
  </div>
</template>

<script setup lang="ts">
import { useUpdaterStore } from '../stores/updater';

const updaterStore = useUpdaterStore();
</script>
