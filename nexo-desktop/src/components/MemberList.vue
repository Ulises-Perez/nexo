<template>
  <aside class="w-60 bg-[#1a1b1e] border-l border-white/[0.04] flex-shrink-0 overflow-y-auto custom-scrollbar py-4 px-2">
    <div v-if="isLoading" class="flex justify-center py-8">
      <div class="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
    </div>

    <template v-else>
      <!-- En línea -->
      <div v-if="onlineMembers.length > 0" class="mb-4">
        <h4 class="text-[11px] font-bold text-gray-500 uppercase tracking-widest px-2 mb-2">
          En línea — {{ onlineMembers.length }}
        </h4>
        <div
          v-for="member in onlineMembers"
          :key="member.id"
          @click="profileStore.open(member.userId, communityId)"
          class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors cursor-pointer"
        >
          <UserAvatar
            :username="member.user.username"
            :avatarUrl="member.user.avatarUrl"
            :status="member.user.status"
            size="sm"
            :showStatus="true"
          />
          <div class="min-w-0">
            <p class="text-[13px] font-semibold truncate" :style="{ color: highestRoleColor(member) }">
              {{ member.user.username }}
              <span v-if="member.isOwner" class="text-[10px]" title="Dueño">👑</span>
            </p>
          </div>
        </div>
      </div>

      <!-- Desconectados -->
      <div v-if="offlineMembers.length > 0">
        <h4 class="text-[11px] font-bold text-gray-500 uppercase tracking-widest px-2 mb-2">
          Desconectados — {{ offlineMembers.length }}
        </h4>
        <div
          v-for="member in offlineMembers"
          :key="member.id"
          @click="profileStore.open(member.userId, communityId)"
          class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors opacity-40 cursor-pointer"
        >
          <UserAvatar
            :username="member.user.username"
            :avatarUrl="member.user.avatarUrl"
            :status="member.user.status"
            size="sm"
            :showStatus="false"
          />
          <div class="min-w-0">
            <p class="text-[13px] font-semibold truncate" :style="{ color: highestRoleColor(member) }">
              {{ member.user.username }}
              <span v-if="member.isOwner" class="text-[10px]" title="Dueño">👑</span>
            </p>
          </div>
        </div>
      </div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useCommunityStore } from '../stores/community';
import { useUserProfileStore } from '../stores/userProfile';
import type { CommunityMember } from '../stores/community';
import UserAvatar from './UserAvatar.vue';

defineProps<{
  communityId: string;
}>();

// Fuente única: los miembros de la comunidad activa viven en el store
// (se cargan al cambiar de comunidad y se parchean con user_updated/community_updated)
const communityStore = useCommunityStore();
const profileStore = useUserProfileStore();

const isLoading = computed(() => communityStore.activeMembers.length === 0 && communityStore.isLoading);

const onlineMembers = computed(() => communityStore.activeMembers.filter(m => m.user.status === 'online'));
const offlineMembers = computed(() => communityStore.activeMembers.filter(m => m.user.status !== 'online'));

const highestRoleColor = (member: CommunityMember): string => {
  const colored = member.roles.find(r => r.color);
  return colored?.color || '#dbdee1';
};
</script>
