import { onScopeDispose, shallowRef } from 'vue'
import { isTauri } from '~/data/db'
import { ENGINE_STATE_EVENT, type EngineState } from './engine'

/** The latest engine state, or null before the first event (or outside Tauri). */
export function useEngineState() {
  const state = shallowRef<EngineState | null>(null)
  let unlisten: (() => void) | null = null
  let disposed = false

  if (isTauri()) {
    import('@tauri-apps/api/event')
      .then(({ listen }) => listen<EngineState>(ENGINE_STATE_EVENT, (event) => (state.value = event.payload)))
      .then((stop) => {
        if (disposed) stop()
        else unlisten = stop
      })
      .catch((error) => console.error('[stems] engine state listen failed', error))
  }

  onScopeDispose(() => {
    disposed = true
    unlisten?.()
  })

  return state
}
