<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 flex items-center justify-center"
      :class="backdropClass"
      @mousedown="onBackdropMouseDown"
    >
      <div
        ref="panelRef"
        class="overflow-hidden animate-fade-in-up shadow-2xl"
        :class="panelClass"
        :style="{ width }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        @mousedown.stop
      >
        <template v-if="$slots.header">
          <slot name="header" :titleId="titleId" :close="close" />
        </template>
        <template v-else-if="title">
          <div class="flex items-center justify-between gap-4 p-6 pb-2">
            <h2 :id="titleId" class="text-xl font-bold text-gray-100">{{ title }}</h2>
            <button
              type="button"
              @click="close"
              aria-label="Cerrar"
              class="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full bg-black/20 hover:bg-black/40 text-gray-300 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
        </template>

        <slot />

        <slot name="footer" />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, useId, watch } from 'vue';
import { isTopModal, popModal, pushModal } from '../../composables/modalStack';

const props = withDefaults(
  defineProps<{
    show: boolean;
    title?: string;
    width?: string;
    closeOnBackdrop?: boolean;
    // Escape hatches for modals whose panel/backdrop don't match the default
    // dark-panel look (e.g. UserProfileModal's own colors/z-index, or the
    // two-column settings modals that need `flex` instead of block stacking).
    panelClass?: string;
    backdropClass?: string;
  }>(),
  {
    title: undefined,
    width: '440px',
    closeOnBackdrop: true,
    panelClass: 'bg-[#313338] rounded-xl',
    backdropClass: 'bg-black/70 z-50',
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const titleId = `base-modal-title-${useId()}`;
const panelRef = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

// Several BaseModal instances can be open at once (e.g. a confirm dialog on
// top of a settings modal). Escape must only close the topmost one.
const token = Symbol('base-modal');

const close = () => emit('close');

const onBackdropMouseDown = (e: MouseEvent) => {
  if (props.closeOnBackdrop && e.target === e.currentTarget) {
    close();
  }
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusPanel = () => {
  const panel = panelRef.value;
  if (!panel) return;
  const target =
    panel.querySelector<HTMLElement>('[autofocus]') ?? panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
  target?.focus();
};

const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return;
  // Ignore Escape on an underlying modal while another one is stacked on top
  // of it (e.g. a confirm dialog opened from within a settings modal).
  if (!isTopModal(token)) return;
  e.stopPropagation();
  close();
};

watch(
  () => props.show,
  (isShown) => {
    if (isShown) {
      previouslyFocused = document.activeElement as HTMLElement | null;
      pushModal(token);
      document.addEventListener('keydown', onKeydown);
      requestAnimationFrame(focusPanel);
    } else {
      document.removeEventListener('keydown', onKeydown);
      popModal(token);
      previouslyFocused?.focus();
      previouslyFocused = null;
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  popModal(token);
});
</script>
