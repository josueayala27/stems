<script setup lang="ts">
import { computed } from 'vue'
import { createTransitionHooks, type TransitionPreset } from './transitions'

const props = withDefaults(
  defineProps<{
    preset?: TransitionPreset
    /** Floating placement used by `popover` / `tooltip` to pick the transform origin. */
    placement?: string
    appear?: boolean
  }>(),
  { preset: 'fade', placement: undefined, appear: false },
)

const hooks = computed(() => createTransitionHooks(props.preset, { placement: props.placement }))
</script>

<template>
  <Transition
    :css="false"
    :appear="appear"
    @before-enter="hooks.onBeforeEnter"
    @enter="hooks.onEnter"
    @leave="hooks.onLeave"
    @enter-cancelled="hooks.onEnterCancelled"
    @leave-cancelled="hooks.onLeaveCancelled"
  >
    <slot />
  </Transition>
</template>
