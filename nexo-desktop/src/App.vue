<template>
  <UpdateBanner />
  <router-view></router-view>
</template>

<script setup lang="ts">
// Raíz limpia de la app. Router view maneja el layout.
import { onMounted } from 'vue';
import UpdateBanner from './components/UpdateBanner.vue';
import { useUpdaterStore } from './stores/updater';

onMounted(() => {
  // Chequeo de actualizaciones solo al arrancar, sin re-chequeo periódico.
  useUpdaterStore().checkForUpdate();
});
</script>