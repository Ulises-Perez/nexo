<template>
  <div class="avatar-container relative flex-shrink-0" :class="containerSizeClass">
    <div
      class="avatar-squircle w-full h-full overflow-hidden flex items-center justify-center font-bold text-white select-none"
      :class="[sizeClass]"
      :style="avatarStyle"
    >
      <img v-if="avatarUrl" :src="avatarUrl" :alt="username" class="w-full h-full object-cover">
      <span v-else class="avatar-letter" :class="letterSizeClass">{{ displayLetter }}</span>
    </div>
    <div
      v-if="showStatus"
      class="status-dot absolute border-[2.5px]"
      :class="[statusSizeClass, statusColorClass]"
      :style="{ borderColor: statusBorderColor }"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  username: string;
  avatarUrl?: string | null;
  status?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showStatus?: boolean;
  // Color of the ring around the status dot — should match the surface the
  // avatar sits on (sidebar default #1a1b1e, profile card/modal #1e1f23).
  statusBorderColor?: string;
}>(), {
  size: 'md',
  showStatus: true,
  status: 'offline',
  statusBorderColor: '#1a1b1e',
});

const displayLetter = computed(() => props.username?.charAt(0).toUpperCase() || '?');

// Genera un color de fondo basado en el nombre de usuario
const avatarGradient = computed(() => {
  if (props.avatarUrl) return 'transparent';
  
  const gradients = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
    'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
    'linear-gradient(135deg, #f5576c 0%, #ff6a88 100%)',
    'linear-gradient(135deg, #667eea 0%, #00d2ff 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
    'linear-gradient(135deg, #fddb92 0%, #d1fdff 100%)',
    'linear-gradient(135deg, #96fbc4 0%, #f9f586 100%)',
    'linear-gradient(135deg, #cd9cf2 0%, #f6f3ff 100%)',
  ];
  
  let hash = 0;
  const name = props.username || '';
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
});

const avatarStyle = computed(() => {
  if (props.avatarUrl) return {};
  return {
    background: avatarGradient.value,
  };
});

const sizeClass = computed(() => {
  switch (props.size) {
    case 'xs': return 'avatar-xs';
    case 'sm': return 'avatar-sm';
    case 'lg': return 'avatar-lg';
    case 'xl': return 'avatar-xl';
    default: return 'avatar-md';
  }
});

const letterSizeClass = computed(() => {
  switch (props.size) {
    case 'xs': return 'text-[10px]';
    case 'sm': return 'text-xs';
    case 'lg': return 'text-lg';
    case 'xl': return 'text-2xl';
    default: return 'text-sm';
  }
});

const containerSizeClass = computed(() => {
  switch (props.size) {
    case 'xs': return 'w-6 h-6';
    case 'sm': return 'w-9 h-9';
    case 'lg': return 'w-12 h-12';
    case 'xl': return 'w-16 h-16';
    default: return 'w-10 h-10';
  }
});

const statusSizeClass = computed(() => {
  switch (props.size) {
    case 'xs': return 'w-2 h-2';
    case 'sm': return 'w-2.5 h-2.5';
    case 'lg': return 'w-3.5 h-3.5';
    case 'xl': return 'w-4 h-4';
    default: return 'w-3 h-3';
  }
});

const statusColorClass = computed(() => {
  return props.status === 'online' ? 'bg-emerald-400' : 'bg-gray-500';
});
</script>

<style scoped>
.avatar-squircle {
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease;
}

.avatar-squircle:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.avatar-letter {
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  letter-spacing: 0.5px;
}

.avatar-xs {
  width: 24px;
  height: 24px;
}

.avatar-sm {
  width: 36px;
  height: 36px;
}

.avatar-md {
  width: 40px;
  height: 40px;
}

.avatar-lg {
  width: 48px;
  height: 48px;
}

.avatar-xl {
  width: 64px;
  height: 64px;
}

.status-dot {
  border-radius: 50%;
  bottom: -1px;
  right: -1px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2);
}
</style>
