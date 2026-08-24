<template>
  <div
    v-if="voiceStore.connectedChannelId || voiceStore.isConnecting"
    class="border-t border-white/[0.06] bg-[#15161a] px-3 py-2.5 flex items-center gap-2"
  >
    <div class="flex-1 min-w-0">
      <p class="text-[12px] font-semibold flex items-center gap-1.5" :class="voiceStore.isConnecting ? 'text-amber-400' : 'text-emerald-400'">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        </svg>
        {{ voiceStore.isConnecting ? 'Conectando...' : 'Voz conectada' }}
      </p>
      <p class="text-[11px] text-gray-500 truncate">{{ channelName }}</p>
    </div>

    <!-- Mute -->
    <button
      @click="voiceStore.toggleMute()"
      class="p-1.5 rounded-lg transition-colors"
      :class="voiceStore.isMuted ? 'text-red-400 bg-red-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'"
      :title="voiceStore.isMuted ? 'Activar micrófono' : 'Silenciar micrófono'"
    >
      <svg v-if="!voiceStore.isMuted" xmlns="http://www.w3.org/2000/svg" class="h-4.5 w-4.5" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
      <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-4.5 w-4.5" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 5.586A2 2 0 005 7v4a7 7 0 0011.95 4.95M15 9.34V5a3 3 0 00-5.94-.6M12 18v4m0 0H8m4 0h4M3 3l18 18" />
      </svg>
    </button>

    <!-- Deafen -->
    <button
      @click="voiceStore.toggleDeafen()"
      class="p-1.5 rounded-lg transition-colors"
      :class="voiceStore.isDeafened ? 'text-red-400 bg-red-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'"
      :title="voiceStore.isDeafened ? 'Activar sonido' : 'Ensordecer'"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4.5 w-4.5" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 18v-6a9 9 0 0118 0v6M3 18a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H5a2 2 0 00-2 2v3zm18 0a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h1a2 2 0 012 2v3z" />
        <path v-if="voiceStore.isDeafened" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3l18 18" />
      </svg>
    </button>

    <!-- Compartir pantalla -->
    <button
      @click="toggleShare"
      class="p-1.5 rounded-lg transition-colors"
      :class="screenShareStore.isSharing ? 'text-emerald-400 bg-emerald-500/10' : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.06]'"
      :title="screenShareStore.isSharing ? 'Dejar de compartir pantalla' : 'Compartir pantalla'"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4.5 w-4.5" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    </button>

    <!-- Disconnect -->
    <button
      @click="voiceStore.leaveVoice()"
      class="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
      title="Desconectar"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4.5 w-4.5" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useVoiceStore } from '../stores/voice';
import { useCommunityStore } from '../stores/community';
import { useScreenShareStore } from '../stores/screenShare';

const voiceStore = useVoiceStore();
const communityStore = useCommunityStore();
const screenShareStore = useScreenShareStore();

const toggleShare = () => {
  if (screenShareStore.isSharing) {
    screenShareStore.stopSharing();
  } else {
    screenShareStore.showQualityPicker = true;
  }
};

const channelName = computed(() => {
  const channelId = voiceStore.connectedChannelId;
  if (!channelId) return '';
  for (const community of communityStore.communities) {
    for (const category of community.categories) {
      const channel = category.channels.find(ch => ch.id === channelId);
      if (channel) return `${channel.name} / ${community.name}`;
    }
  }
  return '';
});
</script>
