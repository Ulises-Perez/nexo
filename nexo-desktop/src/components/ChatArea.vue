<template>
  <div class="flex-1 flex flex-col bg-[#0e0e10] relative">
    <!-- Channel Header -->
    <header class="channel-header h-[52px] flex items-center px-5 border-b border-white/[0.06] z-10">
      <h3 v-if="activeChannelId" class="font-semibold text-[15px] text-gray-200 flex items-center gap-2">
        <span class="text-gray-500 text-lg font-normal">#</span>
        {{ channelName }}
      </h3>
      <h3 v-else-if="activeDMUser" class="font-semibold text-[15px] text-gray-200 flex items-center gap-3">
        <UserAvatar 
          :username="activeDMUser.username" 
          :avatarUrl="activeDMUser.avatarUrl"
          :status="activeDMUser.status"
          size="md"
        />
        <div class="flex flex-col">
          <span>{{ activeDMUser.username }}</span>
          <span class="text-[11px] text-gray-500 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full" :class="activeDMUser.status === 'online' ? 'bg-emerald-400' : 'bg-gray-500'"></span>
            {{ activeDMUser.status === 'online' ? 'En línea' : 'Desconectado' }}
          </span>
        </div>
      </h3>
      <h3 v-else class="font-medium text-[14px] text-gray-600 flex items-center gap-2">
        Selecciona un canal
      </h3>
      
      <!-- Header actions -->
      <div class="ml-auto flex items-center gap-1">
        <button class="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-all duration-200">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>
        <button
          v-if="!activeDMUser && communityStore.activeCommunityId"
          @click="showMemberList = !showMemberList"
          class="p-2 rounded-lg transition-all duration-200"
          :class="showMemberList ? 'text-gray-200 bg-white/[0.06]' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]'"
          title="Lista de miembros"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </button>
        <button
          v-if="activeDMUser"
          @click="showDMCard = !showDMCard"
          class="p-2 rounded-lg transition-all duration-200"
          :class="showDMCard ? 'text-gray-200 bg-white/[0.06]' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]'"
          title="Información del usuario"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </button>
        <button class="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/[0.06] transition-all duration-200">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
        <button 
          v-if="activeDMUser" 
          @click="$emit('close-dm')"
          class="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </header>

    <!-- Cuerpo: mensajes + lista de miembros -->
    <div class="flex-1 flex overflow-hidden">
    <div class="flex-1 flex flex-col min-w-0">
    <!-- Messages Timeline -->
    <main
      ref="messagesContainer"
      class="flex-1 overflow-y-auto channel-messages"
      id="messages-container"
      @scroll="handleScroll"
    >

      <!-- Spinner de carga de mensajes más antiguos (scroll hacia arriba) -->
      <div v-if="isLoadingOlder" class="flex items-center justify-center py-3">
        <div class="w-5 h-5 border-2 border-white/10 border-t-indigo-400 rounded-full animate-spin"></div>
        <span class="ml-2 text-[12px] text-gray-500">Cargando...</span>
      </div>

      <!-- Empty state: no channel selected -->
      <div v-if="!activeChannelId && !activeDMUser" class="flex flex-col items-center justify-center h-full">
        <div class="w-20 h-20 mb-5 rounded-3xl bg-white/[0.03] flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
          </svg>
        </div>
        <p class="text-[14px] text-gray-600 font-medium">Selecciona un canal para empezar a chatear</p>
      </div>

      <!-- Empty state: no messages -->
      <div v-else-if="messages.length === 0" class="flex flex-col items-center justify-center h-full">
        <div class="w-20 h-20 mb-5 rounded-3xl bg-white/[0.03] flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p v-if="activeDMUser" class="text-[14px] text-gray-500 font-medium">Envía un mensaje para iniciar la conversación</p>
        <p v-else class="text-[14px] text-gray-600 font-medium">Sé el primero en enviar un mensaje en este canal</p>
      </div>

      <!-- Message list -->
      <MessageList v-else :messages="messages" />
    </main>

    <!-- Indicador de "escribiendo..." -->
    <div class="h-5 px-5 flex items-center">
      <p v-if="typingText" class="text-[12px] text-gray-400 italic flex items-center gap-1.5">
        <span class="flex gap-0.5">
          <span class="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
          <span class="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
          <span class="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
        </span>
        {{ typingText }}
      </p>
    </div>

    <!-- Message input -->
    <MessageInput
      :isInputEnabled="!!activeChannelId || !!activeDMUser"
      :placeholder="inputPlaceholder"
      :pendingAttachments="pendingAttachments"
      @send="handleSend"
      @upload="handleUpload"
      @remove-attachment="handleRemoveAttachment"
      @clear-completed="handleClearCompleted"
      @typing="chatStore.emitTyping()"
    />
    </div>

    <!-- Lista de miembros (sidebar derecha) -->
    <MemberList
      v-if="showMemberList && !activeDMUser && communityStore.activeCommunityId"
      :communityId="communityStore.activeCommunityId"
    />

    <!-- Tarjeta de información del usuario en DM (sidebar derecha) -->
    <DMUserCard
      v-if="activeDMUser && showDMCard"
      :user="activeDMUser"
    />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import MessageList from './MessageList.vue';
import MessageInput from './MessageInput.vue';
import UserAvatar from './UserAvatar.vue';
import MemberList from './MemberList.vue';
import DMUserCard from './DMUserCard.vue';
import { useChatStore } from '../stores/chat';
import type { DMFriend } from '../stores/chat';
import { useCommunityStore } from '../stores/community';

