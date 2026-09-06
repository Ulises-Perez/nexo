<template>
  <BaseModal
    :show="!!current"
    width="420px"
    :close-on-backdrop="current?.kind !== 'alert'"
    backdrop-class="bg-black/70 z-[100]"
    @close="onCancel"
  >
    <template v-if="current" #header="{ titleId }">
      <div class="p-6 pb-2">
        <h2 :id="titleId" class="text-lg font-bold text-gray-100">
          {{ current.title ?? defaultTitle }}
        </h2>
      </div>
    </template>

    <div v-if="current" class="px-6 pb-2">
      <p class="text-[14px] text-gray-300 whitespace-pre-wrap break-words">{{ current.message }}</p>

      <input
        v-if="current.kind === 'prompt'"
        v-model="current.inputValue"
        type="text"
        autofocus
        :placeholder="current.placeholder"
        @keydown.enter="onConfirm"
        class="mt-3 w-full bg-[#1E1F22] text-gray-200 rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </div>

    <template v-if="current" #footer>
      <footer class="bg-[#2B2D31] px-6 py-4 mt-2 flex justify-end items-center gap-2 rounded-b-xl border-t border-[#1E1F22]">
        <button
          v-if="current.kind !== 'alert'"
          type="button"
          @click="onCancel"
          class="text-gray-300 hover:text-white px-4 py-2 font-medium transition-colors"
        >
          {{ current.cancelText }}
        </button>
        <button
          type="button"
          autofocus
          @click="onConfirm"
          class="px-5 py-2 rounded font-medium transition-colors"
          :class="
            current.danger
              ? 'bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500 hover:text-white'
              : 'bg-indigo-500 hover:bg-indigo-600 text-white'
          "
        >
          {{ current.confirmText }}
        </button>
      </footer>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import BaseModal from './BaseModal.vue';
import { cancelCurrentDialog, confirmCurrentDialog, currentDialog } from '../../composables/useDialog';

const current = computed(() => currentDialog.value);

const defaultTitle = 'Nexo';

const onConfirm = () => {
  if (!current.value) return;
  confirmCurrentDialog(current.value.kind === 'prompt' ? current.value.inputValue : undefined);
};

const onCancel = () => {
  cancelCurrentDialog();
};
</script>
