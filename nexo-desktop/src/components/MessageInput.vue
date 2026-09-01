<template>
  <div class="px-4 py-4 bg-[#0e0e10]">
    <!-- Upload zone (visible when files selected) -->
    <div
      v-if="pendingAttachments.length > 0"
      class="mx-4 mb-2 bg-[#232428] rounded-lg p-3"
      @dragover.prevent="isDragOver = true"
      @dragleave="isDragOver = false"
      @drop.prevent="handleDrop"
    >
      <!-- Preview area -->
      <div class="flex gap-3 overflow-x-auto pb-1">
        <div
          v-for="attachment in pendingAttachments"
          :key="attachment.id"
          class="attachment-preview relative group flex-shrink-0"
        >
          <!-- Image preview -->
          <div v-if="attachment.type === 'image' && attachment.status !== 'uploading'" class="relative">
            <img
              :src="attachment.previewUrl"
              class="w-32 h-32 object-cover rounded-lg"
            />
            <button
              @click.stop="removeAttachment(attachment.id)"
              class="absolute top-1 right-1 w-6 h-6 bg-black/70 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <span class="text-sm font-bold">×</span>
            </button>
            <p class="text-[11px] text-gray-400 truncate max-w-[128px] mt-1">{{ attachment.file.name }}</p>
          </div>

          <!-- Video preview -->
          <div v-else-if="attachment.type === 'video' && attachment.status !== 'uploading'" class="relative">
            <video
              :src="attachment.previewUrl"
              class="w-32 h-32 object-cover rounded-lg"
              muted
            />
            <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div class="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center">
                <span class="text-white text-xl">▶</span>
              </div>
            </div>
            <button
              @click.stop="removeAttachment(attachment.id)"
              class="absolute top-1 right-1 w-6 h-6 bg-black/70 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <span class="text-sm font-bold">×</span>
            </button>
            <p class="text-[11px] text-gray-400 truncate max-w-[128px] mt-1">{{ attachment.file.name }}</p>
          </div>

          <!-- Audio preview -->
          <div v-else-if="attachment.type === 'audio'" class="relative">
            <div class="w-32 h-32 bg-[#1a1a1f] rounded-lg flex flex-col items-center justify-center">
              <span class="text-4xl mb-2">🎵</span>
              <p class="text-xs text-gray-400 truncate max-w-[128px] px-1">{{ attachment.file.name }}</p>
            </div>
            <button
              @click.stop="removeAttachment(attachment.id)"
              class="absolute top-1 right-1 w-6 h-6 bg-black/70 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <span class="text-sm font-bold">×</span>
            </button>
          </div>

          <!-- File preview (generic) -->
          <div v-else class="relative">
            <div class="w-32 h-32 bg-[#1a1a1f] rounded-lg flex flex-col items-center justify-center">
              <span class="text-4xl mb-2">📄</span>
              <p class="text-xs text-gray-400 truncate max-w-[128px] px-1">{{ attachment.file.name }}</p>
            </div>
            <button
              @click.stop="removeAttachment(attachment.id)"
              class="absolute top-1 right-1 w-6 h-6 bg-black/70 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <span class="text-sm font-bold">×</span>
            </button>
          </div>

          <!-- Progress for uploading -->
          <div
            v-if="attachment.status === 'uploading'"
            class="absolute inset-0 bg-black/70 flex items-center justify-center rounded-lg"
          >
            <div class="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          </div>

          <!-- Upload status label: shows exactly where an attachment is stuck -->
          <p
            class="text-[10px] text-center mt-0.5 max-w-[128px] truncate"
            :class="{
              'text-indigo-400': attachment.status === 'pending' || attachment.status === 'uploading',
              'text-red-400': attachment.status === 'error',
              'text-emerald-400': attachment.status === 'completed'
            }"
          >
            <template v-if="attachment.status === 'pending'">Preparando…</template>
            <template v-else-if="attachment.status === 'uploading'">Subiendo…</template>
            <template v-else-if="attachment.status === 'error'">{{ attachment.error || 'Error al subir' }}</template>
            <template v-else>Listo ✓</template>
          </p>
        </div>
      </div>

      <!-- Drop hint -->
      <div @click="openFilePicker" class="flex items-center justify-center py-1 opacity-50 cursor-pointer hover:opacity-80 transition-opacity">
        <span class="text-xs text-gray-500">Drop files here or click to add</span>
      </div>
    </div>

    <!-- Hidden file input -->
    <input
      type="file"
      ref="fileInput"
      multiple
      @change="handleFileSelect"
      class="hidden"
    />

    <!-- Input Area -->
    <form @submit.prevent="handleSubmit" class="chat-input-wrapper relative flex items-center">
      <button type="button" @click="openFilePicker" class="absolute left-3 p-1.5 rounded-lg text-gray-600 hover:text-gray-400 hover:bg-white/[0.06] transition-all duration-200 z-10">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      <input
        type="text"
        v-model="localMessage"
        :disabled="!isInputEnabled"
        :placeholder="placeholder"
        @input="$emit('typing')"
        class="chat-input w-full bg-[#1a1b1e] text-white text-[14px] rounded-xl pl-12 pr-24 py-3 focus:outline-none transition-all duration-200 placeholder-gray-600 border border-white/[0.04] focus:border-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed"
      />

      <div class="absolute right-2 flex items-center gap-0.5">
        <button type="button" class="p-2 rounded-lg text-gray-600 hover:text-gray-400 hover:bg-white/[0.06] transition-all duration-200">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        <button
          type="submit"
          :disabled="!canSend"
          class="send-btn p-2 rounded-xl text-gray-600 transition-all duration-300 disabled:opacity-30"
          :class="canSend ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 hover:bg-indigo-400' : 'hover:text-gray-400'"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

