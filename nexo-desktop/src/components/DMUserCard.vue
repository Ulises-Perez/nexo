<template>
  <aside class="w-60 bg-[#1a1b1e] border-l border-white/[0.04] flex-shrink-0 overflow-y-auto custom-scrollbar h-full py-4 px-3">
    <div class="bg-[#1e1f23] rounded-2xl border border-white/[0.06] shadow-2xl shadow-black/50 overflow-hidden flex flex-col">
      <!-- Banner -->
      <div class="h-24 relative" :style="{ background: bannerStyle }">
        <div class="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"></div>
      </div>

      <!-- Avatar con anillo, solapando el banner -->
      <div class="px-4 -mt-11 relative z-10">
        <div class="inline-block rounded-full p-[5px] bg-[#1e1f23]">
          <UserAvatar
            :username="displayUsername"
            :avatarUrl="displayAvatarUrl"
            :status="displayStatus"
            size="xl"
            :showStatus="true"
            statusBorderColor="#1e1f23"
          />
        </div>
      </div>

      <!-- Identidad -->
      <div class="px-4 mt-2.5">
        <h4 class="text-[18px] font-bold truncate leading-tight" :style="nameStyle">{{ displayUsername }}</h4>
        <p class="text-[13px] text-gray-500 flex items-center">
          <span class="min-w-0 truncate">{{ displayUsername }}<span class="text-gray-600">#{{ displayTag }}</span></span>
        </p>
        <p v-if="customStatus" class="text-[13px] text-gray-300 truncate mt-0.5">{{ customStatus }}</p>
        <p v-if="pronouns" class="text-[12px] text-gray-500 truncate mt-0.5">{{ pronouns }}</p>
      </div>

      <!-- Tarjeta interior -->
      <div class="mx-3 mt-3 mb-3 bg-[#141518] border border-white/[0.06] rounded-2xl p-3.5">
        <!-- Estado -->
        <div class="flex items-center gap-2 text-[12px] text-gray-300">
          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :class="displayStatus === 'online' ? 'bg-emerald-400' : 'bg-gray-500'"></span>
          <span class="font-medium">{{ displayStatus === 'online' ? 'En línea' : 'Desconectado' }}</span>
        </div>

        <!-- Bio -->
        <template v-if="bio">
          <div class="h-px bg-white/[0.06] my-3"></div>
          <p class="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Bio</p>
          <p class="text-[13px] text-gray-300 whitespace-pre-wrap break-words leading-relaxed">{{ bio }}</p>
        </template>

        <div class="h-px bg-white/[0.06] my-3"></div>

        <!-- Píldora: Miembro desde -->
        <p class="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-2">Miembro desde</p>
        <div class="flex items-center gap-2.5 bg-[#1a1b1e] border border-white/[0.06] rounded-xl px-3 py-2.5">
          <span class="text-indigo-400 flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </span>
          <span class="text-[13px] text-gray-200 truncate">{{ memberSince }}</span>
        </div>
      </div>

      <!-- Servidores en común -->
      <div class="mx-3 mb-2">
        <div v-if="isLoadingExtra" class="h-[42px] rounded-xl bg-white/[0.03] animate-pulse"></div>
        <button
          v-else
          @click="mutualCommunities.length > 0 && (showCommunities = !showCommunities)"
          :disabled="mutualCommunities.length === 0"
          class="w-full flex items-center justify-between px-3 py-2.5 bg-[#141518] border border-white/[0.06] rounded-xl transition-colors disabled:cursor-default"
          :class="mutualCommunities.length > 0 ? 'hover:bg-[#191a1e]' : ''"
        >
          <span class="text-[12px] font-semibold text-gray-300">
            {{ mutualCommunities.length > 0 ? `Servidores en común — ${mutualCommunities.length}` : 'Sin servidores en común' }}
          </span>
          <svg
            v-if="mutualCommunities.length > 0"
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4 text-gray-500 transition-transform"
            :class="{ 'rotate-90': showCommunities }"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <div v-if="showCommunities && mutualCommunities.length > 0" class="mt-1.5 flex flex-col gap-1">
          <div
            v-for="c in mutualCommunities"
            :key="c.id"
            class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
          >
            <div class="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0 bg-[#1a1b1e] flex items-center justify-center">
              <img v-if="c.iconUrl" :src="c.iconUrl" :alt="c.name" class="w-full h-full object-cover" />
              <span v-else class="text-[12px] font-bold text-gray-400">{{ c.name.charAt(0).toUpperCase() }}</span>
            </div>
            <span class="text-[13px] text-gray-300 truncate">{{ c.name }}</span>
          </div>
        </div>
      </div>

      <!-- Amigos en común -->
      <div class="mx-3 mb-2">
        <div v-if="isLoadingExtra" class="h-[42px] rounded-xl bg-white/[0.03] animate-pulse"></div>
        <button
          v-else
          @click="mutualFriends.length > 0 && (showFriends = !showFriends)"
          :disabled="mutualFriends.length === 0"
          class="w-full flex items-center justify-between px-3 py-2.5 bg-[#141518] border border-white/[0.06] rounded-xl transition-colors disabled:cursor-default"
          :class="mutualFriends.length > 0 ? 'hover:bg-[#191a1e]' : ''"
        >
          <span class="text-[12px] font-semibold text-gray-300">
            {{ mutualFriends.length > 0 ? `Amigos en común — ${mutualFriends.length}` : 'Sin amigos en común' }}
          </span>
          <svg
            v-if="mutualFriends.length > 0"
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4 text-gray-500 transition-transform"
            :class="{ 'rotate-90': showFriends }"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <div v-if="showFriends && mutualFriends.length > 0" class="mt-1.5 flex flex-col gap-1">
          <button
            v-for="f in mutualFriends"
            :key="f.id"
            @click="profileStore.open(f.id)"
            class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors text-left"
          >
            <UserAvatar :username="f.username" :avatarUrl="f.avatarUrl" :status="f.status" size="xs" :showStatus="true" />
            <span class="text-[13px] text-gray-300 truncate">{{ f.username }}</span>
          </button>
        </div>
      </div>

      <!-- Acción: ver perfil completo -->
      <div class="mx-3 mt-1 mb-4">
        <button
          @click="openProfile"
          class="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-semibold py-2.5 rounded-xl transition-colors duration-200 shadow-sm shadow-indigo-500/20"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          Ver perfil completo
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, ref } from 'vue';
import { useUserProfileStore } from '../stores/userProfile';
import { useChatStore } from '../stores/chat';
import type { DMFriend } from '../stores/chat';
import { useUserBanner } from '../composables/useUserBanner';
import { useReadableAccent } from '../composables/useReadableAccent';
import { loadDMProfileExtra, getDMProfileExtra, isDMProfileExtraLoading } from '../composables/dmProfileCache';
import UserAvatar from './UserAvatar.vue';

