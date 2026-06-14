<template>
  <div class="flex-1 flex flex-col bg-[#202124] text-gray-200 h-full">
    <!-- Superior Header -->
    <header class="h-14 flex items-center px-4 border-b border-white/[0.06] shadow-sm z-10 py-1 shrink-0">
      <div class="flex items-center gap-2.5 pr-4 border-r border-white/[0.08]">
        <div class="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <span class="font-bold text-[14px] text-gray-100">Amigos</span>
      </div>

      <!-- Navigation Tabs -->
      <nav class="flex items-center gap-1.5 px-4 h-full">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          @click="activeTab = tab.id"
          class="px-3 py-1.5 rounded-lg font-medium text-[13px] transition-all duration-200"
          :class="[
            activeTab === tab.id 
              ? 'bg-white/[0.08] text-gray-100 shadow-sm' 
              : 'text-gray-500 hover:bg-white/[0.04] hover:text-gray-300',
            tab.id === 'add' 
              ? (activeTab === 'add' 
                ? '!text-emerald-400 !bg-emerald-500/10' 
                : '!bg-emerald-500 !text-white hover:!bg-emerald-400 shadow-lg shadow-emerald-500/20') 
              : ''
          ]"
        >
          {{ tab.label }}
        </button>
      </nav>
    </header>

    <!-- Main Content Area -->
    <main class="flex-1 overflow-y-auto z-0 flex custom-scrollbar">

      <!-- Central View -->
      <div class="flex-1 flex flex-col pt-4 pr-1 pl-6">
        <!-- Search bar -->
        <div v-if="activeTab !== 'add'" class="w-full flex">
            <div class="relative w-full mb-4">
                <input
                    type="text"
                    placeholder="Buscar amigos…"
                    class="w-full bg-[#2a2b30] border border-transparent focus:border-white/[0.06] text-white rounded-xl py-2.5 pl-10 pr-4 outline-none text-[13px] transition-all duration-200 placeholder-gray-600"
                />
                <div class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
                    </svg>
                </div>
            </div>
        </div>

        <h2 v-if="activeTab === 'online' || activeTab === 'all'" class="text-[11px] font-semibold text-gray-500 uppercase mb-4 tracking-[0.08em] mt-2">
          {{ filteredFriends.title }} — {{ filteredFriends.count }}
        </h2>

        <!-- Friends List -->
        <div v-if="activeTab === 'online' || activeTab === 'all'" class="flex-1 flex flex-col border-t border-white/[0.04]">
          <div v-if="filteredFriends.list.length === 0" class="flex flex-col items-center justify-center flex-1 text-gray-400">
            <div class="w-16 h-16 mb-5 rounded-2xl bg-white/[0.04] flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p class="text-gray-500 text-[13px]">No hay nada que mostrar por aquí.</p>
          </div>
          <div v-else>
             <div
                v-for="(friend, index) in filteredFriends.list"
                :key="index"
                @click="openDM(friend)"
                class="flex items-center justify-between py-3 border-t border-white/[0.03] group hover:bg-white/[0.04] hover:rounded-xl px-3 -mx-1 cursor-pointer transition-all duration-200"
                :class="{'border-t-0': index === 0}"
              >
               <div class="flex items-center gap-3">
                  <UserAvatar 
                     :username="friend.username" 
                     :avatarUrl="friend.avatarUrl"
                     :status="friend.status"
                     size="sm"
                  />
                 <div class="flex flex-col">
                   <span class="font-semibold text-[14px] text-gray-100">{{ friend.username }}</span>
                   <span class="text-[12px] text-gray-500">{{ friend.status === 'online' ? 'En línea' : 'Desconectado' }}</span>
                 </div>
               </div>

               <!-- Action buttons -->
               <div class="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
                  <div class="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center hover:text-white hover:bg-white/[0.1] text-gray-500 cursor-pointer transition-all duration-200">
                     <svg xmlns="http://www.w3.org/2000/svg" class="h-4.5 w-4.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd" />
                     </svg>
                  </div>
               </div>
             </div>
          </div>
        </div>

        <!-- Add Friend View -->
        <div v-if="activeTab === 'add'" class="flex-1 flex flex-col mt-2">
           <h2 class="text-[16px] font-semibold text-white mb-2">Añadir amigo</h2>
           <p class="text-[13px] text-gray-500 mb-4">Puedes añadir amigos usando su nombre de usuario.</p>

           <div class="relative flex items-center bg-[#2a2b30] rounded-xl border border-white/[0.04] focus-within:border-indigo-500/50 overflow-hidden pr-2 transition-all duration-300">
              <input
                 type="text"
                 v-model="searchQuery"
                 @input="onSearchInput"
                 placeholder="Nombre de usuario de Nexo…"
                 class="w-full bg-transparent border-none text-[14px] text-gray-200 py-3.5 pl-4 focus:ring-0 outline-none placeholder-gray-600"
              />
           </div>

           <!-- Search Results -->
           <div v-if="searchQuery.trim()" class="mt-3">
               <div v-if="friendsStore.isSearching" class="text-gray-500 text-[13px] py-2 flex items-center gap-2">
                 <div class="w-4 h-4 border-2 border-gray-600 border-t-indigo-400 rounded-full animate-spin"></div>
                 Buscando…
               </div>
               <div v-else-if="friendsStore.searchResults.length === 0" class="text-gray-500 text-[13px] py-2">No se encontraron usuarios.</div>
               <div v-else class="space-y-1.5">
                   <div
                       v-for="user in friendsStore.searchResults"
                       :key="user.id"
                       class="flex items-center justify-between py-2.5 px-3 bg-white/[0.03] rounded-xl hover:bg-white/[0.06] transition-all duration-200"
                   >
