<template>
  <div v-if="show" class="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]" @click="$emit('close')">
    <div class="bg-[#313338] rounded-xl shadow-2xl w-[520px] max-h-[88vh] flex flex-col overflow-hidden animate-fade-in-up" @click.stop>
      <!-- Header with live banner preview -->
      <header class="relative">
        <div class="h-24 w-full" :style="{ background: bannerStyle }">
          <div class="absolute inset-0 bg-gradient-to-t from-[#313338] to-transparent"></div>
        </div>
        <div class="px-6 -mt-9 pb-2 flex items-end gap-4">
          <div class="rounded-full p-[4px] bg-[#313338]">
            <UserAvatar
              :username="form.username || authStore.user?.username || ''"
              :avatarUrl="form.avatarUrl || null"
              :status="authStore.user?.status || 'offline'"
              size="xl"
              :showStatus="false"
            />
          </div>
          <div class="pb-1 min-w-0">
            <h2 class="text-lg font-bold text-gray-100 truncate">{{ form.username || authStore.user?.username }}</h2>
            <p class="text-gray-400 text-[12px] truncate">
              {{ authStore.user?.username }}<span class="text-gray-600">#{{ authStore.user?.tag }}</span>
            </p>
          </div>
        </div>
      </header>

      <form @submit.prevent="handleSubmit" class="px-6 flex flex-col overflow-y-auto custom-scrollbar flex-1 pb-2">
        <!-- Identidad -->
        <section class="mb-5">
          <h3 class="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-3">Identidad</h3>

          <div class="mb-4">
            <label class="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Nombre de usuario</label>
            <input
              type="text"
              v-model="form.username"
              maxlength="30"
              class="w-full bg-[#1E1F22] text-gray-200 rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p class="text-[11px] text-gray-500 mt-1">3-30 caracteres: letras, números y guion bajo</p>
          </div>

          <div class="mb-4">
            <label class="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Avatar (URL)</label>
            <input
              type="text"
              v-model="form.avatarUrl"
              placeholder="https://ejemplo.com/avatar.png"
              class="w-full bg-[#1E1F22] text-gray-200 rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
              <label class="block text-xs font-bold text-gray-400 uppercase tracking-wide">Sobre mí</label>
              <span class="text-[11px]" :class="bioCount > BIO_MAX ? 'text-red-400' : 'text-gray-500'">{{ bioCount }}/{{ BIO_MAX }}</span>
            </div>
            <textarea
              v-model="form.bio"
              :maxlength="BIO_MAX"
              rows="3"
              placeholder="Contanos algo sobre vos"
              class="w-full bg-[#1E1F22] text-gray-200 rounded p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
            ></textarea>
          </div>

          <div class="grid grid-cols-2 gap-3 mb-1">
            <div>
              <label class="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Pronombres</label>
              <input
                type="text"
                v-model="form.pronouns"
                :maxlength="PRONOUNS_MAX"
                placeholder="ej. él/ella"
                class="w-full bg-[#1E1F22] text-gray-200 rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label class="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Estado personalizado</label>
              <input
                type="text"
                v-model="form.customStatus"
                :maxlength="CUSTOM_STATUS_MAX"
                placeholder="¿Qué estás haciendo?"
                class="w-full bg-[#1E1F22] text-gray-200 rounded p-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </section>

        <div class="h-px bg-white/[0.06] mb-5"></div>

        <!-- Apariencia -->
        <section class="mb-5">
          <h3 class="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-3">Apariencia</h3>

          <label class="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Banner</label>
          <p class="text-[11px] text-gray-500 mb-2.5">Subí una imagen o elegí un color. La imagen tiene prioridad sobre el color.</p>

          <div class="flex items-center gap-3 mb-3">
            <button
              type="button"
              @click="bannerFileInput?.click()"
              :disabled="isUploadingBanner"
              class="flex items-center gap-2 bg-[#1E1F22] hover:bg-[#26272b] text-gray-200 text-[13px] font-medium px-3.5 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {{ isUploadingBanner ? 'Subiendo...' : 'Subir imagen' }}
            </button>
            <input ref="bannerFileInput" type="file" accept="image/*" class="hidden" @change="handleBannerUpload" />

            <button
              v-if="form.bannerUrl"
              type="button"
              @click="form.bannerUrl = ''"
              class="text-[12px] text-gray-400 hover:text-red-400 transition-colors"
            >
              Quitar imagen
            </button>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[11px] font-semibold text-gray-400 mb-1.5">Color de banner</label>
              <div class="flex items-center gap-2.5">
                <input
                  type="color"
                  v-model="bannerColorPicker"
                  class="h-9 w-12 rounded cursor-pointer bg-transparent border border-white/[0.08] p-0"
                />
                <input
                  type="text"
                  v-model="form.bannerColor"
                  placeholder="#5865F2"
                  maxlength="7"
                  class="flex-1 min-w-0 bg-[#1E1F22] text-gray-200 text-[13px] rounded p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  v-if="form.bannerColor"
                  type="button"
                  @click="form.bannerColor = ''"
                  class="text-gray-500 hover:text-gray-300"
                  title="Quitar color"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-gray-400 mb-1.5">Color de acento</label>
              <div class="flex items-center gap-2.5">
                <input
                  type="color"
                  v-model="accentColorPicker"
                  class="h-9 w-12 rounded cursor-pointer bg-transparent border border-white/[0.08] p-0"
                />
                <input
                  type="text"
                  v-model="form.accentColor"
                  placeholder="#5865F2"
                  maxlength="7"
                  class="flex-1 min-w-0 bg-[#1E1F22] text-gray-200 text-[13px] rounded p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  v-if="form.accentColor"
                  type="button"
                  @click="form.accentColor = ''"
                  class="text-gray-500 hover:text-gray-300"
                  title="Quitar color"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </section>

        <div class="h-px bg-white/[0.06] mb-5"></div>

        <!-- Voz y Video -->
        <section class="mb-5">
          <h3 class="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-3">Voz y Video</h3>
          <p class="text-[12px] text-gray-500 mb-2.5">
            Si bloqueaste el permiso del micrófono por error y ya no te lo vuelve a pedir, restablecelo acá.
          </p>
          <button
            type="button"
            @click="resetMicPermission"
            :disabled="isResettingMic"
            class="flex items-center gap-2 bg-[#1E1F22] hover:bg-[#26272b] text-gray-200 text-[13px] font-medium px-3.5 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {{ isResettingMic ? 'Restableciendo...' : 'Restablecer permiso del micrófono' }}
          </button>
          <p v-if="micResetMessage" class="text-[12px] mt-2" :class="micResetError ? 'text-red-400' : 'text-emerald-400'">
            {{ micResetMessage }}
          </p>
        </section>

        <div class="h-px bg-white/[0.06] mb-5"></div>

        <!-- Conexiones -->
        <section class="mb-3">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Conexiones</h3>
            <span class="text-[11px] text-gray-600">{{ connections.length }}/{{ CONNECTIONS_MAX }}</span>
          </div>

          <div v-if="connections.length > 0" class="flex flex-col gap-2 mb-3">
            <div
              v-for="conn in connections"
              :key="conn.id"
              class="flex items-center gap-2.5 bg-[#1E1F22] rounded-lg px-3 py-2"
            >
              <span class="flex-shrink-0 text-gray-300" v-html="platformIcon(conn.platform)"></span>
              <div class="min-w-0 flex-1">
                <p class="text-[13px] text-gray-200 truncate">{{ conn.name }}</p>
                <p class="text-[11px] text-gray-500 truncate">{{ platformLabel(conn.platform) }}<template v-if="conn.url"> · {{ conn.url }}</template></p>
              </div>
              <button
                type="button"
                @click="removeConnection(conn.id)"
                class="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Quitar conexión"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Add connection row -->
          <div v-if="connections.length < CONNECTIONS_MAX" class="flex items-end gap-2">
            <div class="w-32 flex-shrink-0">
              <select
                v-model="newConnection.platform"
                class="w-full bg-[#1E1F22] text-gray-200 text-[13px] rounded p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option v-for="p in PLATFORMS" :key="p" :value="p">{{ platformLabel(p) }}</option>
              </select>
            </div>
            <input
              type="text"
              v-model="newConnection.name"
              placeholder="Usuario / nombre"
              class="flex-1 min-w-0 bg-[#1E1F22] text-gray-200 text-[13px] rounded p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <input
              type="text"
              v-model="newConnection.url"
              placeholder="URL (opcional)"
              class="flex-1 min-w-0 bg-[#1E1F22] text-gray-200 text-[13px] rounded p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="button"
              @click="addConnection"
              :disabled="!newConnection.name.trim() || isAddingConnection"
              class="flex-shrink-0 bg-indigo-500 hover:bg-indigo-600 text-white text-[13px] font-medium px-3.5 py-2 rounded transition-colors disabled:opacity-50"
            >
              {{ isAddingConnection ? '...' : 'Añadir' }}
            </button>
          </div>
          <p v-else class="text-[12px] text-gray-500">Llegaste al máximo de {{ CONNECTIONS_MAX }} conexiones.</p>
          <p v-if="connectionError" class="text-red-400 text-[12px] mt-2">{{ connectionError }}</p>
        </section>

        <p v-if="errorMessage" class="text-red-400 text-sm my-2">{{ errorMessage }}</p>
      </form>

      <footer class="bg-[#2B2D31] px-6 py-4 flex justify-between items-center border-t border-[#1E1F22]">
        <button
          type="button"
          @click="$emit('close')"
          class="text-gray-300 hover:text-white px-4 py-2 font-medium transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          @click="handleSubmit"
          :disabled="!form.username.trim() || isLoading"
          class="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2.5 rounded font-medium transition-colors disabled:opacity-50"
        >
          {{ isLoading ? 'Guardando...' : 'Guardar' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useAuthStore } from '../stores/auth';
import type { UserConnection } from '../stores/auth';
import { useChatStore } from '../stores/chat';
import { useUserBanner } from '../composables/useUserBanner';
import { PLATFORMS, platformLabel, platformIcon } from '../composables/usePlatformIcon';
import UserAvatar from './UserAvatar.vue';
import api from '../api/axios';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const authStore = useAuthStore();
const chatStore = useChatStore();

// Backend-aligned limits.
const BIO_MAX = 190;
const PRONOUNS_MAX = 40;
const CUSTOM_STATUS_MAX = 128;
const CONNECTIONS_MAX = 10;

const form = ref({
  username: '',
  avatarUrl: '',
  bio: '',
  pronouns: '',
  customStatus: '',
  bannerUrl: '',
  bannerColor: '',
  accentColor: '',
});

const connections = ref<UserConnection[]>([]);
const newConnection = ref<{ platform: string; name: string; url: string }>({
  platform: PLATFORMS[0],
  name: '',
  url: '',
});

const isLoading = ref(false);
const isUploadingBanner = ref(false);
const isAddingConnection = ref(false);
const isResettingMic = ref(false);
const errorMessage = ref('');
const connectionError = ref('');
const micResetMessage = ref('');
const micResetError = ref(false);
const bannerFileInput = ref<HTMLInputElement | null>(null);

const resetMicPermission = async () => {
  isResettingMic.value = true;
  micResetMessage.value = '';
  try {
    await invoke('reset_media_permissions', { origin: window.location.origin });
    micResetError.value = false;
    micResetMessage.value = 'Listo. La próxima vez que entres a un canal de voz te va a volver a pedir el permiso.';
  } catch (err: any) {
    micResetError.value = true;
    micResetMessage.value = typeof err === 'string' ? err : 'No se pudo restablecer el permiso.';
  } finally {
    isResettingMic.value = false;
  }
};

const bioCount = computed(() => form.value.bio.length);

// Live banner preview using the shared resolution chain.
const { bannerStyle } = useUserBanner(() => ({
  bannerUrl: form.value.bannerUrl,
  bannerColor: form.value.bannerColor,
  username: form.value.username || authStore.user?.username,
}));

// <input type="color"> requires a valid #RRGGBB value; bridge it with the text
// field while letting the text field stay empty (= no color set).
const bannerColorPicker = computed({
  get: () => form.value.bannerColor || '#5865F2',
  set: (v: string) => { form.value.bannerColor = v; },
});
const accentColorPicker = computed({
  get: () => form.value.accentColor || '#5865F2',
  set: (v: string) => { form.value.accentColor = v; },
});

watch(() => props.show, (newVal) => {
  if (newVal) {
    const u = authStore.user;
    form.value = {
      username: u?.username ?? '',
      avatarUrl: u?.avatarUrl ?? '',
      bio: u?.bio ?? '',
      pronouns: u?.pronouns ?? '',
      customStatus: u?.customStatus ?? '',
      bannerUrl: u?.bannerUrl ?? '',
      bannerColor: u?.bannerColor ?? '',
      accentColor: u?.accentColor ?? '',
    };
    connections.value = u?.connections ? [...u.connections] : [];
    newConnection.value = { platform: PLATFORMS[0], name: '', url: '' };
    errorMessage.value = '';
    connectionError.value = '';
  }
});

const handleBannerUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  isUploadingBanner.value = true;
  errorMessage.value = '';
  try {
    // Reuse the chat attachment presign flow; the returned cdnUrl is the banner.
    const result = await chatStore.uploadFile(file);
    if (result.cdnUrl) {
      form.value.bannerUrl = result.cdnUrl;
    }
    // Keep the pending-attachments list clean (this upload is not a message).
    chatStore.removePendingAttachment(result.id);
  } catch (error) {
    console.error('Error subiendo banner:', error);
    errorMessage.value = 'No se pudo subir la imagen del banner.';
  } finally {
    // On failure, uploadFile pushes an 'error'-status attachment and throws
    // before returning its id, so it would otherwise leak into the chat
    // composer's pending list. Drop any error-status entries here.
    chatStore.pendingAttachments
      .filter(a => a.status === 'error')
      .forEach(a => chatStore.removePendingAttachment(a.id));
    isUploadingBanner.value = false;
    target.value = '';
  }
};