const props = defineProps<{
  user: DMFriend;
}>();

const profileStore = useUserProfileStore();
const chatStore = useChatStore();

const showFriends = ref(false);
const showCommunities = ref(false);

// El DM activo del store recibe parches en vivo (user_updated). Si coincide con
// este usuario, sus campos enriquecidos tienen prioridad para refrescar al vuelo.
const liveUser = computed<DMFriend | null>(() =>
  chatStore.activeDMUser?.id === props.user.id ? chatStore.activeDMUser : null
);

const displayUsername = computed(() => liveUser.value?.username ?? props.user.username);
const displayTag = computed(() => props.user.tag);
const displayAvatarUrl = computed(() => liveUser.value?.avatarUrl ?? props.user.avatarUrl);
const displayStatus = computed(() => liveUser.value?.status ?? props.user.status);

// bio/banner/pronouns/etc. no vienen en la lista de conversaciones — se piden
// aparte (cacheados por usuario, ver dmProfileCache) y llegan más tarde.
const extra = computed(() => getDMProfileExtra(props.user.id));
const isLoadingExtra = computed(() => isDMProfileExtraLoading(props.user.id));
const mutualFriends = computed(() => extra.value?.mutualFriends ?? []);
const mutualCommunities = computed(() => extra.value?.mutualCommunities ?? []);

// Pick the SOURCE first (live store if it matches this user, else the cached
// extra payload), THEN read the field — so a live `null` (user cleared the
// field) correctly overrides a stale cached value instead of falling through.
const richFields = computed(() => {
  if (liveUser.value) return liveUser.value;
  if (extra.value) return extra.value;
  return null;
});

const bio = computed(() => richFields.value?.bio ?? null);
const pronouns = computed(() => richFields.value?.pronouns ?? null);
const customStatus = computed(() => richFields.value?.customStatus ?? null);
const accentColor = computed(() => richFields.value?.accentColor ?? null);

// Acento legible: cae a blanco si el contraste contra la tarjeta es bajo.
const { nameStyle } = useReadableAccent(accentColor);

const memberSince = computed(() => {
  if (!extra.value?.createdAt) return '—';
  return new Date(extra.value.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
});

// Banner resuelto vía composable compartido (imagen > color > degradado).
// Usa la misma fuente que los demás campos para que un null en vivo (banner
// quitado) anule el valor obtenido en lugar de caer en él.
const { bannerStyle } = useUserBanner(() => ({
  bannerUrl: richFields.value?.bannerUrl ?? null,
  bannerColor: richFields.value?.bannerColor ?? null,
  username: displayUsername.value,
}));

const openProfile = () => {
  profileStore.open(props.user.id);
};

onMounted(() => {
  showFriends.value = false;
  showCommunities.value = false;
  loadDMProfileExtra(props.user.id);
});

// Recargar cuando cambia el usuario del DM
watch(() => props.user.id, (id) => {
  showFriends.value = false;
  showCommunities.value = false;
  loadDMProfileExtra(id);
});
</script>

<style scoped>
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
