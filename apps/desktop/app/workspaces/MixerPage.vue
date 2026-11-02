<script setup lang="ts">
import { css } from 'styled-system/css'
import { EmptyState, Panel, PanelSection } from '~/ui'

// Channel strips for the loaded song on the left, buses and routing on the right.
const root = css({ display: 'grid', gridTemplateColumns: '[1fr 300px]', h: 'full', minH: '0' })
const strips = css({ display: 'flex', flexDirection: 'column', minW: '0', minH: '0', bg: 'bg.canvas' })
const stripRow = css({ flex: '1', minH: '0', display: 'flex', gap: '2', p: '4', overflowX: 'auto' })
const strip = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '3',
  w: '[72px]',
  flexShrink: '0',
  py: '3',
  borderRadius: 'md',
  borderWidth: '1px',
  borderStyle: 'dashed',
  borderColor: 'border.default',
})
const fader = css({ flex: '1', w: '[6px]', borderRadius: 'full', bg: 'bg.subtle' })
const knob = css({ w: '[28px]', h: '[28px]', borderRadius: 'full', bg: 'bg.subtle' })
const label = css({ w: '[40px]', h: '[8px]', borderRadius: 'xs', bg: 'bg.subtle' })
const overlay = css({ position: 'relative', flex: '1', minH: '0', display: 'flex' })
const center = css({ position: 'absolute', inset: '0', display: 'grid', placeItems: 'center' })
const card = css({ borderRadius: 'lg', bg: 'bg.panel', borderWidth: '1px', borderColor: 'border.default', boxShadow: 'popover' })
</script>

<template>
  <div :class="root">
    <section :class="strips" aria-label="Channel strips">
      <div :class="overlay">
        <div :class="stripRow" aria-hidden="true">
          <div v-for="index in 8" :key="index" :class="strip">
            <span :class="knob" />
            <span :class="fader" />
            <span :class="label" />
          </div>
        </div>
        <div :class="center">
          <div :class="card">
            <EmptyState icon="lucide:sliders-vertical" title="No song loaded" description="Faders, mute, solo and meters for each track appear here." />
          </div>
        </div>
      </div>
    </section>
    <Panel title="Buses" bordered="left">
      <PanelSection title="Bus meters">
        <EmptyState icon="lucide:activity" title="No buses" description="Add buses such as IEM, FOH and Click to your rig." size="sm" />
      </PanelSection>
      <PanelSection title="Routing" flush>
        <EmptyState icon="lucide:cable" title="No routing" description="Map each bus to device output channels." size="sm" />
      </PanelSection>
    </Panel>
  </div>
</template>