interface PendingAttachment {
  id: string;
  file: File;
  type: string;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  objectKey?: string;
  cdnUrl?: string;
  error?: string;
  previewUrl?: string;
}

const props = defineProps<{
  isInputEnabled: boolean;
  placeholder: string;
  pendingAttachments: PendingAttachment[];
}>();

const emit = defineEmits<{
  (e: 'send', content: string, attachments: any[]): void;
  (e: 'upload', file: File): Promise<void>;
  (e: 'remove-attachment', id: string): void;
  (e: 'clear-completed'): void;
  (e: 'typing'): void;
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const isDragOver = ref(false);
const localMessage = ref('');

const canSend = computed(() => {
  const hasContent = localMessage.value.trim().length > 0;
  const hasCompletedAttachments = props.pendingAttachments.some(a => a.status === 'completed');
  const hasAttachmentsInFlight = props.pendingAttachments.some(a => a.status === 'pending' || a.status === 'uploading');
  if (hasAttachmentsInFlight) return false;
  return (hasContent || hasCompletedAttachments) && props.isInputEnabled;
});

const handleSubmit = () => {
  const content = localMessage.value.trim();
  // Attachments upload automatically on select/drop (handleFileSelect,
  // handleDrop). While one is still 'pending' or 'uploading', canSend keeps
  // the submit button disabled, so this only needs to gather what's ready.
  const hasCompleted = props.pendingAttachments.some(a => a.status === 'completed');

  if (!content && !hasCompleted) {
    return;
  }

  // Get all completed attachments
  const attachments = props.pendingAttachments
    .filter(a => a.status === 'completed')
    .map(a => ({
      objectKey: a.objectKey!,
      cdnUrl: a.cdnUrl!,
      name: a.file.name,
      size: a.file.size,
      mimeType: a.file.type,
      type: a.type
    }));

  emit('send', content, attachments);
  emit('clear-completed');
  localMessage.value = '';
};

const openFilePicker = () => {
  fileInput.value?.click();
};

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files) {
    for (const file of Array.from(input.files)) {
      await emit('upload', file);
    }
    input.value = '';
  }
}

async function handleDrop(event: DragEvent) {
  isDragOver.value = false;
  if (event.dataTransfer?.files) {
    for (const file of Array.from(event.dataTransfer.files)) {
      await emit('upload', file);
    }
  }
}

function removeAttachment(id: string) {
  emit('remove-attachment', id);
}
</script>
