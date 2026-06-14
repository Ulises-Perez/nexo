<template>
  <div v-if="show && channel" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
    <div class="bg-[#313338] rounded-xl shadow-2xl w-[720px] h-[440px] flex overflow-hidden animate-fade-in-up">

      <!-- Tab nav -->
      <nav class="w-[200px] bg-[#2B2D31] p-4 flex flex-col gap-1 flex-shrink-0">
        <p class="text-[11px] font-bold text-gray-500 uppercase tracking-widest px-2 mb-1 truncate flex items-center gap-1.5">
          <svg v-if="channel.type === 'voice'" xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
          <span v-else class="text-sm font-normal leading-none">#</span>
          <span class="truncate">{{ channel.name }}</span>
        </p>
        <button class="text-left px-3 py-2 rounded-lg text-sm font-medium bg-[#404249] text-white">
          General
        </button>
      </nav>

      <!-- Content -->
      <div class="flex-1 flex flex-col overflow-hidden relative">
        <button
          @click="$emit('close')"
          class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-black/20 hover:bg-black/40 text-gray-300 transition-colors z-10"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>

        <div class="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <h2 class="text-lg font-bold text-gray-100 mb-1">Información general</h2>
          <p class="text-xs text-gray-500 mb-5">{{ channel.type === 'voice' ? 'Canal de voz' : 'Canal de texto' }}</p>

          <div class="mb-6 max-w-md">
            <label class="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Nombre del canal</label>
            <input
              type="text"
              v-model="localName"
              maxlength="50"
              class="w-full bg-[#1E1F22] text-gray-200 rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p v-if="channel.type !== 'voice'" class="text-[11px] text-gray-500 mt-1">Los canales de texto usan minúsculas y guiones</p>
          </div>

          <button
            @click="handleSave"
            :disabled="!localName.trim() || isSaving"
            class="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2 rounded font-medium transition-colors disabled:opacity-50"
          >
            {{ isSaving ? 'Guardando...' : 'Guardar cambios' }}
          </button>

          <!-- Zona de peligro -->
          <div class="mt-10 border border-red-500/30 rounded-lg p-4 max-w-md">
            <h3 class="text-sm font-bold text-red-400 mb-1">Zona de peligro</h3>
            <p class="text-xs text-gray-500 mb-3">Eliminar el canal borra todos sus mensajes. Esta acción no se puede deshacer.</p>
            <button
              @click="handleDelete"
              :disabled="isDeleting"
              class="bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500 hover:text-white px-4 py-2 rounded font-medium text-sm transition-colors disabled:opacity-50"
            >
              {{ isDeleting ? 'Eliminando...' : 'Eliminar canal' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useCommunityStore } from '../stores/community';
import type { Channel } from '../stores/community';

const props = defineProps<{
  show: boolean;
  channel: Channel | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const communityStore = useCommunityStore();

const localName = ref('');
const isSaving = ref(false);
const isDeleting = ref(false);

watch(() => props.show, (newVal) => {
  if (newVal && props.channel) {
    localName.value = props.channel.name;
  }
});

const handleSave = async () => {
  if (!props.channel || !localName.value.trim()) return;
  isSaving.value = true;
  const success = await communityStore.renameChannel(props.channel.id, localName.value);
  isSaving.value = false;
  if (success) {
    emit('close');
  } else {
    alert('Hubo un error al guardar el canal.');
  }
};

const handleDelete = async () => {
  if (!props.channel) return;
  if (!confirm(`¿Eliminar el canal "${props.channel.name}" definitivamente?`)) return;
  isDeleting.value = true;
  const success = await communityStore.deleteChannel(props.channel.id);
  isDeleting.value = false;
  if (success) {
    emit('close');
  } else {
    alert('Hubo un error al eliminar el canal.');
  }
};
</script>
