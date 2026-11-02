<script setup lang="ts">
import { css } from 'styled-system/css'

defineProps<{ height?: string }>()

const block = css({
  borderRadius: 'md',
  bg: 'bg.panel',
  borderWidth: '1px',
  borderColor: 'border.default',
})
</script>

<template>
  <div :class="[block, 'skeleton-block']" :style="{ height: height ?? '48px' }" aria-hidden="true" />
</template>

<style scoped>
.skeleton-block {
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}
@keyframes skeleton-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-block {
    animation: none;
  }
}
</style>
