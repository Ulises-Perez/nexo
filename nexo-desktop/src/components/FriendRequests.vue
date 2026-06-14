<template>
  <div class="flex-1 flex flex-col bg-[#202124] text-gray-200 h-full">
    <!-- Header -->
    <header class="h-14 flex items-center px-4 border-b border-white/[0.06] shadow-sm z-10 py-1 shrink-0">
      <div class="flex items-center gap-2.5">
        <div class="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <span class="font-bold text-[14px] text-gray-100">Solicitudes</span>
      </div>
    </header>

    <!-- Content -->
    <main class="flex-1 overflow-y-auto z-0 flex custom-scrollbar">
      <div class="flex-1 flex flex-col pt-4 pr-1 pl-6">
        <!-- Empty state -->
        <div v-if="friendsStore.pendingRequests.length === 0" class="flex flex-col items-center justify-center flex-1 text-gray-400">
          <div class="w-16 h-16 mb-5 rounded-2xl bg-white/[0.04] flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p class="text-gray-500 text-[13px]">No tenés solicitudes pendientes.</p>
        </div>

        <!-- Incoming requests list -->
        <div v-else class="flex-1 flex flex-col">
          <h3 class="text-[11px] font-semibold text-gray-500 uppercase mb-3 tracking-[0.06em]">
            Solicitudes entrantes — {{ friendsStore.pendingRequests.length }}
          </h3>
          <div class="space-y-1.5">
            <div
              v-for="request in friendsStore.pendingRequests"
              :key="request.id"
              class="flex items-center justify-between py-3 px-3 bg-white/[0.03] rounded-xl hover:bg-white/[0.06] transition-all duration-200"
            >
              <div class="flex items-center gap-3">
                <UserAvatar
                  :username="request.sender.username"
                  :avatarUrl="request.sender.avatarUrl"
                  status="offline"
                  size="sm"
                />
                <div class="flex flex-col">
                  <span class="font-semibold text-[14px] text-gray-100">{{ request.sender.username }}</span>
                </div>
              </div>
              <div class="flex gap-2">
                <button
                  @click="acceptRequest(request.id)"
                  class="bg-emerald-500 hover:bg-emerald-400 text-white text-[12px] font-semibold px-3.5 py-1.5 rounded-lg transition-all duration-200 shadow-sm shadow-emerald-500/20"
                >
                  Aceptar
                </button>
                <button
                  @click="rejectRequest(request.id)"
                  class="bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 text-[12px] font-semibold px-3.5 py-1.5 rounded-lg transition-all duration-200"
                >
                  Rechazar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useFriendsStore } from '../stores/friends';
import { useAuthStore } from '../stores/auth';
import UserAvatar from './UserAvatar.vue';

const friendsStore = useFriendsStore();
const authStore = useAuthStore();

const acceptRequest = async (requestId: string) => {
  await friendsStore.acceptRequest(requestId);
};

const rejectRequest = async (requestId: string) => {
  await friendsStore.rejectRequest(requestId);
};

onMounted(async () => {
  // Cargar las solicitudes pendientes si todavía no se trajeron.
  if (!authStore.token) return;
  if (friendsStore.pendingRequests.length === 0) {
    await friendsStore.fetchPendingRequests();
  }
});
</script>
