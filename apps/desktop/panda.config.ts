import { defineConfig } from '@pandacss/dev'
import { stemsPreset } from '@stems/design'

export default defineConfig({
  presets: ['@pandacss/preset-base', '@pandacss/preset-panda', stemsPreset],
  preflight: true,
  strictTokens: true,
  include: ['./app/**/*.{vue,ts}'],
  exclude: ['./app/**/*.test.ts', './app/**/*.spec.ts'],
  outdir: 'styled-system',
})
