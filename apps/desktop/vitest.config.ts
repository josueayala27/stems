import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      'styled-system': `${root}styled-system`,
      '~': `${root}app`,
      '#components': `${root}test/shims/components.ts`,
      '#imports': `${root}test/shims/imports.ts`,
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['app/**/*.test.ts'],
  },
})
