<script setup lang="ts">
import { Icon } from '#components'
import { css } from 'styled-system/css'

withDefaults(defineProps<{ size?: number }>(), { size: 14 })

const spinner = css({ animation: 'spin', color: 'currentColor', flexShrink: 0 })
</script>

<template>
  <Icon name="lucide:loader-circle" :size="size" :class="spinner" aria-hidden="true" />
</template>
