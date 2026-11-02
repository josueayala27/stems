<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import ArrangePage from '~/workspaces/ArrangePage.vue'

const route = useRoute()
const songId = computed(() => String(route.params.songId ?? ''))
</script>

<template>
  <ArrangePage :key="songId" :song-id="songId" />
</template>
