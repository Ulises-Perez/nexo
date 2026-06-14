<template>
  <header
    @click="toggleDropdown"
    class="relative h-12 flex items-center justify-between px-4 border-b border-white/[0.04] shadow-sm font-bold text-[14px] text-gray-200 hover:bg-white/[0.04] cursor-pointer transition-all duration-200"
  >
    <span class="truncate">{{ community.name }}</span>
    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform duration-200 text-gray-400" :class="{ 'rotate-180': isDropdownOpen }" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>

    <!-- Dropdown Menu -->
    <div
      v-if="isDropdownOpen"
      class="absolute top-[110%] left-2 right-2 bg-[#1a1b1e] rounded-xl shadow-2xl z-50 p-2 overflow-hidden border border-white/[0.06]"
      @click.stop
    >
      <div class="flex flex-col gap-0.5 text-sm font-medium">

        <!-- Invite -->
        <button
          v-if="canInvite"
          @click.stop="$emit('generate-invite')"
          class="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-indigo-500 hover:text-white text-indigo-400 transition-all duration-200"
        >
          <span>Invitar gente</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        </button>

        <div v-if="canInvite" class="h-[1px] bg-white/[0.06] my-1"></div>

        <!-- Crear canal / categoría -->
        <button
          v-if="canManageChannels"
          @click.stop="emitAndClose('create-channel')"
          class="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#4752C4] hover:text-white text-gray-300 transition-colors"
        >
          <span>Crear canal</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          v-if="canManageChannels"
          @click.stop="emitAndClose('create-category')"
          class="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#4752C4] hover:text-white text-gray-300 transition-colors"
        >
          <span>Crear categoría</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </button>

        <!-- Ajustes de Comunidad -->
        <button
          @click.stop="emitAndClose('open-settings')"
          class="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#4752C4] hover:text-white text-gray-300 transition-colors"
        >
          <span>Ajustes del servidor</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <!-- Salir (Only if not owner) -->
        <button
          v-if="community.ownerId !== currentUserId"
          @click.stop="$emit('leave', community.id, community.name)"
          class="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#DA373C] hover:text-white text-[#DA373C] transition-colors"
        >
          <span>Abandonar servidor</span>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>

      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useCommunityStore, Permissions } from '../stores/community';

interface Community {
  id: string;
  name: string;
  ownerId: string;
}

const props = defineProps<{
  community: Community;
  currentUserId?: string;
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle'): void;
  (e: 'generate-invite'): void;
  (e: 'leave', id: string, name: string): void;
  (e: 'open-settings'): void;
  (e: 'create-channel'): void;
  (e: 'create-category'): void;
}>();

const communityStore = useCommunityStore();

const canInvite = computed(() => communityStore.can(Permissions.CREATE_INVITES, props.community.id));
const canManageChannels = computed(() => communityStore.can(Permissions.MANAGE_CHANNELS, props.community.id));

const isDropdownOpen = ref(props.isOpen);

const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value;
  emit('toggle');
};

const emitAndClose = (event: 'open-settings' | 'create-channel' | 'create-category') => {
  isDropdownOpen.value = false;
  if (event === 'open-settings') emit('open-settings');
  else if (event === 'create-channel') emit('create-channel');
  else emit('create-category');
};
</script>
