<script setup lang="ts">
// Footswitches and controllers: pick the MIDI input, then press Learn next to an action and tap
// the switch. Bindings are saved in the rig, so they follow this machine's setup.
import { CONTROL_ACTIONS, triggerLabel, unbind } from '@stems/core'
import type { ControlAction } from '@stems/schema'
import { css } from 'styled-system/css'
import { computed, onMounted } from 'vue'
import { Button, IconButton, Select, type SelectOption } from '~/ui'
import { usePlayer } from '~/engine/player'

const player = usePlayer()
const rig = computed(() => player.rig.value)
onMounted(() => void player.refreshMidiInputs())

const OFF = ''
const inputOptions = computed<SelectOption<string>[]>(() => {
  const current = rig.value?.midiInput
  const missing = current && !player.midiInputs.value.includes(current) ? [{ value: current, label: `${current} (not connected)` }] : []
  return [{ value: OFF, label: 'No MIDI input' }, ...player.midiInputs.value.map((port) => ({ value: port, label: port })), ...missing]
})
function setInput(port: string | undefined) {
  if (rig.value && port !== undefined) void player.applyRig({ ...rig.value, midiInput: port === OFF ? null : port })
}
function binding(action: ControlAction) {
  return rig.value?.controls.find((entry) => entry.action === action) ?? null
}
function learn(action: ControlAction) {
  player.learning.value = player.learning.value === action ? null : action
}
function clear(action: ControlAction) {
  if (rig.value) void player.applyRig({ ...rig.value, controls: unbind(rig.value.controls, action) })
}

const root = css({ display: 'flex', flexDirection: 'column', gap: '3', p: '3', w: '[360px]' })
const title = css({ textStyle: 'ui.title', color: 'fg.default' })
const hint = css({ textStyle: 'ui.xs', color: 'fg.muted' })
const list = css({ display: 'flex', flexDirection: 'column', gap: '1' })
const row = css({ display: 'grid', gridTemplateColumns: '[1fr auto auto]', alignItems: 'center', gap: '2', minH: '[32px]' })
const name = css({ textStyle: 'ui.sm', color: 'fg.default' })
const trigger = css({ textStyle: 'ui.xs', color: 'fg.muted', fontFamily: 'mono' })
const waiting = css({ textStyle: 'ui.xs', color: 'accent.default' })
</script>

<template>
  <div :class="root">
    <span :class="title">Footswitches</span>
    <Select :model-value="rig?.midiInput ?? OFF" :options="inputOptions" size="sm" :disabled="!rig" aria-label="MIDI input" @update:model-value="setInput" />
    <span :class="hint">
      {{ player.lastPress.value ? `Heard ${triggerLabel({ ...player.lastPress.value })}` : 'Press a switch to check it reaches Stems.' }}
    </span>
    <div :class="list">
      <div v-for="item in CONTROL_ACTIONS" :key="item.action" :class="row">
        <div>
          <div :class="name">{{ item.label }}</div>
          <div v-if="player.learning.value === item.action" :class="waiting">Press the switch…</div>
          <div v-else-if="binding(item.action)" :class="trigger">{{ triggerLabel(binding(item.action)!.trigger) }}</div>
        </div>
        <Button size="sm" :variant="player.learning.value === item.action ? 'primary' : 'secondary'" :disabled="!rig?.midiInput" @click="learn(item.action)">
          {{ player.learning.value === item.action ? 'Cancel' : 'Learn' }}
        </Button>
        <IconButton icon="lucide:x" :label="`Clear ${item.label}`" size="sm" :disabled="!binding(item.action)" @click="clear(item.action)" />
      </div>
    </div>
    <span :class="hint">Switches work while the show is locked. Jumps and vamps land on the quantize boundary, like the keys.</span>
  </div>
</template>
