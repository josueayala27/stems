<script setup lang="ts">
import { css } from 'styled-system/css'
import { ScrollArea } from '~/ui'

defineSlots<{ default?: () => unknown }>()

const scroll = css({ h: 'full' })
const inner = css({ maxW: '[1200px]', mx: 'auto', px: '8', py: '6' })
</script>

<template>
  <ScrollArea :class="scroll">
    <div :class="inner"><slot /></div>
  </ScrollArea>
</template>
