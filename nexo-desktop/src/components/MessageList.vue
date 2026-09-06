<template>
  <div class="py-4">
    <template v-for="row in visibleRows" :key="row.key">
      <!-- Date separator -->
      <div
        v-if="row.showDateSeparator"
        class="date-separator flex items-center gap-3 px-4 my-4"
      >
        <div class="flex-1 h-px bg-white/[0.06]"></div>
        <span class="text-[11px] font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
          {{ row.dateLabel }}
        </span>
        <div class="flex-1 h-px bg-white/[0.06]"></div>
      </div>

      <!-- Message row -->
      <div
        class="channel-msg group relative flex px-4 py-0.5 transition-colors duration-100 hover:bg-white/[0.02]"
        :data-msg-id="row.msg.id"
        :class="[
          row.grouped ? '' : 'mt-3',
          row.msg.failed ? 'opacity-60' : ''
        ]"
        style="content-visibility: auto; contain-intrinsic-size: auto 72px;"
      >
        <!-- Hover timestamp (compact, single line) -->
        <div
          v-if="row.grouped"
          class="w-[40px] flex-shrink-0 flex items-start justify-center pt-0.5"
        >
          <span class="text-[10px] text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity duration-150 select-none leading-none">
            {{ row.timeLabel }}
          </span>
        </div>

        <!-- Avatar (first in group) -->
        <div
          v-else
          class="w-[40px] flex-shrink-0 pt-0.5 cursor-pointer"
          @click="openProfile(row.msg)"
        >
          <UserAvatar
            :username="row.msg.user?.username || '?'"
            :avatarUrl="row.msg.user?.avatarUrl"
            :status="row.msg.user?.status || 'offline'"
            size="md"
            :showStatus="false"
          />
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0 ml-3">
          <!-- Username + timestamp (inline single line) -->
          <div
            v-if="!row.grouped"
            class="inline-flex items-baseline gap-2 mb-0.5 leading-none"
          >
            <span
              class="text-[14px] font-semibold cursor-pointer hover:underline"
              :style="{ color: row.color }"
              @click="openProfile(row.msg)"
            >
              {{ row.msg.user?.username || 'Usuario' }}
            </span>
            <span class="text-[11px] text-gray-600 font-normal select-none">
              {{ row.timeLabel }}
            </span>
          </div>

          <!-- Edición inline -->
          <div v-if="editingId === row.msg.id" class="my-1">
            <input
              :id="`edit-input-${row.msg.id}`"
              type="text"
              v-model="editingContent"
              @keydown.enter.prevent="confirmEdit(row.msg)"
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
              :content="row.msg.content"
              :attachments="row.msg.attachments"
            />
            <span v-if="row.msg.isEdited" class="text-[10px] text-gray-600 select-none ml-1">(editado)</span>
            <p v-if="row.msg.failed" class="text-[11px] text-red-400 mt-0.5">No se pudo enviar este mensaje</p>
          </template>
        </div>

        <!-- Acciones de mensaje (hover) -->
        <div
          v-if="editingId !== row.msg.id && (canEdit(row.msg) || canDelete(row.msg))"
          class="absolute -top-3 right-4 hidden group-hover:flex items-center bg-[#1a1b1e] border border-white/[0.08] rounded-lg shadow-lg overflow-hidden"
        >
          <button
            v-if="canEdit(row.msg)"
            @click="startEdit(row.msg)"
            class="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-white/[0.06] transition-colors"
            title="Editar mensaje"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            v-if="canDelete(row.msg)"
            @click="handleDelete(row.msg)"
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
import { ref, computed, nextTick, watch } from 'vue';
import UserAvatar from './UserAvatar.vue';
import MessageContent from './MessageContent.vue';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat';
import { useCommunityStore, Permissions } from '../stores/community';
import { useUserProfileStore } from '../stores/userProfile';
import { decodeHtmlEntities } from '../composables/decodeHtmlEntities';
import type { ChatMessage } from '../stores/chat';
import { useMessageRows } from '../composables/useMessageRows';
import { getUsernameColor } from '../composables/messageFormat';
import { dialog } from '../composables/useDialog';

const props = defineProps<{
  messages: ChatMessage[];
}>();

const authStore = useAuthStore();
const chatStore = useChatStore();
const communityStore = useCommunityStore();
const profileStore = useUserProfileStore();

const editingId = ref<string | null>(null);
const editingContent = ref('');

// Abrir el perfil del autor del mensaje (con contexto de comunidad si no es un DM)
const openProfile = (msg: ChatMessage) => {
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
const canEdit = (msg: ChatMessage) => !msg.pending && !msg.failed && msg.userId === authStore.user?.id;
const canDelete = (msg: ChatMessage) => !msg.pending && !msg.failed && (msg.userId === authStore.user?.id || canModerate.value);

const startEdit = (msg: ChatMessage) => {
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

const confirmEdit = (msg: ChatMessage) => {
  const content = editingContent.value.trim();
  if (content && content !== decodeHtmlEntities(msg.content)) {
    chatStore.editMessage(msg.id, content);
  }
  cancelEdit();
};

const handleDelete = async (msg: ChatMessage) => {
  const confirmed = await dialog.confirm({ message: '¿Eliminar este mensaje?', danger: true });
  if (!confirmed) return;
  chatStore.deleteMessage(msg.id);
};

// En una comunidad el nombre toma el color del rol más alto del autor.
// 1) color reactivo del store (se actualiza al instante al cambiar roles)
// 2) color enviado por el backend en el propio mensaje (siempre presente)
// 3) color determinista por nombre (DMs o usuarios sin rol con color)
const usernameColor = (msg: ChatMessage): string => {
  if (communityStore.activeCommunityId) {
    const liveColor = communityStore.getMemberRoleColor(msg.userId);
    if (liveColor) return liveColor;
  }
  if (msg.user?.roleColor) return msg.user.roleColor;
  return getUsernameColor(msg.user?.username || '?');
};

// ===================== Precomputed rows + windowed rendering =====================
const rows = useMessageRows(() => props.messages, usernameColor);

const INITIAL_RENDER_LIMIT = 150;
const REVEAL_STEP = 100;
const renderLimit = ref(INITIAL_RENDER_LIMIT);

// Only the LAST renderLimit rows are rendered; grouping/separator flags were
// already computed against the full history in useMessageRows, so slicing
// here never changes what a visible row looks like.
const visibleRows = computed(() => rows.value.slice(Math.max(0, rows.value.length - renderLimit.value)));

const hasHiddenRows = computed(() => renderLimit.value < rows.value.length);

const revealMore = () => {
  renderLimit.value = Math.min(renderLimit.value + REVEAL_STEP, rows.value.length);
};

// Changing channel/DM starts a fresh window (matches ChatArea scrolling to
// the bottom of the newly active conversation).
watch(
  () => chatStore.activeChannelId,
  () => {
    renderLimit.value = INITIAL_RENDER_LIMIT;
  }
);

// The window is anchored to the END of the list, so when new messages are
// appended while older rows are still hidden, a fixed renderLimit would drop
// the topmost rendered row and shift the content under a reader scrolled up
// in history. Grow the window by the same amount so the first rendered row
// stays put; the window only shrinks again on channel change.
watch(
  () => rows.value.length,
  (len, prevLen) => {
    if (prevLen === undefined || len <= prevLen) return;
    if (renderLimit.value < prevLen) {
      renderLimit.value += len - prevLen;
    }
  }
);

defineExpose({
  revealMore,
  hasHiddenRows,
});
</script>
