<template>
  <aside class="sidebar bg-[#1a1b1e] text-gray-300 w-60 h-full flex flex-col flex-shrink-0">

    <!-- Home view when no community is active -->
    <div v-if="!activeCommunityId" class="flex-1 flex flex-col overflow-y-hidden w-full h-full">
      <HomeSidebar />
    </div>

    <!-- Community view when a community is active -->
    <div v-else class="flex-1 overflow-y-auto flex flex-col">
      <template v-for="community in communities" :key="'col2-'+community.id">
        <div v-if="community.id === activeCommunityId" class="flex-1 flex flex-col">

          <!-- Header & Dropdown -->
          <CommunityHeader
            :community="community"
            :currentUserId="currentUserId"
            :isOpen="activeDropdownId === community.id"
            @toggle="toggleDropdown(community.id)"
            @generate-invite="$emit('generate-invite', community.id)"
            @leave="handleLeave"
            @open-settings="$emit('open-settings', community.id)"
            @create-channel="$emit('create-channel', community.id, '')"
            @create-category="$emit('create-category', community.id)"
          />

          <!-- Channel list -->
          <ChannelList
            :categories="community.categories"
            :activeChannelId="activeChannelId"
            :communityId="community.id"
            @select-channel="$emit('select-channel', $event)"
            @create-channel="$emit('create-channel', community.id, $event)"
          />

        </div>
      </template>
    </div>

    <!-- Panel de voz (visible mientras estés conectado, en cualquier vista) -->
    <VoicePanel />
  </aside>
</template>

<script setup lang="ts">
import HomeSidebar from './HomeSidebar.vue';
import CommunityHeader from './CommunityHeader.vue';
import ChannelList from './ChannelList.vue';
import VoicePanel from './VoicePanel.vue';
import type { Community } from '../stores/community';

defineProps<{
  communities: Community[];
  activeCommunityId: string | null;
  activeChannelId: string | null;
  activeDropdownId: string | null;
  currentUserId?: string;
}>();

const emit = defineEmits<{
  (e: 'select-channel', channelId: string): void;
  (e: 'toggle-dropdown', id: string): void;
  (e: 'generate-invite', communityId: string): void;
  (e: 'leave', communityId: string, communityName: string): void;
  (e: 'open-settings', communityId: string): void;
  (e: 'create-channel', communityId: string, categoryId: string): void;
  (e: 'create-category', communityId: string): void;
}>();

const toggleDropdown = (id: string) => {
  emit('toggle-dropdown', id);
};

const handleLeave = (communityId: string, communityName: string) => {
  emit('leave', communityId, communityName);
};
</script>
