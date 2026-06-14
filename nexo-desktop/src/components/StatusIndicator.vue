<template>
  <span 
    class="status-indicator"
    :class="status"
    :style="{ 
      width: size + 'px', 
      height: size + 'px',
      minWidth: size + 'px',
      minHeight: size + 'px'
    }"
  ></span>
</template>

<script setup lang="ts">
defineProps<{
  status: string;
  size?: number;
}>();
</script>

<style scoped>
.status-indicator {
  @apply rounded-full border-2 border-gray-900 absolute;
  bottom: 0;
  right: 0;
}

.status-indicator.online {
  @apply bg-green-500;
}

.status-indicator.offline {
  @apply bg-gray-500;
}
</style>
