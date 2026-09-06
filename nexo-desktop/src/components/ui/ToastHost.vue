<template>
  <Teleport to="body">
    <div
      class="fixed bottom-4 right-4 z-[110] flex flex-col gap-2 w-[340px] max-w-[90vw]"
      aria-live="polite"
      role="status"
    >
      <TransitionGroup name="toast-fade">
        <button
          v-for="t in toastState.toasts"
          :key="t.id"
          type="button"
          @click="dismissToast(t.id)"
          class="text-left px-4 py-3 rounded-lg shadow-2xl border text-[13px] font-medium text-gray-100 transition-colors"
          :class="toastClass(t.type)"
        >
          {{ t.message }}
        </button>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { dismissToast, toastState, type ToastType } from '../../composables/useToast';

const toastClass = (type: ToastType): string => {
  switch (type) {
    case 'success':
      return 'bg-[#1e2b21] border-emerald-500/40 hover:bg-[#223325]';
    case 'error':
      return 'bg-[#2b1e1e] border-red-500/40 hover:bg-[#332222]';
    default:
      return 'bg-[#1e1f23] border-white/[0.08] hover:bg-[#26272c]';
  }
};
</script>

<style scoped>
.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
