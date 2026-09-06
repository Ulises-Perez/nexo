<template>
  <!-- Create/Join Community Modal -->
  <BaseModal :show="show" width="440px" panel-class="bg-[#313338] rounded-xl flex flex-col" @close="$emit('cancel')">
    <template #header="{ titleId, close }">
      <header class="p-6 text-center relative">
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
        <h2 :id="titleId" class="text-2xl font-bold text-gray-100 mb-2">{{ mode === 'create' ? 'Crea tu servidor' : 'Unirse a un servidor' }}</h2>
        <p class="text-gray-300 text-[15px]">
          {{ mode === 'create'
            ? 'Tu servidor es donde te reúnes con tus amigos. Crea el tuyo y empieza a hablar.'
            : 'Pegá el código de invitación que te compartieron para entrar.' }}
        </p>
      </header>
    </template>

      <div class="px-6 flex gap-2 mb-2">
        <button
          type="button"
          @click="mode = 'create'"
          class="flex-1 py-2 rounded text-sm font-medium transition-colors"
          :class="mode === 'create' ? 'bg-indigo-500 text-white' : 'bg-[#1E1F22] text-gray-400 hover:text-white'"
        >
          Crear
        </button>
        <button
          type="button"
          @click="mode = 'join'"
          class="flex-1 py-2 rounded text-sm font-medium transition-colors"
          :class="mode === 'join' ? 'bg-indigo-500 text-white' : 'bg-[#1E1F22] text-gray-400 hover:text-white'"
        >
          Unirse
        </button>
      </div>

      <form v-if="mode === 'create'" @submit.prevent="handleSubmit" class="px-6 flex flex-col">
        <div class="mb-4">
          <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Icono del Servidor (URL)</label>
          <input
            type="text"
            v-model="localIcon"
            placeholder="https://ejemplo.com/icono.png"
            class="w-full bg-[#1E1F22] text-gray-200 rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div class="mb-6">
          <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Nombre del Servidor <span class="text-red-500">*</span></label>
          <input
            type="text"
            v-model="localName"
            required
            placeholder="El servidor de Juan"
            class="w-full bg-[#1E1F22] text-gray-200 rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <footer class="bg-[#2B2D31] -mx-6 px-6 py-4 mt-auto flex justify-between items-center rounded-b-xl border-t border-[#1E1F22] shadow-[0_-1px_0_rgba(0,0,0,0.2)]">
          <button
            type="button"
            @click="$emit('cancel')"
            class="text-gray-300 hover:text-white px-4 py-2 font-medium transition-colors"
          >
            Atrás
          </button>
          <button
            type="submit"
            :disabled="!localName.trim() || isLoading"
            class="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2.5 rounded font-medium transition-colors disabled:opacity-50"
          >
            {{ isLoading ? 'Creando...' : 'Crear' }}
          </button>
        </footer>
      </form>

      <form v-else @submit.prevent="handleJoinSubmit" class="px-6 flex flex-col">
        <div class="mb-6">
          <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Código de invitación <span class="text-red-500">*</span></label>
          <input
            type="text"
            v-model="joinCode"
            required
            placeholder="Ej: 6JVGTO"
            class="w-full bg-[#1E1F22] text-gray-200 rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 uppercase"
          />
        </div>

        <footer class="bg-[#2B2D31] -mx-6 px-6 py-4 mt-auto flex justify-between items-center rounded-b-xl border-t border-[#1E1F22] shadow-[0_-1px_0_rgba(0,0,0,0.2)]">
          <button
            type="button"
            @click="$emit('cancel')"
            class="text-gray-300 hover:text-white px-4 py-2 font-medium transition-colors"
          >
            Atrás
          </button>
          <button
            type="submit"
            :disabled="!joinCode.trim()"
            class="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2.5 rounded font-medium transition-colors disabled:opacity-50"
          >
            Unirse
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
}>();

const emit = defineEmits<{
  (e: 'cancel'): void;
  (e: 'created', communityId: string): void;
  (e: 'join', code: string): void;
}>();

const communityStore = useCommunityStore();

const mode = ref<'create' | 'join'>('create');
const localName = ref('');
const localIcon = ref('');
const joinCode = ref('');
const isLoading = ref(false);

watch(() => props.show, (newVal) => {
  if (newVal) {
    mode.value = 'create';
    localName.value = '';
    localIcon.value = '';
    joinCode.value = '';
  }
});

const handleSubmit = async () => {
  if (!localName.value.trim()) return;

  isLoading.value = true;
  const newId = await communityStore.createCommunity(localName.value, localIcon.value);
  isLoading.value = false;

  if (newId) {
    emit('created', newId);
  } else {
    toast.error('Hubo un error al crear la comunidad.');
  }
};

const handleJoinSubmit = () => {
  if (!joinCode.value.trim()) return;
  emit('join', joinCode.value.trim());
};
</script>