<div class="flex items-center gap-3">
                             <UserAvatar 
                                 :username="user.username" 
                                 :avatarUrl="user.avatarUrl"
                                 status="offline"
                                 size="sm"
                             />
                            <div class="flex flex-col">
                                <span class="font-semibold text-[14px] text-gray-100">{{ user.username }}</span>
                            </div>
                        </div>
                        <div v-if="isFriend(user.id)" class="text-[12px] font-semibold px-3.5 py-1.5 text-green-400">
                            Amigos
                        </div>
                        <div v-else-if="hasPendingRequest(user.id)" class="text-[12px] font-semibold px-3.5 py-1.5 text-gray-400">
                            Pendiente
                        </div>
                        <button
                            v-else
                            @click="sendRequest(user.id)"
                            class="bg-indigo-500 hover:bg-indigo-400 text-white text-[12px] font-semibold px-3.5 py-1.5 rounded-lg transition-all duration-200 shadow-sm shadow-indigo-500/20"
                        >
                            Enviar solicitud
                        </button>
                   </div>
               </div>
           </div>

           <!-- Success/Error Messages -->
           <div class="mt-4">
               <div v-if="requestSent" class="text-emerald-400 font-medium text-[13px] flex items-center gap-2">
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                     <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                   </svg>
                   ¡Solicitud enviada exitosamente!
               </div>
               <div v-if="requestError" class="text-red-400 font-medium text-[13px]">
                   {{ requestError }}
               </div>
           </div>
        </div>
      </div>

      <!-- Activity Sidebar (Right) -->
      <div v-if="activeTab === 'online' || activeTab === 'all'" class="w-[340px] border-l border-white/[0.04] p-5 h-full hidden lg:block overflow-y-auto">
         <h3 class="text-[15px] font-bold mb-4 text-white">Activo ahora</h3>
         <div class="text-center mt-12">
             <div class="w-14 h-14 mx-auto mb-4 rounded-2xl bg-white/[0.04] flex items-center justify-center">
               <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
               </svg>
             </div>
             <h4 class="font-semibold text-[14px] text-gray-300 mb-1.5">Por ahora, todo tranquilo</h4>
             <p class="text-[12px] text-gray-600 leading-relaxed max-w-[220px] mx-auto">Cuando tus amigos estén activos, verás su actividad aquí.</p>
         </div>
      </div>

    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useFriendsStore } from '../stores/friends';
import { useChatStore } from '../stores/chat';
import { useAuthStore } from '../stores/auth';
import UserAvatar from './UserAvatar.vue';

const friendsStore = useFriendsStore();
const chatStore = useChatStore();
const authStore = useAuthStore();

const tabs = [
  { id: 'online', label: 'Conectados' },
  { id: 'all', label: 'Todos' },
  { id: 'add', label: 'Añadir amigo' },
];

const activeTab = ref('all');
const searchQuery = ref('');
const requestSent = ref(false);
const requestError = ref('');

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

// Watch for shouldShowFriends to change tab when closing DM from sidebar
watch(() => chatStore.shouldShowFriends, (shouldShow) => {
    if (shouldShow) {
        activeTab.value = 'all';
        chatStore.shouldShowFriends = false;
    }
});

const filteredFriends = computed(() => {
   if (activeTab.value === 'online') {
       const list = friendsStore.friends.filter(f => f.status === 'online');
       return { title: 'Online', count: list.length, list };
   }
   if (activeTab.value === 'all') {
       return { title: 'Todos los amigos', count: friendsStore.friends.length, list: friendsStore.friends };
   }
   return { title: '', count: 0, list: [] };
});

const onSearchInput = () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        friendsStore.searchUsers(searchQuery.value);
    }, 300);
};

const sendRequest = async (userId: string) => {
    requestError.value = '';
    const result = await friendsStore.sendFriendRequest(userId);
    if (result.success) {
        requestSent.value = true;
        searchQuery.value = '';
        friendsStore.clearSearch();
        setTimeout(() => {
            requestSent.value = false;
        }, 4000);
    } else {
        requestError.value = result.error || 'Error al enviar solicitud';
    }
};

const isFriend = (userId: string): boolean => {
    return friendsStore.friends.some(f => f.id === userId);
};

const hasPendingRequest = (userId: string): boolean => {
    return friendsStore.pendingRequests.some(
        r => r.senderId === userId || r.receiverId === userId
    );
};

const openDM = (friend: any) => {
    chatStore.openDM(friend);
};

onMounted(async () => {
    // Don't fetch if user is not authenticated (e.g., during logout)
    if (!authStore.token) return;

    await Promise.all([
        friendsStore.fetchFriends(),
        friendsStore.fetchPendingRequests(),
    ]);
});
</script>