const addConnection = async () => {
  const name = newConnection.value.name.trim();
  const url = newConnection.value.url.trim();
  if (!name) return;

  isAddingConnection.value = true;
  connectionError.value = '';
  try {
    const body: { platform: string; name: string; url?: string } = {
      platform: newConnection.value.platform,
      name,
    };
    if (url) body.url = url;
    const response = await api.post('/users/me/connections', body);
    connections.value.push(response.data);
    // Sync auth store so open profile cards reflect the change.
    if (authStore.user) authStore.user.connections = [...connections.value];
    newConnection.value = { platform: PLATFORMS[0], name: '', url: '' };
  } catch (error: any) {
    connectionError.value = error.response?.data?.error || 'No se pudo añadir la conexión.';
  } finally {
    isAddingConnection.value = false;
  }
};

const removeConnection = async (id: string) => {
  connectionError.value = '';
  try {
    await api.delete(`/users/me/connections/${id}`);
    connections.value = connections.value.filter(c => c.id !== id);
    if (authStore.user) authStore.user.connections = [...connections.value];
  } catch (error: any) {
    connectionError.value = error.response?.data?.error || 'No se pudo quitar la conexión.';
  }
};

const handleSubmit = async () => {
  if (!form.value.username.trim()) return;

  isLoading.value = true;
  errorMessage.value = '';
  try {
    // Only scalar fields go in the PATCH; connections are saved on their own.
    const response = await api.patch('/users/me', {
      username: form.value.username.trim(),
      avatarUrl: form.value.avatarUrl.trim(),
      bio: form.value.bio.trim(),
      pronouns: form.value.pronouns.trim(),
      customStatus: form.value.customStatus.trim(),
      bannerUrl: form.value.bannerUrl.trim() || null,
      bannerColor: form.value.bannerColor.trim() || null,
      accentColor: form.value.accentColor.trim() || null,
    });
    // Merge response, preserving the locally-managed connections list.
    authStore.user = { ...response.data, connections: connections.value };
    emit('close');
  } catch (error: any) {
    errorMessage.value = error.response?.data?.error || 'Hubo un error al guardar el perfil.';
  } finally {
    isLoading.value = false;
  }
};
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
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
