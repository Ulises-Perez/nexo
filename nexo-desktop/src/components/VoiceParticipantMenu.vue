<template>
  <Teleport to="body">
    <div
      ref="rootRef"
      class="fixed w-56 bg-[#1a1b1e] rounded-xl shadow-2xl z-50 p-2 border border-white/[0.06]"
      :style="menuStyle"
    >
      <!-- Encabezado: avatar + username -->
      <div class="flex items-center gap-2 px-2 py-1.5 mb-1">
        <UserAvatar
          :username="participant.username"
          :avatarUrl="participant.avatarUrl"
          size="xs"
          :showStatus="false"
        />
        <span class="text-sm font-medium text-gray-200 truncate">{{ participant.username }}</span>
      </div>

      <!-- Volumen individual -->
      <div class="px-2 py-1.5">
        <div class="flex items-center justify-between text-xs text-gray-400 mb-1.5">
          <span>Volumen</span>
          <span class="text-gray-300 font-medium">{{ volume }}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="volume"
          @input="emit('update:volume', Number(($event.target as HTMLInputElement).value))"
          class="w-full h-1.5 accent-indigo-500 cursor-pointer"
        >
      </div>

      <!-- Silenciar localmente -->
      <button
        @click="emit('toggle-mute')"
        class="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#4752C4] hover:text-white text-gray-300 transition-colors text-sm"
      >
        <span>{{ isLocallyMuted ? 'Dejar de silenciar' : 'Silenciar para mí' }}</span>
      </button>

      <div class="h-[1px] bg-white/[0.06] my-1"></div>

      <!-- Ver perfil -->
      <button
        @click="emit('view-profile')"
        class="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#4752C4] hover:text-white text-gray-300 transition-colors text-sm"
      >
        <span>Ver perfil</span>
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { VoiceParticipant } from '../stores/voice';
import UserAvatar from './UserAvatar.vue';

const props = defineProps<{
  participant: VoiceParticipant;
  volume: number;
  isLocallyMuted: boolean;
  anchor: { top: number; left: number };
  // Elemento que disparó la apertura (la fila del participante). Se excluye
  // del cierre por "click afuera" para que el propio trigger pueda decidir
  // si togglea (abrir/cerrar) en vez de que el listener global lo cierre
  // primero y el click del trigger lo vuelva a abrir en el mismo gesto.
  triggerEl?: HTMLElement | null;
}>();

const emit = defineEmits<{
  (e: 'update:volume', volume: number): void;
  (e: 'toggle-mute'): void;
  (e: 'view-profile'): void;
  (e: 'close'): void;
}>();

const rootRef = ref<HTMLElement | null>(null);

// Altura estimada del menú: no hace falta medir el DOM real con precisión,
// solo evitar que se corte contra el borde inferior del viewport.
const MENU_HEIGHT_ESTIMATE = 180;
const MENU_WIDTH = 224; // w-56
const MARGIN = 8;

const menuStyle = computed(() => {
  let top = props.anchor.top;
  let left = props.anchor.left;

  if (top + MENU_HEIGHT_ESTIMATE > window.innerHeight) {
    top -= (top + MENU_HEIGHT_ESTIMATE - window.innerHeight) + MARGIN;
  }
  if (top < MARGIN) top = MARGIN;

  if (left + MENU_WIDTH > window.innerWidth) {
    left = window.innerWidth - MENU_WIDTH - MARGIN;
  }
  if (left < MARGIN) left = MARGIN;

  return { top: `${top}px`, left: `${left}px` };
});

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as Node;
  if (rootRef.value?.contains(target)) return;
  if (props.triggerEl?.contains(target)) return;
  emit('close');
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') emit('close');
};

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
  document.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside);
  document.removeEventListener('keydown', handleKeydown);
});
</script>
