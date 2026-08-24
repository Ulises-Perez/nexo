<template>
  <div class="message-content-wrapper">
    <!-- Text content -->
    <p 
      v-if="content" 
      class="text-[14px] text-gray-300 leading-[1.375rem] break-words whitespace-pre-wrap"
    >{{ decodeHtmlEntities(content) }}</p>

    <!-- Attachments -->
    <div v-if="attachments && attachments.length > 0" class="mt-1.5 flex flex-col gap-1.5">
      <template v-for="attachment in attachments" :key="attachment.id">

        <!-- IMAGE -->
        <div 
          v-if="attachment.type === 'image'" 
          class="attachment-image relative rounded-xl overflow-hidden cursor-pointer group max-w-[400px]"
          @click="openLightbox(attachment.url)"
        >
          <img 
            :src="attachment.url" 
            :alt="attachment.name ? decodeHtmlEntities(attachment.name) : 'Imagen'"
            class="w-full h-auto max-h-[350px] object-cover rounded-xl transition-transform duration-200 group-hover:scale-[1.02]"
            loading="lazy"
          />
          <!-- Overlay on hover -->
          <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200 rounded-xl flex items-center justify-center">
            <div class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/60 rounded-lg p-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
            </div>
          </div>
        </div>

        <!-- VIDEO -->
        <div 
          v-else-if="attachment.type === 'video'" 
          class="attachment-video rounded-xl overflow-hidden max-w-[450px] bg-black/20 border border-white/[0.04]"
        >
          <video 
            :src="attachment.url" 
            controls
            preload="metadata"
            class="w-full max-h-[350px] rounded-xl"
            :poster="attachment.url + '?poster'"
          >
            Tu navegador no soporta el elemento de video.
          </video>
          <div v-if="attachment.name || attachment.size" class="flex items-center gap-2 px-3 py-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span v-if="attachment.name" class="text-[12px] text-gray-500 truncate">{{ decodeHtmlEntities(attachment.name) }}</span>
            <span v-if="attachment.size" class="text-[11px] text-gray-600 ml-auto flex-shrink-0">{{ formatFileSize(attachment.size) }}</span>
          </div>
        </div>

        <!-- AUDIO -->
        <div 
          v-else-if="attachment.type === 'audio'" 
          class="attachment-audio rounded-xl bg-[#1a1b1e] border border-white/[0.04] max-w-[400px] overflow-hidden"
        >
          <div class="flex items-center gap-3 px-4 py-3">
            <button 
              @click="toggleAudio(attachment.id)"
              class="audio-play-btn w-10 h-10 rounded-full bg-indigo-500 hover:bg-indigo-400 flex items-center justify-center flex-shrink-0 transition-all duration-200 shadow-lg shadow-indigo-500/20"
            >
              <!-- Play -->
              <svg v-if="!isPlaying(attachment.id)" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
              <!-- Pause -->
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            </button>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1.5">
                <span v-if="attachment.name" class="text-[13px] text-gray-300 font-medium truncate">{{ decodeHtmlEntities(attachment.name) }}</span>
                <span v-else class="text-[13px] text-gray-400 font-medium">Audio</span>
              </div>
              <!-- Waveform / progress bar -->
              <div class="audio-waveform relative h-[6px] bg-white/[0.06] rounded-full overflow-hidden">
                <div 
                  class="absolute left-0 top-0 h-full bg-indigo-500 rounded-full transition-all duration-100"
                  :style="{ width: getAudioProgress(attachment.id) + '%' }"
                ></div>
              </div>
              <div class="flex items-center justify-between mt-1">
                <span class="text-[10px] text-gray-600">{{ formatAudioTime(getAudioCurrentTime(attachment.id)) }}</span>
                <span v-if="attachment.duration" class="text-[10px] text-gray-600">{{ formatAudioTime(attachment.duration) }}</span>
                <span v-if="attachment.size" class="text-[10px] text-gray-600">{{ formatFileSize(attachment.size) }}</span>
              </div>
            </div>
          </div>

          <audio 
            :ref="(el) => setAudioRef(attachment.id, el as HTMLAudioElement)"
            :src="attachment.url"
            preload="metadata"
            @timeupdate="onAudioTimeUpdate(attachment.id)"
            @ended="onAudioEnded(attachment.id)"
          ></audio>
        </div>

        <!-- GENERIC FILE -->
        <a 
          v-else
          :href="attachment.url"
          target="_blank"
          class="attachment-file flex items-center gap-3 px-4 py-3 rounded-xl bg-[#1a1b1e] border border-white/[0.04] hover:bg-white/[0.04] transition-all duration-200 max-w-[360px] cursor-pointer group"
        >
          <div class="w-10 h-10 rounded-lg bg-indigo-500/15 flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[13px] text-indigo-400 font-medium truncate group-hover:underline">{{ attachment.name ? decodeHtmlEntities(attachment.name) : 'Archivo' }}</p>
            <p v-if="attachment.size" class="text-[11px] text-gray-600 mt-0.5">{{ formatFileSize(attachment.size) }}</p>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-600 group-hover:text-gray-400 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </a>

      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import type { MessageAttachment } from '../stores/chat';
import { decodeHtmlEntities } from '../composables/decodeHtmlEntities';

defineProps<{
  content: string;
  attachments?: MessageAttachment[];
}>();

// ========= Audio Player State =========
const audioRefs: Record<string, HTMLAudioElement | null> = {};
const audioStates = reactive<Record<string, { playing: boolean; progress: number; currentTime: number }>>({});

const setAudioRef = (id: string, el: HTMLAudioElement | null) => {
  audioRefs[id] = el;
  if (!audioStates[id]) {
    audioStates[id] = { playing: false, progress: 0, currentTime: 0 };
  }
};

const isPlaying = (id: string): boolean => {
  return audioStates[id]?.playing || false;
};

const getAudioProgress = (id: string): number => {
  return audioStates[id]?.progress || 0;
};

const getAudioCurrentTime = (id: string): number => {
  return audioStates[id]?.currentTime || 0;
};

const toggleAudio = (id: string) => {
  const audio = audioRefs[id];
  if (!audio) return;

  // Pausar todos los demás audios
  Object.keys(audioRefs).forEach(key => {
    if (key !== id && audioRefs[key] && audioStates[key]?.playing) {
      audioRefs[key]!.pause();
      audioStates[key].playing = false;
    }
  });

  if (audioStates[id]?.playing) {
    audio.pause();
    audioStates[id].playing = false;
  } else {
    audio.play();
    audioStates[id].playing = true;
  }
};

const onAudioTimeUpdate = (id: string) => {
  const audio = audioRefs[id];
  if (!audio || !audioStates[id]) return;
  
  audioStates[id].currentTime = audio.currentTime;
  if (audio.duration) {
    audioStates[id].progress = (audio.currentTime / audio.duration) * 100;
  }
};

const onAudioEnded = (id: string) => {
  if (audioStates[id]) {
    audioStates[id].playing = false;
    audioStates[id].progress = 0;
    audioStates[id].currentTime = 0;
  }
};

// ========= Helpers =========
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const formatAudioTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const openLightbox = (url: string) => {
  window.open(url, '_blank');
};
</script>

<style scoped>
.attachment-image img {
  display: block;
}

.attachment-video video {
  display: block;
}

.audio-play-btn:active {
  transform: scale(0.92);
}

.audio-waveform {
  cursor: pointer;
}
</style>
