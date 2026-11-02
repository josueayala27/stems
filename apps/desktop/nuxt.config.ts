import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: ['@nuxt/fonts', '@nuxt/icon/module'],
  compatibilityDate: '2026-10-01',
  devtools: { enabled: true },

  // Explicit imports everywhere: macros from `#imports`, components from `#components`.
  imports: { autoImport: false },
  components: { dirs: [] },

  ssr: false,
  app: {
    // Tauri serves the built files at the protocol root.
    baseURL: '/',
    head: { title: 'Stems' },
  },

  css: ['~/assets/css/panda.css'],
  postcss: { plugins: { '@pandacss/dev/postcss': {} } },
  alias: {
    'styled-system': fileURLToPath(new URL('./styled-system', import.meta.url)),
  },

  fonts: {
    families: [
      { name: 'Inter', provider: 'google', weights: [300, 400, 500, 600, 700] },
      { name: 'JetBrains Mono', provider: 'google', weights: [400, 500] },
    ],
  },

  icon: {
    clientBundle: { scan: { globInclude: ['**/*.{vue,ts}'] } },
    localApiEndpoint: '/_nuxt_icon',
  },

  vite: {
    optimizeDeps: {
      include: [
        '@floating-ui/vue',
        '@tauri-apps/plugin-sql',
        '@vueuse/core',
        'gsap',
        'gsap/CustomEase',
        'gsap/Flip',
        'gsap/ScrollSmoother',
        'gsap/ScrollTrigger',
        'gsap/SplitText',
        'zod',
      ],
    },
  },

  nitro: { preset: 'static' },
})
