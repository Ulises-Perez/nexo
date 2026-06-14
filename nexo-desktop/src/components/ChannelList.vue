<template>
  <div class="flex-1 overflow-y-auto py-3 custom-scrollbar">
    <div v-for="category in categories" :key="category.id" class="mb-4">

      <div class="group/cat flex items-center gap-1 px-4 mb-1">
        <h3 class="text-xs font-semibold text-gray-400 hover:text-gray-300 uppercase tracking-wider cursor-pointer flex items-center gap-1 flex-1 min-w-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 transition-transform flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
          <span class="truncate">{{ category.name }}</span>
        </h3>

        <!-- Acciones de categoría (con permiso) -->
        <template v-if="canManageChannels">
          <button
            @click="openCategorySettings(category)"
            class="opacity-0 group-hover/cat:opacity-100 text-gray-500 hover:text-gray-200 transition-all flex-shrink-0"
            title="Ajustes de la categoría"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            @click="$emit('create-channel', category.id)"
            class="text-gray-500 hover:text-gray-200 transition-colors flex-shrink-0"
            title="Crear canal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </template>
      </div>

      <ul class="px-2 mt-1">
        <li v-for="channel in category.channels" :key="channel.id">
          <div
            @click="handleChannelClick(channel)"
            class="group/ch px-2 py-1.5 mb-[2px] rounded cursor-pointer hover:bg-[#35373C] hover:text-gray-200 transition-colors flex items-center gap-1.5"
            :class="{
              'bg-[#404249] text-white': isChannelActive(channel),
              'text-gray-400': !isChannelActive(channel)
            }"
          >
            <!-- Icono: # para texto, altavoz para voz -->
            <svg v-if="channel.type === 'voice'" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 opacity-60 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 opacity-60 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M9.243 3.03a1 1 0 01.727 1.213L9.53 6h2.94l.539-2.757a1 1 0 011.96.393l-.46 2.364h2.793a1 1 0 110 2h-2.4l-.79 4h2.793a1 1 0 110 2h-3.186l-.539 2.757a1 1 0 11-1.96-.393l.46-2.364H8.47l-.539 2.757a1 1 0 11-1.96-.393l.46-2.364H3.638a1 1 0 110-2h2.4l.79-4H3.638a1 1 0 110-2h3.186l.539-2.757a1 1 0 011.213-.727zM9.138 8l-.79 4h2.94l.79-4H9.138z" clip-rule="evenodd" />
            </svg>

            <span
              class="truncate flex-1 font-medium"
              :class="{ 'text-gray-100 font-semibold': hasUnread(channel) }"
            >{{ channel.name }}</span>

            <!-- Badge de no leídos del canal -->
            <span
              v-if="hasUnread(channel)"
              class="min-w-[18px] h-[18px] bg-indigo-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 shadow-lg flex-shrink-0"
            >
              {{ communityStore.getChannelUnread(channel.id) > 99 ? '99+' : communityStore.getChannelUnread(channel.id) }}
            </span>

            <!-- Engranaje de ajustes del canal (con permiso) -->
            <button
              v-if="canManageChannels"
              @click.stop="openChannelSettings(channel)"
              class="opacity-0 group-hover/ch:opacity-100 text-gray-500 hover:text-gray-200 transition-all flex-shrink-0"
              title="Ajustes del canal"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>

          <!-- Participantes del canal de voz -->
          <ul v-if="channel.type === 'voice' && voiceParticipants(channel.id).length > 0" class="ml-7 mb-1">
            <li
              v-for="participant in voiceParticipants(channel.id)"
              :key="participant.socketId"
              @click="profileStore.open(participant.userId, communityId)"
              class="flex items-center gap-2 px-2 py-1 text-gray-400 rounded cursor-pointer hover:bg-white/[0.04] hover:text-gray-200 transition-colors"
            >
              <!-- Borde verde completo mientras el usuario habla -->
              <div
                class="rounded-full ring-2 transition-all duration-150"
                :class="voiceStore.isSpeaking(participant.socketId) ? 'ring-emerald-400' : 'ring-transparent'"
              >
                <UserAvatar
                  :username="participant.username"
                  :avatarUrl="participant.avatarUrl"
                  status="online"
                  size="xs"
                  :showStatus="false"
                />
              </div>
              <span
                class="text-[13px] truncate flex-1 transition-colors"
                :class="{ 'text-gray-100': voiceStore.isSpeaking(participant.socketId) }"
              >{{ participant.username }}</span>
              <svg v-if="participant.muted" xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 5.586A2 2 0 005 7v4a7 7 0 0011.95 4.95M15 9.34V5a3 3 0 00-5.94-.6M12 18v4m0 0H8m4 0h4M3 3l18 18" />
              </svg>
            </li>
          </ul>
        </li>
      </ul>

    </div>

    <!-- Modal de ajustes de canal -->
    <ChannelSettingsModal
      :show="!!settingsChannel"
      :channel="settingsChannel"
      @close="settingsChannel = null"
    />

    <!-- Modal de ajustes de categoría -->
    <CategorySettingsModal
      :show="!!settingsCategory"
      :category="settingsCategory"
      @close="settingsCategory = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useCommunityStore, Permissions } from '../stores/community';
import type { Channel, Category } from '../stores/community';
import { useVoiceStore } from '../stores/voice';
import { useUserProfileStore } from '../stores/userProfile';
import UserAvatar from './UserAvatar.vue';
import ChannelSettingsModal from './ChannelSettingsModal.vue';
import CategorySettingsModal from './CategorySettingsModal.vue';

const props = defineProps<{
  categories: Category[];
  activeChannelId: string | null;
  communityId: string;
}>();

const emit = defineEmits<{
  (e: 'select-channel', channelId: string): void;
  (e: 'create-channel', categoryId: string): void;
}>();

const communityStore = useCommunityStore();
const voiceStore = useVoiceStore();
const profileStore = useUserProfileStore();

const settingsChannel = ref<Channel | null>(null);
const settingsCategory = ref<Category | null>(null);

const canManageChannels = computed(() => communityStore.can(Permissions.MANAGE_CHANNELS, props.communityId));

const voiceParticipants = (channelId: string) => voiceStore.getParticipants(channelId);

const isChannelActive = (channel: Channel): boolean => {
  if (channel.type === 'voice') return voiceStore.connectedChannelId === channel.id;
  return props.activeChannelId === channel.id;
};

// Muestra el badge solo si hay no leídos y el canal NO es el activo
const hasUnread = (channel: Channel): boolean => {
  if (isChannelActive(channel)) return false;
  return communityStore.getChannelUnread(channel.id) > 0;
};

const handleChannelClick = (channel: Channel) => {
  if (channel.type === 'voice') {
    voiceStore.joinVoice(channel.id);
  } else {
    emit('select-channel', channel.id);
  }
};

const openChannelSettings = (channel: Channel) => {
  settingsChannel.value = channel;
};

const openCategorySettings = (category: Category) => {
  settingsCategory.value = category;
};
</script>
