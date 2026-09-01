<template>
  <div class="py-4">
    <template v-for="(msg, index) in messages" :key="msg.id">
      <!-- Date separator -->
      <div
        v-if="index === 0 || !isSameDay(msg.createdAt, messages[index - 1].createdAt)"
        class="date-separator flex items-center gap-3 px-4 my-4"
      >
        <div class="flex-1 h-px bg-white/[0.06]"></div>
        <span class="text-[11px] font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
          {{ formatDateSeparator(msg.createdAt) }}
        </span>
        <div class="flex-1 h-px bg-white/[0.06]"></div>
      </div>

      <!-- Message row -->
      <div
        class="channel-msg group relative flex px-4 py-0.5 transition-colors duration-100 hover:bg-white/[0.02]"
        :data-msg-id="msg.id"
        :class="[
          index > 0 && messages[index - 1].userId === msg.userId && isSameDay(msg.createdAt, messages[index - 1].createdAt) && !isTimeDiffLarge(msg.createdAt, messages[index - 1].createdAt)
            ? ''
            : 'mt-3',
          msg.failed ? 'opacity-60' : ''
        ]"
      >
        <!-- Hover timestamp (compact, single line) -->
        <div
          v-if="index > 0 && messages[index - 1].userId === msg.userId && isSameDay(msg.createdAt, messages[index - 1].createdAt) && !isTimeDiffLarge(msg.createdAt, messages[index - 1].createdAt)"
          class="w-[40px] flex-shrink-0 flex items-start justify-center pt-0.5"
        >
          <span class="text-[10px] text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity duration-150 select-none leading-none">
            {{ new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
          </span>
        </div>

        <!-- Avatar (first in group) -->
        <div
          v-else
          class="w-[40px] flex-shrink-0 pt-0.5 cursor-pointer"
          @click="openProfile(msg)"
        >
          <UserAvatar
            :username="msg.user?.username || '?'"
            :avatarUrl="msg.user?.avatarUrl"
            :status="msg.user?.status || 'offline'"
            size="md"
            :showStatus="false"
          />
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0 ml-3">
          <!-- Username + timestamp (inline single line) -->
          <div
            v-if="index === 0 || messages[index - 1].userId !== msg.userId || !isSameDay(msg.createdAt, messages[index - 1].createdAt) || isTimeDiffLarge(msg.createdAt, messages[index - 1].createdAt)"
            class="inline-flex items-baseline gap-2 mb-0.5 leading-none"
          >
            <span
              class="text-[14px] font-semibold cursor-pointer hover:underline"
              :style="{ color: usernameColor(msg) }"
              @click="openProfile(msg)"
            >
              {{ msg.user?.username || 'Usuario' }}
            </span>
            <span class="text-[11px] text-gray-600 font-normal select-none">
              {{ formatTimestamp(msg.createdAt) }}
            </span>
          </div>

          <!-- Edición inline -->
          <div v-if="editingId === msg.id" class="my-1">
            <input
              :id="`edit-input-${msg.id}`"
              type="text"
              v-model="editingContent"
              @keydown.enter.prevent="confirmEdit(msg)"
              @keydown.esc="cancelEdit"
              class="w-full bg-[#1a1b1e] text-white text-[14px] rounded-lg px-3 py-2 focus:outline-none border border-white/[0.08] focus:border-indigo-500/50"
            />
            <p class="text-[11px] text-gray-500 mt-1">
              Enter para <span class="text-indigo-400">guardar</span> · Esc para <span class="text-indigo-400">cancelar</span>
            </p>
          </div>

          <!-- Message content (text + media) -->
          <template v-else>
            <MessageContent
              :content="msg.content"
              :attachments="msg.attachments"
            />
            <span v-if="msg.isEdited" class="text-[10px] text-gray-600 select-none ml-1">(editado)</span>
            <p v-if="msg.failed" class="text-[11px] text-red-400 mt-0.5">No se pudo enviar este mensaje</p>
          </template>
        </div>

        <!-- Acciones de mensaje (hover) -->
        <div
          v-if="editingId !== msg.id && (canEdit(msg) || canDelete(msg))"
          class="absolute -top-3 right-4 hidden group-hover:flex items-center bg-[#1a1b1e] border border-white/[0.08] rounded-lg shadow-lg overflow-hidden"
        >
          <button
            v-if="canEdit(msg)"
            @click="startEdit(msg)"
            class="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] transition-colors"
            title="Editar mensaje"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            v-if="canDelete(msg)"
            @click="handleDelete(msg)"
            class="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Eliminar mensaje"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import UserAvatar from './UserAvatar.vue';
import MessageContent from './MessageContent.vue';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat';
import { useCommunityStore, Permissions } from '../stores/community';
import { useUserProfileStore } from '../stores/userProfile';
import { decodeHtmlEntities } from '../composables/decodeHtmlEntities';
import type { MessageAttachment } from '../stores/chat';

interface MessageUser {
  id: string;
  username: string;
  avatarUrl?: string;
  status?: string;
  roleColor?: string | null;
}

interface Message {
  id: string;
  content: string;
  userId: string;
  createdAt: string;
  isEdited?: boolean;
  user?: MessageUser;
  attachments?: MessageAttachment[];
  pending?: boolean;
  failed?: boolean;
}

defineProps<{
  messages: Message[];
}>();

const authStore = useAuthStore();
const chatStore = useChatStore();
const communityStore = useCommunityStore();
const profileStore = useUserProfileStore();

const editingId = ref<string | null>(null);
const editingContent = ref('');

// Abrir el perfil del autor del mensaje (con contexto de comunidad si no es un DM)
const openProfile = (msg: Message) => {
  const communityId = chatStore.activeDMUser ? undefined : communityStore.activeCommunityId || undefined;
  profileStore.open(msg.userId, communityId);
};

// En comunidades, con MANAGE_MESSAGES se pueden borrar mensajes ajenos
const canModerate = computed(() => {
  if (!communityStore.activeCommunityId) return false;
  return communityStore.can(Permissions.MANAGE_MESSAGES);
});

// Un mensaje pending/failed todavía no existe en el backend con un id real:
// editar/borrar sobre un id temporal no haría nada.
const canEdit = (msg: Message) => !msg.pending && !msg.failed && msg.userId === authStore.user?.id;
const canDelete = (msg: Message) => !msg.pending && !msg.failed && (msg.userId === authStore.user?.id || canModerate.value);

const startEdit = (msg: Message) => {
  editingId.value = msg.id;
  editingContent.value = decodeHtmlEntities(msg.content);
  nextTick(() => {
    document.getElementById(`edit-input-${msg.id}`)?.focus();
  });
};

const cancelEdit = () => {
  editingId.value = null;
  editingContent.value = '';
};

const confirmEdit = (msg: Message) => {
  const content = editingContent.value.trim();
  if (content && content !== decodeHtmlEntities(msg.content)) {
    chatStore.editMessage(msg.id, content);
  }
  cancelEdit();
};

const handleDelete = (msg: Message) => {
  if (!confirm('¿Eliminar este mensaje?')) return;
  chatStore.deleteMessage(msg.id);
};

const isSameDay = (date1: string, date2: string): boolean => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return d1.getFullYear() === d2.getFullYear()
    && d1.getMonth() === d2.getMonth()
    && d1.getDate() === d2.getDate();
};

const isTimeDiffLarge = (date1: string, date2: string): boolean => {
  const diff = Math.abs(new Date(date1).getTime() - new Date(date2).getTime());
  return diff > 5 * 60 * 1000; // 5 minutos
};

const formatDateSeparator = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(dateStr, now.toISOString())) return 'Hoy';
  if (isSameDay(dateStr, yesterday.toISOString())) return 'Ayer';

  return date.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};

const formatTimestamp = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isSameDay(dateStr, now.toISOString())) return `Hoy a las ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(dateStr, yesterday.toISOString())) return `Ayer a las ${time}`;

  return `${date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${time}`;
};

const getUsernameColor = (username: string): string => {
  const colors = [
    '#e74c8b', '#e8a52e', '#43b581', '#5865f2', '#ed4245',
    '#f47b67', '#9b59b6', '#1abc9c', '#e67e22', '#3498db',
    '#2ecc71', '#e91e63', '#ff7043', '#ab47bc', '#26c6da',
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

// En una comunidad el nombre toma el color del rol más alto del autor.
// 1) color reactivo del store (se actualiza al instante al cambiar roles)
// 2) color enviado por el backend en el propio mensaje (siempre presente)
// 3) color determinista por nombre (DMs o usuarios sin rol con color)
const usernameColor = (msg: Message): string => {
  if (communityStore.activeCommunityId) {
    const liveColor = communityStore.getMemberRoleColor(msg.userId);
    if (liveColor) return liveColor;
  }
  if (msg.user?.roleColor) return msg.user.roleColor;
  return getUsernameColor(msg.user?.username || '?');
};
</script>
