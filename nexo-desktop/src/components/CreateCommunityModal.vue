<template>
  <!-- Create/Join Community Modal -->
  <div v-if="show" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
    <div class="bg-[#313338] rounded-xl shadow-2xl w-[440px] flex flex-col overflow-hidden animate-fade-in-up">
      <header class="p-6 text-center">
        <h2 class="text-2xl font-bold text-gray-100 mb-2">{{ mode === 'create' ? 'Crea tu servidor' : 'Unirse a un servidor' }}</h2>
        <p class="text-gray-300 text-[15px]">
          {{ mode === 'create'
            ? 'Tu servidor es donde te reúnes con tus amigos. Crea el tuyo y empieza a hablar.'
            : 'Pegá el código de invitación que te compartieron para entrar.' }}
        </p>
      </header>

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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useCommunityStore } from '../stores/community';

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
    alert('Hubo un error al crear la comunidad.');
  }
};

const handleJoinSubmit = () => {
  if (!joinCode.value.trim()) return;
  emit('join', joinCode.value.trim());
};
</script>
