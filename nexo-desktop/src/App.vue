<template>
  <UpdateBanner />
  <router-view></router-view>
  <!-- Mounted outside RouterView so dialogs/toasts are available on every
       screen, Login included, and stores can trigger them without a route. -->
  <DialogHost />
  <ToastHost />
</template>

<script setup lang="ts">
// Raíz limpia de la app. Router view maneja el layout.
import { onMounted } from 'vue';
import UpdateBanner from './components/UpdateBanner.vue';
import DialogHost from './components/ui/DialogHost.vue';
import ToastHost from './components/ui/ToastHost.vue';
import { useUpdaterStore } from './stores/updater';

onMounted(() => {
  // Chequeo de actualizaciones solo al arrancar, sin re-chequeo periódico.
  useUpdaterStore().checkForUpdate();
});
</script>