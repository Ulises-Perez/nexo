<template>
  <div class="flex h-screen bg-gray-900 text-white font-sans overflow-hidden">
    <!-- 1. Leftmost Sidebar (Servers/Communities List) -->
    <nav class="w-[72px] h-full bg-[#141517] flex flex-col items-center py-3 gap-2 flex-shrink-0 z-20">
      <!-- Nexo Home Button -->
      <div 
        @click="goHome"
        class="nav-squircle w-12 h-12 bg-[#25262b] text-gray-400 flex items-center justify-center cursor-pointer transition-all duration-200 overflow-hidden"
        :class="{ '!bg-indigo-500 !text-white shadow-lg shadow-indigo-500/25': !communityStore.activeCommunityId && !chatStore.activeDMUser }"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
        </svg>
      </div>

      <div class="h-[2px] w-8 bg-white/[0.06] rounded-full mx-auto my-1"></div>

      <!-- Community Icons -->
      <div class="flex-1 overflow-y-auto w-full flex flex-col items-center gap-2 custom-scrollbar">
        <div 
          v-for="community in communityStore.communities" 
          :key="community.id"
          @click="selectCommunity(community.id)"
          class="relative group w-full flex justify-center py-0.5"
        >
          <!-- Active Indicator (Pill) -->
          <div class="absolute left-0 top-1/2 -translate-y-1/2 w-[4px] bg-white rounded-r-full transition-all duration-200"
               :class="communityStore.activeCommunityId === community.id ? 'h-10' : 'h-0 group-hover:h-5'">
          </div>

          <!-- Punto de no leídos (estilo Discord): visible solo si hay no leídos
               y la comunidad no es la activa, para no chocar con la píldora activa. -->
          <div
            v-if="communityStore.activeCommunityId !== community.id && communityStore.getCommunityUnread(community.id) > 0"
            class="absolute left-0 top-1/2 -translate-y-1/2 w-[8px] h-[8px] bg-white rounded-full shadow-lg"
          ></div>

          <!-- The Icon (Squircle) -->
          <div 
            class="nav-squircle w-12 h-12 bg-[#25262b] text-gray-400 flex items-center justify-center cursor-pointer transition-all duration-200 overflow-hidden font-bold text-lg"
            :class="communityStore.activeCommunityId === community.id ? '!bg-indigo-500 !text-white shadow-lg shadow-indigo-500/25' : 'hover:!bg-indigo-500/80 hover:!text-white'"
          >
            <img v-if="community.iconUrl" :src="community.iconUrl" alt="Server Icon" class="w-full h-full object-cover">
            <span v-else>{{ community.name.substring(0, 2).toUpperCase() }}</span>
          </div>
        </div>

        <!-- Create Community (+) Button -->
        <div 
          @click="showCreateModal = true"
          class="nav-squircle w-12 h-12 bg-[#25262b] text-emerald-500 flex items-center justify-center cursor-pointer transition-all duration-200 mt-2 flex-shrink-0 hover:!bg-emerald-500 hover:!text-white hover:shadow-lg hover:shadow-emerald-500/25"
          title="Añadir un servidor"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </div>
      </div>

      <div class="h-[2px] w-8 bg-white/[0.06] rounded-full mx-auto my-1"></div>

      <!-- User Profile Avatar (Bottom) -->
      <div class="relative flex-shrink-0">
        <div 
          @click="showUserPanel = !showUserPanel"
          class="nav-squircle w-12 h-12 cursor-pointer transition-all duration-200 overflow-hidden"
          :class="showUserPanel ? 'ring-2 ring-indigo-500/50 shadow-lg shadow-indigo-500/20' : 'hover:ring-2 hover:ring-white/10'"
        >
          <UserAvatar 
            :username="authStore.user?.username || ''" 
            :avatarUrl="authStore.user?.avatarUrl"
            :status="authStore.user?.status || 'offline'"
            size="lg"
            :showStatus="false"
          />
        </div>
        <!-- Online indicator dot -->
        <div 
          class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-[2.5px] border-[#141517]"
          :class="authStore.user?.status === 'online' ? 'bg-emerald-400' : 'bg-gray-500'"
        ></div>
      </div>
    </nav>

    <!-- 2. Secondary Sidebar (Channels List) -->
    <CommunitySidebar
      :communities="communityStore.communities"
      :activeCommunityId="communityStore.activeCommunityId"
      :activeChannelId="communityStore.activeChannelId"
      :activeDropdownId="activeDropdownId"
      :currentUserId="authStore.user?.id"
      @select-channel="selectChannel"
      @toggle-dropdown="toggleCommunityDropdown"
      @generate-invite="generateAndCopyInvite"
      @leave="handleLeaveCommunity"
      @open-settings="openCommunitySettings"
      @create-channel="openCreateChannel"
      @create-category="openCreateCategory"
    />

    <!-- Main Chat Area -->
    <div v-if="!communityStore.activeCommunityId && !chatStore.activeDMUser" class="flex-1 flex flex-col bg-[#202124] relative">
      <FriendRequests v-if="chatStore.homeView === 'requests'" />
      <HomeMain v-else />
    </div>

    <!-- Chat Area (DM or Channel) -->
    <ChatArea
      v-else
      :activeChannelId="chatStore.activeChannelId"
      :activeDMUser="chatStore.activeDMUser"
      :messages="chatStore.messages"
      :pendingAttachments="chatStore.pendingAttachments"
      @close-dm="chatStore.closeDM()"
      @send-message="handleSendMessage"
      @upload-file="chatStore.uploadFile"
      @remove-attachment="chatStore.removePendingAttachment"
      @clear-completed-attachments="chatStore.clearCompletedAttachments"
    />

    <!-- User Panel Modal -->
    <UserPanel 
      :show="showUserPanel"
      @close="showUserPanel = false"
    />

    <!-- Create Community Modal -->
    <CreateCommunityModal
      :show="showCreateModal"
      @cancel="showCreateModal = false"
      @created="handleCommunityCreated"
    />

    <!-- Create Channel Modal -->
    <CreateChannelModal
      :show="!!channelModalCommunityId"
      :communityId="channelModalCommunityId"
      :categories="channelModalCategories"
      :preselectedCategoryId="channelModalCategoryId"
      @cancel="channelModalCommunityId = ''"
      @created="channelModalCommunityId = ''"
    />

    <!-- Create Category Modal -->
    <CreateCategoryModal
      :show="!!categoryModalCommunityId"
      :communityId="categoryModalCommunityId"
      @cancel="categoryModalCommunityId = ''"
      @created="categoryModalCommunityId = ''"
    />

    <!-- Community Settings Modal -->
    <CommunitySettingsModal
      :show="!!settingsCommunityId"
      :community="settingsCommunity"
      @close="settingsCommunityId = ''"
    />

    <!-- User Profile Modal (global) -->
    <UserProfileModal />

    <!-- User Settings Modal (global — launched from the panel and self-profile) -->
    <UserSettingsModal :show="userSettingsStore.isOpen" @close="userSettingsStore.close()" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat';
import { useCommunityStore } from '../stores/community';
import { useVoiceStore } from '../stores/voice';
import type { Socket } from 'socket.io-client';
import HomeMain from '../components/HomeMain.vue';
import FriendRequests from '../components/FriendRequests.vue';
import UserAvatar from '../components/UserAvatar.vue';
import CommunitySidebar from '../components/CommunitySidebar.vue';
import ChatArea from '../components/ChatArea.vue';
import UserPanel from '../components/UserPanel.vue';
import CreateCommunityModal from '../components/CreateCommunityModal.vue';
import CreateChannelModal from '../components/CreateChannelModal.vue';
import CreateCategoryModal from '../components/CreateCategoryModal.vue';
import CommunitySettingsModal from '../components/CommunitySettingsModal.vue';
import UserProfileModal from '../components/UserProfileModal.vue';
import UserSettingsModal from '../components/UserSettingsModal.vue';
import { useUserSettingsStore } from '../stores/userSettings';

const authStore = useAuthStore();
const chatStore = useChatStore();
const communityStore = useCommunityStore();
const voiceStore = useVoiceStore();
const userSettingsStore = useUserSettingsStore();
const router = useRouter();

const showCreateModal = ref(false);
const activeDropdownId = ref<string | null>(null);
const showUserPanel = ref(false);

// Modales de gestión de comunidad
const channelModalCommunityId = ref('');
const channelModalCategoryId = ref('');
const categoryModalCommunityId = ref('');
const settingsCommunityId = ref('');

const channelModalCategories = computed(() => {
  const community = communityStore.communities.find(c => c.id === channelModalCommunityId.value);
  return community?.categories ?? [];
});

const settingsCommunity = computed(() =>
  communityStore.communities.find(c => c.id === settingsCommunityId.value) ?? null
);

const openCommunitySettings = (communityId: string) => {
  activeDropdownId.value = null;
  settingsCommunityId.value = communityId;
};

const openCreateChannel = (communityId: string, categoryId: string) => {
  activeDropdownId.value = null;
  channelModalCategoryId.value = categoryId;
  channelModalCommunityId.value = communityId;
};

const openCreateCategory = (communityId: string) => {
  activeDropdownId.value = null;
  categoryModalCommunityId.value = communityId;
};

// Sincronizar el estado de voz de los canales de la comunidad activa
const syncVoiceForCommunity = (communityId: string) => {
  const community = communityStore.communities.find(c => c.id === communityId);
  if (!community) return;
  const voiceChannelIds = community.categories.flatMap(cat =>
    cat.channels.filter(ch => ch.type === 'voice').map(ch => ch.id)
  );
  voiceStore.syncVoiceStates(voiceChannelIds);
};

watch(() => communityStore.communities, () => {
  if (communityStore.activeCommunityId) {
    syncVoiceForCommunity(communityStore.activeCommunityId);
    // Recargar miembros (cubre community_updated: nuevos roles, asignaciones, etc.)
    communityStore.loadActiveMembers(communityStore.activeCommunityId);
  }
});

const goHome = () => {
  chatStore.homeView = 'friends';
  chatStore.closeDM();
  communityStore.setActiveCommunity('');
  chatStore.leaveChannel();
  communityStore.setActiveChannel('');
};

const selectChannel = async (channelId: string) => {
  if (communityStore.activeChannelId === channelId) return;

  communityStore.setActiveChannel(channelId);
  // Join first so the active channel is set before fetch: on a cache hit the
  // stale-while-revalidate path can render the cached list immediately.
  chatStore.joinChannel(channelId);
  await chatStore.fetchMessages(channelId);
  // El desplazamiento al fondo al abrir un canal lo maneja ChatArea (observa
  // activeChannelId y la lista de mensajes), de forma fiable en cache-hit y miss.
};

const selectCommunity = async (communityId: string) => {
  if (communityStore.activeCommunityId === communityId) {
    if (chatStore.activeDMUser) {
      chatStore.closeDM();
    }
    return;
  }

  chatStore.closeDM();
  communityStore.setActiveCommunity(communityId);
  syncVoiceForCommunity(communityId);

  const community = communityStore.communities.find(c => c.id === communityId);
  let defaultChannelId = '';
  // Por defecto abrir el primer canal de texto
  if (community) {
    for (const category of community.categories) {
      const textChannel = category.channels.find(ch => ch.type !== 'voice');
      if (textChannel) {
        defaultChannelId = textChannel.id;
        break;
      }
    }
  }

  if (defaultChannelId) {
    await selectChannel(defaultChannelId);
  } else {
    chatStore.leaveChannel();
    communityStore.setActiveChannel('');
  }
};

const handleCommunityCreated = async (communityId: string) => {
  showCreateModal.value = false;
  // Unirse a la sala de la nueva comunidad para recibir eventos en tiempo real
  chatStore.socket?.emit('join_community_room', communityId);
  await selectCommunity(communityId);
};

const toggleCommunityDropdown = (id: string) => {
  if (activeDropdownId.value === id) {
    activeDropdownId.value = null;
  } else {
    activeDropdownId.value = id;
  }
};

const generateAndCopyInvite = async (communityId: string) => {
  activeDropdownId.value = null;
  const code = await communityStore.generateInviteCode(communityId);
  if (code) {
    const inviteLink = `${window.location.origin}/invite/${code}`;
    try {
      await navigator.clipboard.writeText(inviteLink);
      alert('¡Enlace de invitación copiado al portapapeles!\n\n' + inviteLink);
    } catch (err) {
      console.error('Error al copiar al portapapeles:', err);
      prompt('Presiona Ctrl+C para copiar tu enlace de invitación:', inviteLink);
    }
  } else {
    alert('Hubo un error al generar la invitación.');
  }
};

const handleLeaveCommunity = async (communityId: string, communityName: string) => {
  activeDropdownId.value = null;
  if (confirm(`¿Estás seguro de que deseas salir de la comunidad "${communityName}"? Perderás acceso a todos sus canales.`)) {
    const wasActive = communityStore.activeCommunityId === communityId;
    const success = await communityStore.leaveCommunity(communityId);
    if (success) {
      if (wasActive) {
        chatStore.leaveChannel();
        communityStore.setActiveChannel('');
      }
    } else {
      alert('Hubo un error al intentar salir de la comunidad.');
    }
  }
};

const handleSendMessage = (content: string, attachments: any[]) => {
  if (chatStore.activeChannelId || chatStore.activeDMUser) {
    chatStore.sendMessage(content, attachments);
    scrollToBottom();
  }
};

// Close dropdown and user panel on outside click
const closeDropdown = (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target.closest('header')) {
    activeDropdownId.value = null;
  }
  if (!target.closest('.user-floating-panel') && !target.closest('.nav-squircle')) {
    showUserPanel.value = false;
  }
};

// Auto-scroll
const scrollToBottom = () => {
  nextTick(() => {
    const container = document.getElementById('messages-container');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  });
};

onMounted(async () => {
  document.addEventListener('click', closeDropdown);

  chatStore.closeDM();
  communityStore.setActiveCommunity('');
  communityStore.setActiveChannel('');

  if (!authStore.user && authStore.token) {
    try {
      await authStore.fetchUser();
    } catch {
      router.push('/login');
      return;
    }
  }

  chatStore.connectSocket();
  if (chatStore.socket) {
    voiceStore.bindSocket(chatStore.socket as unknown as Socket);
  }
  await communityStore.fetchCommunities();
  await chatStore.fetchDMConversations();
});

onUnmounted(() => {
  voiceStore.unbindSocket();
  chatStore.disconnectSocket();
});
</script>
