<template>
  <BaseModal :show="show" width="440px" panel-class="bg-[#313338] rounded-xl flex flex-col" @close="$emit('cancel')">
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
        <h2 :id="titleId" class="text-xl font-bold text-gray-100">Crear categoría</h2>
        <p class="text-gray-400 text-[13px] mt-1">Las categorías agrupan tus canales</p>
      </header>
    </template>

    <form @submit.prevent="handleSubmit" class="px-6 flex flex-col">
      <div class="mb-6 mt-2">
        <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Nombre de la categoría <span class="text-red-500">*</span></label>
        <input
          type="text"
          v-model="localName"
          required
          maxlength="50"
          autofocus
          placeholder="Nueva Categoría"
          class="w-full bg-[#1E1F22] text-gray-200 rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <footer class="bg-[#2B2D31] -mx-6 px-6 py-4 mt-auto flex justify-between items-center rounded-b-xl border-t border-[#1E1F22]">
        <button
          type="button"
          @click="$emit('cancel')"
          class="text-gray-300 hover:text-white px-4 py-2 font-medium transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          :disabled="!localName.trim() || isLoading"
          class="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2.5 rounded font-medium transition-colors disabled:opacity-50"
        >
          {{ isLoading ? 'Creando...' : 'Crear categoría' }}
        </button>
      </footer>
    </form>
  </BaseModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useCommunityStore } from '../stores/community';
import BaseModal from './ui/BaseModal.vue';
import { toast } from '../composables/useToast';

const props = defineProps<{
  show: boolean;
  communityId: string;
}>();

const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'created'): void;
}>();

const communityStore = useCommunityStore();

const localName = ref('');
const isLoading = ref(false);

watch(() => props.show, (newVal) => {
  if (newVal) {
    localName.value = '';
  }
});

const handleSubmit = async () => {
  if (!localName.value.trim()) return;

  isLoading.value = true;
  const success = await communityStore.createCategory(props.communityId, localName.value);
  isLoading.value = false;

  if (success) {
    emit('created');
  } else {
    toast.error('Hubo un error al crear la categoría.');
  }
};
</script>
