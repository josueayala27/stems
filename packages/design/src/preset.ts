import { definePreset } from '@pandacss/dev'

// Stems design system. Tokens copied from Lumen's `@lumen/design` (itself copied from Malla Builder) and kept
// identical, except the accent and brand colours, which use the blue `cobalt` ramp instead of orange.
// Each app supplies `include`, `outdir`, `preflight` and `strictTokens` in its own config.
export const stemsPreset = definePreset({
  name: 'stems',
  conditions: {
    extend: {
      light: '[data-theme=light] &',
      dark: '[data-theme=dark] &, :root:not([data-theme]) &',
      selected: '&[data-selected=true]',
      active: '&:is(:active, [data-active=true])',
    },
  },

  globalCss: {
    'html, body, #__nuxt': {
      height: 'full',
      overflow: 'hidden',
    },
    // The viewport stays scrollable by focus() / scrollIntoView even when hidden, so nothing may
    // grow the document past it: anything appended to <body> (Nuxt DevTools' panel, a teleported
    // surface) is clipped by body itself, not by the viewport, or the editor shell gets shoved up
    // (QA-UI-2). Fixed surfaces (popovers, dialogs) are not clipped by this.
    'html:not([data-scroll=page]) body': { position: 'relative', overflow: 'clip' },
    // The marketing pages scroll the document itself (the editor app keeps it fixed).
    'html[data-scroll=page], html[data-scroll=page] body, html[data-scroll=page] #__nuxt': {
      height: 'auto',
      overflow: 'visible',
    },
    // Scroll-revealed content stays hidden from first paint until its animation has set the start state.
    'html.reveal-pending [data-reveal]': { visibility: 'hidden' },
    body: {
      bg: 'bg.app',
      color: 'fg.default',
      fontFamily: 'ui',
      textStyle: 'ui.sm',
      WebkitFontSmoothing: 'antialiased',
      userSelect: 'none',
    },
    '::selection': { bg: 'accent.muted' },
    '*:focus-visible': { outline: '2px solid token(colors.accent.default)', outlineOffset: '[1px]' },
  },

  theme: {
    extend: {
      keyframes: {
        'landing-marquee': { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        'landing-blink': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0 } },
      },
      tokens: {
        fonts: {
          // Inter everywhere. `display` stays a separate token so titles can change face on their own later.
          ui: { value: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif' },
          display: { value: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif' },
          mono: { value: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace' },
        },
        colors: {
          // Neutral ramp anchored on the brand neutrals: Wild Sand (50), Iron (200), Woodsmoke (800).
          ink: {
            0: { value: '#ffffff' },
            50: { value: '#f6f6f6' },
            100: { value: '#ebebeb' },
            200: { value: '#cccccc' },
            300: { value: '#a6a6a6' },
            400: { value: '#8a8a8a' },
            500: { value: '#6b6b6b' },
            600: { value: '#3d3d3d' },
            700: { value: '#2c2c2c' },
            750: { value: '#242424' },
            800: { value: '#1a1a1a' },
            850: { value: '#151515' },
            900: { value: '#101010' },
            950: { value: '#0a0a0a' },
          },
          // Brand palette (Malla brand guide, Nov 2025).
          orange: {
            400: { value: '#fe8224' },
            500: { value: '#fe5900' },
            600: { value: '#e54f00' },
            700: { value: '#c84300' },
            // Ember: the dark end of the ramp. Paprika (#95122c) sits at hue 18° in OKLCH, a pinkish crimson that clashes
            // with the orange (40°) wherever the two meet in a gradient. Ember keeps Paprika's lightness on the orange's
            // own hue path (30°), so dark-to-orange gradients read as one warm family.
            800: { value: '#97271b' },
          },
          paprika: { 500: { value: '#95122c' } },
          corvette: { 200: { value: '#ffd9a8' } },
          // Stems accent ramp. 500 is the accent; 600 is the darkest step that still keeps ink text at WCAG AA
          // (4.55:1), so hovered buttons stay legible. 800 is the dark end for gradients, as Ember is for orange.
          cobalt: {
            400: { value: '#5c97ff' },
            500: { value: '#2f7bff' },
            600: { value: '#2a72f5' },
            700: { value: '#1f62d6' },
            800: { value: '#0f2f73' },
          },
          // Pale tint of the cobalt ramp: the light stop of the brand gradients (Corvette's role for orange).
          mist: { 200: { value: '#cfe0ff' } },
          blue: {
            400: { value: '#3daaff' },
            500: { value: '#0099ff' },
          },
          violet: { 500: { value: '#8b5cf6' } },
          green: { 500: { value: '#22c55e' } },
          amber: { 500: { value: '#f59e0b' } },
          red: { 500: { value: '#ef4444' } },
        },
        gradients: {
          // The four brand gradients, drawn top-left to bottom-right. Same names, angles and stops as Lumen's, with the
          // orange stops swapped for the cobalt ramp: dark stop cobalt.800, light stop mist.200.
          ember: { value: 'linear-gradient(165deg, #1a1a1a 20%, #0f2f73)' },
          blaze: { value: 'linear-gradient(165deg, #5c97ff, #2f7bff 50%, #0f2f73)' },
          glow: { value: 'linear-gradient(165deg, #cfe0ff 15%, #2f7bff)' },
          dawn: { value: 'linear-gradient(165deg, #f6f6f6 25%, #cfe0ff 55%, #5c97ff)' },
          // The neutral surface gradient for marketing panels and cards. Brand gradients are kept for one or two moments
          // per page (hero, finale); everything else sits on graphite so the blue accent stays rare and reads as action.
          graphite: { value: 'linear-gradient(160deg, #202020 0%, #141414 55%, #0e0e0e 100%)' },
          // Soft top highlight laid over filled buttons and tiles: `background: 'token(gradients.sheen), <color>'`.
          sheen: { value: 'linear-gradient(180deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0) 63.53%)' },
        },
        radii: {
          xs: { value: '4px' },
          sm: { value: '6px' },
          md: { value: '8px' },
          lg: { value: '12px' },
          xl: { value: '16px' },
          full: { value: '9999px' },
        },
        sizes: {
          // Control heights: compact editor density.
          control: {
            sm: { value: '24px' },
            md: { value: '28px' },
            lg: { value: '32px' },
          },
          toolbar: { value: '48px' },
          sidebar: { value: '260px' },
          inspector: { value: '264px' },
        },
        durations: {
          instant: { value: '80ms' },
          fast: { value: '140ms' },
          normal: { value: '220ms' },
          slow: { value: '360ms' },
        },
        easings: {
          standard: { value: 'cubic-bezier(0.2, 0, 0, 1)' },
          emphasized: { value: 'cubic-bezier(0.3, 0, 0, 1)' },
          spring: { value: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
        },
        zIndex: {
          canvas: { value: 0 },
          overlay: { value: 10 },
          chrome: { value: 20 },
          modal: { value: 30 },
          popover: { value: 40 },
          tooltip: { value: 50 },
          toast: { value: 60 },
        },
      },

      semanticTokens: {
        colors: {
          bg: {
            // Light app background sits a step above ink.100 so inputs (`bg.input`) still read as fields on it.
            app: { value: { base: '{colors.ink.950}', _light: '{colors.ink.50}' } },
            canvas: { value: { base: '{colors.ink.900}', _light: '{colors.ink.50}' } },
            panel: { value: { base: '{colors.ink.850}', _light: '{colors.ink.0}' } },
            elevated: { value: { base: '{colors.ink.800}', _light: '{colors.ink.0}' } },
            subtle: { value: { base: '{colors.ink.750}', _light: '{colors.ink.100}' } },
            hover: { value: { base: '{colors.ink.750}', _light: '{colors.ink.100}' } },
            active: { value: { base: '{colors.ink.700}', _light: '{colors.ink.200}' } },
            input: { value: { base: '{colors.ink.800}', _light: '{colors.ink.100}' } },
            backdrop: { value: { base: 'rgba(0,0,0,0.55)', _light: 'rgba(15,15,20,0.32)' } },
          },
          fg: {
            default: { value: { base: '{colors.ink.50}', _light: '{colors.ink.900}' } },
            muted: { value: { base: '{colors.ink.300}', _light: '{colors.ink.500}' } },
            // ink.400 on the dark surfaces keeps meta text at WCAG AA (5.3:1 on bg.panel); ink.500 was 3.4:1.
            subtle: { value: { base: '{colors.ink.400}', _light: '{colors.ink.400}' } },
            onAccent: { value: '{colors.ink.0}' },
          },
          border: {
            default: { value: { base: '{colors.ink.750}', _light: '{colors.ink.200}' } },
            strong: { value: { base: '{colors.ink.600}', _light: '{colors.ink.300}' } },
          },
          accent: {
            default: { value: '{colors.cobalt.500}' },
            // Hover and pressed darken the blue along the cobalt ramp.
            hover: { value: '{colors.cobalt.600}' },
            pressed: { value: '{colors.cobalt.700}' },
            muted: { value: 'color-mix(in srgb, {colors.cobalt.500} 22%, transparent)' },
            // A lighter tint for badges and icon wells on dark surfaces, where 22% reads too heavy.
            soft: { value: 'color-mix(in srgb, {colors.cobalt.500} 13%, transparent)' },
            // Text and icons on a blue fill. Ink, not white: white on #2f7bff is 3.9:1 and fails WCAG AA, ink is 5.1:1.
            fg: { value: '{colors.ink.950}' },
          },
          brand: {
            blue: { value: '{colors.cobalt.500}' },
            sky: { value: '{colors.cobalt.400}' },
            deep: { value: '{colors.cobalt.800}' },
            mist: { value: '{colors.mist.200}' },
          },
          component: { default: { value: '{colors.violet.500}' } },
          // Timeline panel bars: one hue per step, muted toward ink so white labels stay legible.
          track: {
            violet: { value: 'color-mix(in srgb, {colors.violet.500} 62%, {colors.ink.800})' },
            blue: { value: 'color-mix(in srgb, {colors.blue.400} 55%, {colors.ink.800})' },
            red: { value: 'color-mix(in srgb, {colors.red.500} 55%, {colors.ink.800})' },
            amber: { value: 'color-mix(in srgb, {colors.amber.500} 50%, {colors.ink.800})' },
            green: { value: 'color-mix(in srgb, {colors.green.500} 50%, {colors.ink.800})' },
            orange: { value: 'color-mix(in srgb, {colors.orange.500} 55%, {colors.ink.800})' },
          },
          success: {
            default: { value: '{colors.green.500}' },
            muted: { value: 'color-mix(in srgb, {colors.green.500} 18%, transparent)' },
          },
          warning: {
            default: { value: '{colors.amber.500}' },
            muted: { value: 'color-mix(in srgb, {colors.amber.500} 18%, transparent)' },
          },
          danger: {
            default: { value: '{colors.red.500}' },
            muted: { value: 'color-mix(in srgb, {colors.red.500} 18%, transparent)' },
          },
          info: {
            default: { value: '{colors.blue.400}' },
            muted: { value: 'color-mix(in srgb, {colors.blue.400} 18%, transparent)' },
          },
          selection: {
            // Selection follows the accent (blue in Stems).
            outline: { value: '{colors.cobalt.500}' },
            hover: { value: 'color-mix(in srgb, {colors.cobalt.500} 60%, transparent)' },
          },
          live: {
            default: { value: '{colors.red.500}' },
            muted: { value: 'color-mix(in srgb, {colors.red.500} 18%, transparent)' },
          },
          output: {
            bg: { value: '{colors.ink.950}' },
            guide: { value: 'color-mix(in srgb, {colors.ink.0} 24%, transparent)' },
            safe: { value: 'color-mix(in srgb, {colors.cobalt.500} 42%, transparent)' },
          },
          stage: {
            bg: { value: '{colors.ink.950}' },
            panel: { value: '{colors.ink.900}' },
            next: { value: '{colors.ink.800}' },
          },
        },
        shadows: {
          popover: {
            value: {
              base: '0 0 0 1px {colors.ink.700}, 0 12px 32px -8px rgba(0,0,0,0.6), 0 4px 12px -4px rgba(0,0,0,0.5)',
              _light: '0 0 0 1px {colors.ink.200}, 0 12px 32px -8px rgba(0,0,0,0.18)',
            },
          },
          artboard: { value: '0 0 0 1px rgba(255,255,255,0.06), 0 20px 60px -20px rgba(0,0,0,0.7)' },
        },
      },

      textStyles: {
        ui: {
          xs: { value: { fontSize: '11px', lineHeight: '16px', fontWeight: '500', letterSpacing: '0.005em' } },
          sm: { value: { fontSize: '12px', lineHeight: '16px', fontWeight: '500' } },
          md: { value: { fontSize: '13px', lineHeight: '20px', fontWeight: '500' } },
          label: { value: { fontSize: '11px', lineHeight: '16px', fontWeight: '600', letterSpacing: '0.01em' } },
          title: { value: { fontSize: '14px', lineHeight: '20px', fontWeight: '600', letterSpacing: '-0.005em' } },
          mono: { value: { fontFamily: 'mono', fontSize: '11px', lineHeight: '16px' } },
        },
        // Marketing type scale (landing and other public pages). Inter throughout; big sizes track tighter.
        display: {
          hero: { value: { fontFamily: 'display', fontWeight: '600', fontSize: 'clamp(48px, 9vw, 128px)', lineHeight: '0.95', letterSpacing: '-0.05em' } },
          xl: { value: { fontFamily: 'display', fontWeight: '600', fontSize: 'clamp(40px, 6vw, 84px)', lineHeight: '1', letterSpacing: '-0.045em' } },
          lg: { value: { fontFamily: 'display', fontWeight: '600', fontSize: 'clamp(32px, 4.2vw, 56px)', lineHeight: '1.05', letterSpacing: '-0.04em' } },
          md: { value: { fontFamily: 'display', fontWeight: '500', fontSize: 'clamp(24px, 2.6vw, 32px)', lineHeight: '1.15', letterSpacing: '-0.025em' } },
        },
        body: {
          lg: { value: { fontSize: 'clamp(17px, 1.5vw, 20px)', lineHeight: '1.55', fontWeight: '400' } },
          md: { value: { fontSize: '16px', lineHeight: '1.6', fontWeight: '400' } },
          sm: { value: { fontSize: '14px', lineHeight: '1.55', fontWeight: '400' } },
          title: { value: { fontSize: '18px', lineHeight: '1.3', fontWeight: '600', letterSpacing: '-0.01em' } },
          eyebrow: { value: { fontSize: '13px', lineHeight: '1', fontWeight: '600', letterSpacing: '0.02em' } },
        },
      },
    },
  },
})
