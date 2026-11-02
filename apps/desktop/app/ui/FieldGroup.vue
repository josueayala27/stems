<script setup lang="ts">
import { cva } from 'styled-system/css'

withDefaults(defineProps<{ columns?: 2 | 3 | 4 }>(), { columns: 2 })

// Equal-width columns for paired controls (W/H, X/Y, padding sides).
const group = cva({
  base: { display: 'grid', gap: '1.5', w: 'full', minW: '0' },
  variants: {
    columns: {
      2: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
      3: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
      4: { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' },
    },
  },
})
</script>

<template>
  <div :class="group({ columns })"><slot /></div>
</template>
