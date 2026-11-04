// Device, rate and buffer of the current rig, as pick lists. Changing one reopens the output.
import type { Rig } from '@stems/schema'
import { computed } from 'vue'
import type { SelectOption } from '~/ui'
import { usePlayer } from '~/engine/player'

/** The empty id stands for "system default output" (`deviceId: null`). */
export const DEFAULT_DEVICE = ''
const BUFFERS = [64, 128, 256, 512, 1024] as const

export function useAudioSetup() {
  const player = usePlayer()
  const rig = computed(() => player.rig.value)
  const output = computed(() => player.output.value)

  const selectedDevice = computed(() => {
    const id = rig.value?.deviceId
    return player.devices.value.find((device) => (id ? device.id === id : device.isDefault)) ?? null
  })

  const deviceOptions = computed<SelectOption<string>[]>(() => [
    { value: DEFAULT_DEVICE, label: 'System default' },
    ...player.devices.value.map((device) => ({ value: device.id, label: `${device.name} · ${device.channels} out` })),
  ])

  /** 0 stands for the device's default rate. */
  const rateOptions = computed<SelectOption<number>[]>(() => [
    { value: 0, label: selectedDevice.value?.defaultSampleRate ? `Default (${selectedDevice.value.defaultSampleRate / 1000} kHz)` : 'Default rate' },
    ...(selectedDevice.value?.sampleRates ?? [44_100, 48_000, 96_000]).map((value) => ({ value, label: `${value / 1000} kHz` })),
  ])

  const bufferOptions = computed<SelectOption<number>[]>(() =>
    BUFFERS.filter((value) => {
      const device = selectedDevice.value
      return (!device?.minBuffer || value >= device.minBuffer) && (!device?.maxBuffer || value <= device.maxBuffer)
    }).map((value) => ({ value, label: `${value} · ${((value / (output.value?.sampleRate || 48_000)) * 1000).toFixed(1)} ms` })),
  )

  function apply(change: (current: Rig) => Rig) {
    if (rig.value) void player.applyRig(change(rig.value))
  }

  return {
    rig,
    output,
    deviceOptions,
    rateOptions,
    bufferOptions,
    device: computed(() => rig.value?.deviceId ?? DEFAULT_DEVICE),
    rate: computed(() => rig.value?.sampleRate ?? 0),
    buffer: computed(() => rig.value?.bufferSize),
    chooseDevice(id: string | undefined) {
      if (id === undefined) return
      const device = player.devices.value.find((entry) => entry.id === id)
      apply((current) => ({ ...current, deviceId: id === DEFAULT_DEVICE ? null : id, device: device?.name ?? '' }))
    },
    chooseRate(rate: number | undefined) {
      if (rate !== undefined) apply((current) => ({ ...current, sampleRate: rate === 0 ? null : rate }))
    },
    chooseBuffer(size: number | undefined) {
      if (size !== undefined) apply((current) => ({ ...current, bufferSize: size as Rig['bufferSize'] }))
    },
  }
}
