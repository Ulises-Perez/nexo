<template>
  <div v-if="show" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
    <div class="bg-[#313338] rounded-xl shadow-2xl w-[460px] flex flex-col overflow-hidden animate-fade-in-up">
      <header class="p-6 pb-2">
        <h2 class="text-xl font-bold text-gray-100">Crear canal</h2>
        <p v-if="categoryName" class="text-gray-400 text-[13px] mt-1">en {{ categoryName }}</p>
      </header>

      <form @submit.prevent="handleSubmit" class="px-6 flex flex-col">
        <!-- Tipo de canal -->
        <div class="mb-4">
          <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Tipo de canal</label>
          <div class="flex flex-col gap-2">
            <label
              class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
              :class="localType === 'text' ? 'bg-[#404249]' : 'bg-[#2B2D31] hover:bg-[#35373C]'"
            >
              <input type="radio" value="text" v-model="localType" class="accent-indigo-500" />
              <span class="text-gray-400 text-xl font-light">#</span>
              <div>
                <p class="text-gray-200 font-medium text-sm">Texto</p>
                <p class="text-gray-500 text-xs">Envía mensajes, imágenes y archivos</p>
              </div>
            </label>
            <label
              class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
              :class="localType === 'voice' ? 'bg-[#404249]' : 'bg-[#2B2D31] hover:bg-[#35373C]'"
            >
              <input type="radio" value="voice" v-model="localType" class="accent-indigo-500" />
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
              <div>
                <p class="text-gray-200 font-medium text-sm">Voz</p>
                <p class="text-gray-500 text-xs">Habla por voz con los miembros</p>
              </div>
            </label>
          </div>
        </div>

        <!-- Nombre -->
        <div class="mb-4">
          <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Nombre del canal <span class="text-red-500">*</span></label>
          <input
            type="text"
            v-model="localName"
            required
            maxlength="50"
            :placeholder="localType === 'voice' ? 'Sala General' : 'nuevo-canal'"
            class="w-full bg-[#1E1F22] text-gray-200 rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <!-- Categoría -->
        <div class="mb-6">
          <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Categoría</label>
          <select
            v-model="localCategoryId"
            class="w-full bg-[#1E1F22] text-gray-200 rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
          </select>
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
            :disabled="!localName.trim() || !localCategoryId || isLoading"
            class="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2.5 rounded font-medium transition-colors disabled:opacity-50"
          >
            {{ isLoading ? 'Creando...' : 'Crear canal' }}
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useCommunityStore } from '../stores/community';
import type { Category } from '../stores/community';

const props = defineProps<{
  show: boolean;
  communityId: string;
  categories: Category[];
  preselectedCategoryId?: string;
}>();

const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'created'): void;
}>();

const communityStore = useCommunityStore();

const localName = ref('');
const localType = ref<'text' | 'voice'>('text');
const localCategoryId = ref('');
const isLoading = ref(false);

const categoryName = computed(() =>
  props.categories.find(c => c.id === localCategoryId.value)?.name ?? ''
);

watch(() => props.show, (newVal) => {
  if (newVal) {
    localName.value = '';
    localType.value = 'text';
    localCategoryId.value = props.preselectedCategoryId || props.categories[0]?.id || '';
  }
});

const handleSubmit = async () => {
  if (!localName.value.trim() || !localCategoryId.value) return;

  isLoading.value = true;
  const success = await communityStore.createChannel(
    props.communityId,
    localCategoryId.value,
    localName.value,
    localType.value
  );
  isLoading.value = false;

  if (success) {
    emit('created');
  } else {
    alert('Hubo un error al crear el canal.');
  }
};
</script>
