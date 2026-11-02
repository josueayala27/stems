<script setup lang="ts">
import { css } from 'styled-system/css'
import { ref } from 'vue'
import {
  ColorField,
  FieldGroup,
  IconButton,
  NumberField,
  Panel,
  PanelSection,
  PropertyRow,
  Select,
  SegmentedControl,
  Slider,
  StatePicker,
  Switch,
  Tabs,
  Textarea,
  type SelectOption,
  type TabItem,
} from '../index'

const emit = defineEmits<{ log: [message: string] }>()

const tab = ref<'design' | 'prototype'>('design')
const tabs: TabItem<'design' | 'prototype'>[] = [
  { value: 'design', label: 'Design' },
  { value: 'prototype', label: 'Prototype' },
]

const layout = ref('stack')
const direction = ref('column')
const gap = ref('12px')
const padding = ref('24px')
const align = ref('start')

const width = ref('100%')
const height = ref('auto')
const minW = ref('')
const x = ref('0px')
const y = ref('120px')
const rotation = ref('0')

const fill = ref('#0099ff')
const tokenFill = ref('var(--brand-500)')
const border = ref('#ffffff1f')

const font = ref('inter')
const fonts: SelectOption[] = [
  { value: 'inter', label: 'Inter' },
  { value: 'geist', label: 'Geist' },
  { value: 'mono', label: 'JetBrains Mono' },
  { value: 'serif', label: 'Instrument Serif' },
]
const weight = ref('500')
const weights: SelectOption[] = [
  { value: '400', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
  { value: '700', label: 'Bold' },
]
const fontSize = ref('16px')
const lineHeight = ref('1.5')
const tracking = ref('-0.01em')
const textAlign = ref('left')

const styleState = ref('default')
const altText = ref('Hero illustration: a stack of colourful frames')

const opacity = ref(100)
const clip = ref(true)

function scrub(phase: 'start' | 'end', field: string): void {
  emit('log', `${field}: scrub ${phase}`)
}

const tabsHeader = css({ w: 'full', mx: '-3', mb: '[-1px]', '& [role=tablist]': { borderBottomWidth: '0' } })
const panel = css({ w: 'inspector', h: '[720px]', flexShrink: 0 })
const rowGap = css({ display: 'flex', alignItems: 'center', gap: '1.5', w: 'full' })
const sliderBox = css({ flex: '1' })
const opacityBox = css({ w: '14', flexShrink: 0 })
const stateBar = css({ px: '3', py: '2', borderBottomWidth: '1px', borderColor: 'border.default' })
const empty = css({ p: '3', color: 'fg.subtle', textStyle: 'ui.sm' })
</script>

<template>
  <Panel :class="panel" bordered="all">
    <template #header>
      <Tabs v-model="tab" :tabs="tabs" size="sm" aria-label="Inspector" :class="tabsHeader" />
    </template>

    <template v-if="tab === 'design'">
      <div :class="stateBar">
        <StatePicker v-model="styleState" :overridden="['hover', 'active']" />
      </div>
      <PanelSection title="Layout" collapsible storage-key="kit.layout">
        <template #actions>
          <IconButton icon="lucide:minus" label="Remove layout" size="sm" />
        </template>
        <PropertyRow label="Type">
          <SegmentedControl
            v-model="layout"
            :options="[
              { value: 'stack', label: 'Stack' },
              { value: 'grid', label: 'Grid' },
              { value: 'free', label: 'Free' },
            ]"
            aria-label="Layout type"
          />
        </PropertyRow>
        <PropertyRow label="Direction">
          <SegmentedControl
            v-model="direction"
            :options="[
              { value: 'row', icon: 'lucide:arrow-right', title: 'Horizontal' },
              { value: 'column', icon: 'lucide:arrow-down', title: 'Vertical' },
              { value: 'wrap', icon: 'lucide:wrap-text', title: 'Wrap' },
            ]"
            aria-label="Direction"
          />
        </PropertyRow>
        <PropertyRow label="Align">
          <SegmentedControl
            v-model="align"
            :options="[
              { value: 'start', icon: 'lucide:align-start-vertical', title: 'Start' },
              { value: 'center', icon: 'lucide:align-center-vertical', title: 'Center' },
              { value: 'end', icon: 'lucide:align-end-vertical', title: 'End' },
              { value: 'stretch', icon: 'lucide:stretch-horizontal', title: 'Stretch' },
            ]"
            aria-label="Align"
          />
        </PropertyRow>
        <PropertyRow label="Gap">
          <FieldGroup>
            <NumberField v-model="gap" icon="lucide:space" :min="0" aria-label="Gap" @scrub-start="scrub('start', 'gap')" @scrub-end="scrub('end', 'gap')" />
            <NumberField v-model="padding" icon="lucide:square-dashed" :min="0" aria-label="Padding" />
          </FieldGroup>
        </PropertyRow>
      </PanelSection>

      <PanelSection title="Size" collapsible storage-key="kit.size">
        <PropertyRow label="Size">
          <FieldGroup>
            <NumberField
              v-model="width"
              label="W"
              :units="['px', '%', 'vw', 'fr', 'auto']"
              :min="0"
              @scrub-start="scrub('start', 'width')"
              @scrub-end="scrub('end', 'width')"
              @commit="(v) => emit('log', `width = ${v}`)"
            />
            <NumberField v-model="height" label="H" :units="['px', '%', 'vh', 'auto']" :min="0" />
          </FieldGroup>
        </PropertyRow>
        <PropertyRow label="Min">
          <FieldGroup>
            <NumberField v-model="minW" label="W" :units="['px', '%']" placeholder="—" :min="0" />
            <NumberField model-value="" label="H" mixed />
          </FieldGroup>
        </PropertyRow>
      </PanelSection>

      <PanelSection title="Position" collapsible storage-key="kit.position">
        <PropertyRow label="Offset">
          <FieldGroup>
            <NumberField v-model="x" label="X" pointer-lock />
            <NumberField v-model="y" label="Y" pointer-lock />
          </FieldGroup>
        </PropertyRow>
        <PropertyRow label="Rotate">
          <FieldGroup>
            <NumberField v-model="rotation" icon="lucide:rotate-cw" :units="['']" :step="1" />
            <div />
          </FieldGroup>
        </PropertyRow>
      </PanelSection>

      <PanelSection title="Fill" collapsible storage-key="kit.fill">
        <template #actions>
          <IconButton icon="lucide:plus" label="Add fill" size="sm" />
        </template>
        <PropertyRow label="Color">
          <ColorField v-model="fill" @scrub-start="scrub('start', 'fill')" @scrub-end="scrub('end', 'fill')" @commit="(v) => emit('log', `fill = ${v}`)" />
        </PropertyRow>
        <PropertyRow label="Token">
          <ColorField v-model="tokenFill" />
        </PropertyRow>
        <PropertyRow label="Border">
          <ColorField v-model="border" />
        </PropertyRow>
      </PanelSection>

      <PanelSection title="Typography" collapsible storage-key="kit.type">
        <PropertyRow label="Font">
          <Select v-model="font" :options="fonts" aria-label="Font family" />
        </PropertyRow>
        <PropertyRow label="Style">
          <FieldGroup>
            <Select v-model="weight" :options="weights" aria-label="Font weight" />
            <NumberField v-model="fontSize" :units="['px', 'rem', 'em']" :min="1" aria-label="Font size" />
          </FieldGroup>
        </PropertyRow>
        <PropertyRow label="Spacing">
          <FieldGroup>
            <NumberField v-model="lineHeight" icon="lucide:baseline" :units="['', 'px', 'em']" :step="0.1" :min="0" aria-label="Line height" />
            <NumberField v-model="tracking" icon="lucide:text-cursor" :units="['em', 'px']" :step="0.01" aria-label="Letter spacing" />
          </FieldGroup>
        </PropertyRow>
        <PropertyRow label="Align">
          <SegmentedControl
            v-model="textAlign"
            :options="[
              { value: 'left', icon: 'lucide:align-left', title: 'Left' },
              { value: 'center', icon: 'lucide:align-center', title: 'Center' },
              { value: 'right', icon: 'lucide:align-right', title: 'Right' },
              { value: 'justify', icon: 'lucide:align-justify', title: 'Justify' },
            ]"
            aria-label="Text align"
          />
        </PropertyRow>
      </PanelSection>

      <PanelSection title="Effects" collapsible storage-key="kit.effects" flush>
        <PropertyRow label="Opacity">
          <div :class="rowGap">
            <div :class="sliderBox">
              <Slider v-model="opacity" aria-label="Opacity" @scrub-start="scrub('start', 'opacity')" @scrub-end="scrub('end', 'opacity')" />
            </div>
            <div :class="opacityBox">
              <NumberField
                :model-value="`${opacity}%`"
                :units="['%']"
                :min="0"
                :max="100"
                :decimals="0"
                aria-label="Opacity"
                @update:model-value="(v) => (opacity = parseFloat(v) || 0)"
              />
            </div>
          </div>
        </PropertyRow>
        <PropertyRow label="Alt text" align="start">
          <Textarea v-model="altText" :min-rows="2" :max-rows="5" placeholder="Describe the image" @commit="(v) => emit('log', `alt = ${v}`)" />
        </PropertyRow>
        <PropertyRow label="Clip">
          <Switch v-model="clip" aria-label="Clip content" />
        </PropertyRow>
      </PanelSection>
    </template>
    <div v-else :class="empty">Prototype settings go here.</div>
  </Panel>
</template>
