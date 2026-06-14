<template>
  <!-- User Panel Modal -->
  <Transition name="backdrop-fade">
    <div 
      v-if="show"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click="$emit('close')"
    >
      <Transition name="panel-scale">
        <div 
          v-if="show"
          class="user-floating-panel relative w-[340px] bg-[#1e1f23] rounded-[24px] border border-white/[0.06] shadow-2xl shadow-black/80 overflow-hidden"
          @click.stop
        >
          <!-- Banner -->
          <div class="h-24 relative" :style="{ background: bannerStyle }">
            <div class="absolute inset-0 bg-gradient-to-t from-[#1e1f23] to-transparent"></div>
          </div>

          <!-- Close Button -->
          <button 
            @click="$emit('close')"
            class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors z-10"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </button>

          <!-- Avatar + Info -->
          <div class="px-6 -mt-12 relative flex flex-col items-center">
            <div class="relative mb-4">
              <UserAvatar 
                :username="authStore.user?.username || ''" 
                :avatarUrl="authStore.user?.avatarUrl"
                :status="authStore.user?.status || 'offline'"
                size="xl"
                :showStatus="true"
              />
            </div>
            <div class="text-center w-full pb-2">
              <h4 class="text-xl font-bold truncate" :style="nameStyle">{{ authStore.user?.username || 'Cargando...' }}</h4>
            </div>
          </div>

          <!-- Divider -->
          <div class="h-px bg-white/[0.06] mx-5 mt-2 mb-3"></div>

          <!-- Actions -->
          <div class="px-4 pb-5 flex flex-col gap-1.5">
            <button
              @click="openSettings"
              class="flex items-center gap-3 px-4 py-2.5 rounded-xl text-gray-300 hover:bg-indigo-500/10 hover:text-indigo-400 transition-all duration-200 text-[14px] font-semibold w-full text-left font-sans"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Mi perfil
            </button>
            <button
              @click="openSettings"
              class="flex items-center gap-3 px-4 py-2.5 rounded-xl text-gray-300 hover:bg-indigo-500/10 hover:text-indigo-400 transition-all duration-200 text-[14px] font-semibold w-full text-left font-sans">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Ajustes
            </button>

            <div class="h-px bg-white/[0.04] mx-2 my-1"></div>

            <button 
              @click="handleLogout"
              class="flex items-center gap-3 px-4 py-2.5 rounded-xl text-red-400/90 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 text-[14px] font-semibold w-full text-left font-sans"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Cerrar sesión
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat';
import { useCommunityStore } from '../stores/community';
import { useVoiceStore } from '../stores/voice';
import { useUserSettingsStore } from '../stores/userSettings';
import { useUserBanner } from '../composables/useUserBanner';
import { useReadableAccent } from '../composables/useReadableAccent';
import { useRouter } from 'vue-router';
import UserAvatar from './UserAvatar.vue';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

defineProps<{
  show: boolean;
}>();

const authStore = useAuthStore();
const chatStore = useChatStore();
const communityStore = useCommunityStore();
const voiceStore = useVoiceStore();
const userSettingsStore = useUserSettingsStore();
const router = useRouter();

// Banner del propio usuario vía composable compartido (imagen > color > degradado).
const { bannerStyle } = useUserBanner(() => ({
  bannerUrl: authStore.user?.bannerUrl,
  bannerColor: authStore.user?.bannerColor,
  username: authStore.user?.username,
}));

// Acento legible en el nombre: cae a blanco si el contraste es bajo.
const { nameStyle } = useReadableAccent(() => authStore.user?.accentColor);

// The settings modal is mounted globally (Dashboard); opening it also closes
// this panel so they don't stack.
const openSettings = () => {
  userSettingsStore.open();
  emit('close');
};

const handleLogout = () => {
  voiceStore.leaveVoice();
  chatStore.closeDM();
  chatStore.disconnectSocket();
  communityStore.setActiveCommunity('');
  communityStore.setActiveChannel('');
  authStore.removeToken();
  router.push('/login');
};
</script>
