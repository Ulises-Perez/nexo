<template>
  <div class="h-screen w-full bg-gray-900 flex items-center justify-center p-4 font-sans">
    <div class="max-w-md w-full bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700 p-8 flex flex-col items-center">
      
      <!-- Loading State -->
      <div v-if="isLoading" class="flex flex-col items-center">
        <svg class="animate-spin h-10 w-10 text-indigo-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <h2 class="text-xl font-bold text-white">Buscando invitación...</h2>
      </div>

      <!-- Preview State -->
      <div v-else-if="inviteInfo && !isJoining" class="flex flex-col items-center w-full">
        <!-- Icono/Logo de la comunidad (Dummy or real) -->
        <div class="w-20 h-20 rounded-2xl bg-indigo-600 flex items-center justify-center mb-6 shadow-lg">
          <span class="text-3xl font-bold text-white">{{ inviteInfo.name.charAt(0).toUpperCase() }}</span>
        </div>
        
        <p class="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-1">Te invitaron a unirte a</p>
        <h2 class="text-2xl font-bold text-white text-center mb-2">{{ inviteInfo.name }}</h2>
        
        <div class="flex items-center gap-2 text-gray-400 mb-8">
          <div class="w-2 h-2 rounded-full bg-green-500"></div>
          <span class="text-sm font-medium">{{ inviteInfo._count.members }} Miembro{{ inviteInfo._count.members !== 1 ? 's' : '' }}</span>
        </div>

        <button 
          @click="joinCommunity"
          class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
        >
          Unirse a {{ inviteInfo.name }}
        </button>
        <button 
          @click="goToDashboard"
          class="w-full text-gray-400 hover:text-white font-medium py-2 rounded transition-colors text-sm"
        >
          No, gracias
        </button>
      </div>

      <!-- Joining State -->
      <div v-else-if="isJoining" class="flex flex-col items-center">
        <svg class="animate-spin h-10 w-10 text-indigo-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <h2 class="text-xl font-bold text-white">Uniéndose...</h2>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="flex flex-col items-center w-full">
        <div class="w-16 h-16 bg-red-900/50 rounded-full flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 class="text-xl font-bold text-white text-center mb-2">¡Ups! Invitación inválida</h2>
        <p class="text-gray-400 text-center mb-6">{{ error }}</p>
        
        <button 
          @click="goToDashboard"
          class="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
        >
          Volver a mis comunidades
        </button>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useCommunityStore } from '../stores/community';
import api from '../api/axios';

interface InviteInfo {
    id: string;
    name: string;
    iconUrl: string | null;
    _count: {
        members: number;
    }
}

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const communityStore = useCommunityStore();

const inviteCode = route.params.code as string;
const isLoading = ref(true);
const isJoining = ref(false);
const error = ref('');
const inviteInfo = ref<InviteInfo | null>(null);

const goToDashboard = () => {
    router.push('/dashboard');
};

const fetchInviteInfo = async () => {
  try {
    const response = await api.get(`/invites/${inviteCode}`);

    if (response.status === 200) {
        inviteInfo.value = response.data;
    } else {
        error.value = response.data?.error || 'Esta invitación es inválida o expiró.';
    }
  } catch (err: any) {
      console.error(err);
      error.value = err.response?.data?.error || 'Error de conexión con el servidor.';
  } finally {
      isLoading.value = false;
  }
};

const joinCommunity = async () => {
  if (!authStore.token) {
    router.push('/login');
    return;
  }

  isJoining.value = true;
  
  try {
    const response = await api.post(`/invites/${inviteCode}/join`);

    if (response.status === 200) {
        if (response.data.communityId) {
            communityStore.setActiveCommunity(response.data.communityId);
        }
        router.push('/dashboard');
    } else {
        error.value = response.data?.error || 'No pudimos unirte a la comunidad.';
        isJoining.value = false;
    }
  } catch (err: any) {
      console.error(err);
      error.value = err.response?.data?.error || 'Error de conexión con el servidor. Intenta nuevamente.';
      isJoining.value = false;
  }
};

onMounted(() => {
  if (!inviteCode) {
    error.value = 'No se proporcionó ningún código de invitación.';
    isLoading.value = false;
    return;
  }

  fetchInviteInfo();
});
</script>
