<template>
  <div class="flex-1 flex flex-col bg-[#1a1b1e] text-gray-300 w-full h-full">
    <!-- Search Bar -->
    <div class="h-14 flex items-center justify-center px-3 py-2.5 border-b border-white/5">
      <button class="w-full bg-[#25262b] text-gray-500 text-sm py-2 px-3 rounded-xl hover:bg-[#2c2d32] text-left transition-all duration-200 flex items-center gap-2 group">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-500 group-hover:text-gray-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span class="text-[13px]">Buscar conversación…</span>
      </button>
    </div>

    <!-- Main Navigation Options -->
    <div class="p-2 space-y-[2px]">
      <button @click="goToFriends" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-200 bg-white/[0.06] hover:bg-white/[0.1] transition-all duration-200 group">
        <div class="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4.5 w-4.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </div>
        <span class="font-medium text-[14px]">Amigos</span>
      </button>

      <button @click="goToPending" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:bg-white/[0.06] hover:text-gray-200 transition-all duration-200 group">
        <div class="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4.5 w-4.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <div class="flex-1 flex justify-between items-center text-[14px]">
          <span class="font-medium">Solicitudes</span>
          <span v-if="pendingCount > 0" class="bg-indigo-500 text-white text-[11px] font-bold min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center shadow-lg shadow-indigo-500/30">{{ pendingCount }}</span>
        </div>
      </button>
    </div>

    <!-- DM Section Header -->
    <div class="px-4 py-2.5 mt-3 flex items-center justify-between group cursor-pointer">
      <span class="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.08em]">Mensajes Directos</span>
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-600 opacity-0 group-hover:opacity-100 hover:text-gray-400 transition-all duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
    </div>

    <!-- Direct Messages List -->
    <div class="flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar">
      <div v-if="chatStore.conversations.length === 0" class="px-3 py-8 text-center text-gray-600 text-sm">
        <div class="w-12 h-12 mx-auto mb-3 rounded-2xl bg-white/[0.04] flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p class="text-gray-500 text-[13px]">Añade amigos para empezar a chatear</p>
      </div>

      <div
        v-for="conv in chatStore.conversations"
        :key="conv.channelId"
        @click="openDM(conv.friend)"
        class="dm-item flex items-center gap-3 px-2.5 py-2.5 rounded-xl cursor-pointer group transition-all duration-200"
        :class="chatStore.activeDMUser?.id === conv.friend.id ? 'bg-white/[0.08] shadow-sm' : 'hover:bg-white/[0.04]'"
      >
        <div class="relative">
          <UserAvatar
            :username="conv.friend.username"
            :avatarUrl="conv.friend.avatarUrl"
            :status="conv.friend.status"
            size="sm"
          />
          <!-- Unread badge -->
          <div
            v-if="chatStore.getUnreadCount(conv.friend.id) > 0"
            class="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-indigo-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-lg"
          >
            {{ chatStore.getUnreadCount(conv.friend.id) > 99 ? '99+' : chatStore.getUnreadCount(conv.friend.id) }}
          </div>
        </div>

        <!-- Contenido -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between mb-0.5">
            <span
              class="text-[14px] font-medium truncate transition-colors"
              :class="chatStore.activeDMUser?.id === conv.friend.id ? 'text-white' : 'text-gray-300 group-hover:text-gray-100'"
            >
              {{ conv.friend.username }}
            </span>
          </div>
          <p class="text-[12px] truncate" :class="chatStore.getUnreadCount(conv.friend.id) > 0 ? 'text-gray-300 font-medium' : 'text-gray-500'">
            <span v-if="chatStore.getUnreadCount(conv.friend.id) > 0">{{ conv.friend.username }}: </span><span v-else-if="chatStore.getLastMessage(conv.friend.id)?.isMine">Tú: </span>{{ chatStore.getLastMessage(conv.friend.id)?.content || 'Sin mensajes' }}
          </p>
        </div>

        <!-- Close button -->
        <button
          @click.stop="chatStore.hideConversation(conv.channelId)"
          class="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/[0.1] text-gray-500 hover:text-gray-300 transition-all duration-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useFriendsStore } from '../stores/friends';
import { useChatStore } from '../stores/chat';
import { useAuthStore } from '../stores/auth';
import UserAvatar from './UserAvatar.vue';

const authStore = useAuthStore();

const friendsStore = useFriendsStore();
const chatStore = useChatStore();

const pendingCount = computed(() => friendsStore.pendingRequests.length);

const openDM = (friend: any) => {
    chatStore.openDM(friend);
};

const goToFriends = () => {
    chatStore.closeDMAndGoToFriends();
};

const goToPending = () => {
    chatStore.goToRequests();
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

<style scoped>
.dm-item {
  position: relative;
}

.dm-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 0;
  background: linear-gradient(180deg, #667eea, #764ba2);
  border-radius: 0 4px 4px 0;
  transition: height 0.2s ease;
}

.dm-item.bg-white\/\[0\.08\]::before {
  height: 60%;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