interface PendingAttachment {
  id: string;
  file: File;
  type: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  objectKey?: string;
  cdnUrl?: string;
}

const props = defineProps<{
  activeChannelId: string | null;
  activeDMUser: DMFriend | null;
  messages: any[];
  pendingAttachments: PendingAttachment[];
}>();

const emit = defineEmits<{
  (e: 'close-dm'): void;
  (e: 'send-message', content: string, attachments: any[]): void;
  (e: 'upload-file', file: File): Promise<void>;
  (e: 'remove-attachment', id: string): void;
  (e: 'clear-completed-attachments'): void;
}>();

const chatStore = useChatStore();
const communityStore = useCommunityStore();

// Lista de miembros: visible por defecto, ocultable. La preferencia se recuerda.
const showMemberList = ref(localStorage.getItem('nexo_show_members') !== 'false');
watch(showMemberList, (val) => {
  localStorage.setItem('nexo_show_members', String(val));
});

// Tarjeta de info del usuario en DM: visible por defecto.
const showDMCard = ref(true);

// ===================== Scroll de la timeline de mensajes =====================
const messagesContainer = ref<HTMLElement | null>(null);
const isLoadingOlder = ref(false);
// ¿El usuario estaba cerca del fondo? Se actualiza en cada scroll y decide si
// un mensaje nuevo entrante debe auto-desplazar o respetar la lectura de historial.
const wasAtBottom = ref(true);

const SCROLL_TOP_THRESHOLD = 80;    // px desde arriba para cargar más antiguos
const NEAR_BOTTOM_THRESHOLD = 120;  // px desde el fondo para considerarse "abajo"

const scrollToBottom = () => {
  const el = messagesContainer.value;
  if (el) el.scrollTop = el.scrollHeight;
};

// Identificador del canal/DM activo (los DMs también tienen activeChannelId).
const activeId = computed(() => chatStore.activeChannelId);

// Abrir un canal/DM siempre arranca abajo (más reciente). Cubre la ruta de
// cache-hit (instantánea) y la de cache-miss (tras resolver el fetch), porque
// el watcher de la lista de mensajes corre en ambos casos.
watch(activeId, async () => {
  isLoadingOlder.value = false;
  wasAtBottom.value = true;
  await nextTick();
  scrollToBottom();
});

// Cuando la lista de mensajes del canal activo se vuelve no vacía (p. ej. tras
// el fetch en cache-miss), asegurar que arranque abajo.
watch(
  () => props.messages.length,
  async (len, prevLen) => {
    if (len === 0) return;
    // Solo auto-scroll cuando recién aparecen mensajes (apertura/fetch inicial).
    // Los mensajes entrantes vía socket se manejan aparte para respetar la lectura.
    if (prevLen === 0) {
      await nextTick();
      scrollToBottom();
    }
  }
);

const handleScroll = async () => {
  const el = messagesContainer.value;
  if (!el) return;

  // Recordar si el usuario está cerca del fondo (para mensajes entrantes).
  wasAtBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_THRESHOLD;

  // Carga perezosa de mensajes más antiguos al llegar arriba.
  if (
    el.scrollTop <= SCROLL_TOP_THRESHOLD &&
    !isLoadingOlder.value &&
    chatStore.getHasMoreOlder(activeId.value)
  ) {
    isLoadingOlder.value = true;
    const prevHeight = el.scrollHeight;
    // Canal al que pertenece esta carga: si el usuario cambia de canal mientras
    // está en vuelo, no aplicamos la restauración de scroll al canal nuevo.
    const loadingChannelId = activeId.value;
    try {
      const prepended = await chatStore.loadOlderMessages(loadingChannelId);
      if (prepended > 0 && activeId.value === loadingChannelId) {
        await nextTick();
        // Anclar el viewport al mismo mensaje: el alto creció por el prepend.
        el.scrollTop = el.scrollHeight - prevHeight;
      }
    } finally {
      isLoadingOlder.value = false;
    }
  }
};

// Mensaje nuevo entrante en el canal activo: solo auto-desplazar si el usuario
// ya estaba cerca del fondo; si está leyendo historial, no moverlo.
watch(
  () => chatStore.messages[chatStore.messages.length - 1]?.id,
  async (lastId, prevLastId) => {
    if (!lastId || lastId === prevLastId) return;
    if (!wasAtBottom.value) return;
    await nextTick();
    scrollToBottom();
  }
);

const typingText = computed(() => {
  const names = Array.from(chatStore.typingUsers.values());
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} está escribiendo...`;
  if (names.length === 2) return `${names[0]} y ${names[1]} están escribiendo...`;
  return 'Varias personas están escribiendo...';
});

const channelName = computed(() => {
  if (!props.activeChannelId) return '';
  const community = communityStore.communities.find(c => c.id === communityStore.activeCommunityId);
  if (!community) return '';
  for (const category of community.categories) {
    const channel = category.channels.find(ch => ch.id === props.activeChannelId);
    if (channel) return channel.name;
  }
  return 'general';
});

const inputPlaceholder = computed(() => {
  if (props.activeDMUser) {
    return `Mensaje a @${props.activeDMUser.username}`;
  }
  if (props.activeChannelId) {
    return `Enviar un mensaje en #${channelName.value}`;
  }
  return 'Selecciona un canal';
});

const handleSend = (content: string, attachments: any[]) => {
  emit('send-message', content, attachments);
};

const handleUpload = async (file: File) => {
  await emit('upload-file', file);
};

const handleRemoveAttachment = (id: string) => {
  emit('remove-attachment', id);
};

const handleClearCompleted = () => {
  emit('clear-completed-attachments');
};
</script>
