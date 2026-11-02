# Stems repository guide

Stems is a desktop app for live multitrack playback. Read `docs/architecture/README.md` and the document for the area you touch.

## Conventions

- Same stack and conventions as Lumen (`/Users/josueayala/Code/lumen`): Nuxt 4 SPA in Tauri 2, pnpm + turbo, Panda CSS with strict tokens, explicit imports (`#imports`, `#components`), UI kit in `apps/desktop/app/ui` exported from `~/ui`.
- Design tokens are copied from Lumen's `@lumen/design` and must stay identical, except the blue accent.
- Rust: engine in `stems-engine`, MIDI/timecode/Link in `stems-control`, import and analysis in `stems-library`. The real-time audio thread never allocates, locks or does I/O.
- Tests: Vitest for TS, Rust unit tests and offline renders for the engine. No device-dependent tests in CI.
- Commit to `develop`. Conventional Commits.
