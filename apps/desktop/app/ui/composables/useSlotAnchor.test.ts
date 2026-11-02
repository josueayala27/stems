import { describe, expect, it } from 'vitest'
import { firstBoxElement } from './useSlotAnchor'

function html(markup: string): HTMLElement {
  const root = document.createElement('span')
  root.style.display = 'contents'
  root.innerHTML = markup
  document.body.append(root)
  return root
}

describe('firstBoxElement (QA-UI-1)', () => {
  it('returns the first child when it has a box', () => {
    const root = html('<button id="b">Go</button>')
    expect(firstBoxElement(root)?.id).toBe('b')
  })

  it('descends through display: contents wrappers (a Tooltip around an IconButton)', () => {
    const root = html('<span style="display: contents"><span style="display: contents"><button id="b">…</button></span></span>')
    expect(firstBoxElement(root)?.id).toBe('b')
  })

  it('keeps an empty contents wrapper rather than returning nothing', () => {
    const root = html('<span id="w" style="display: contents"></span>')
    expect(firstBoxElement(root)?.id).toBe('w')
  })

  it('handles a missing root', () => {
    expect(firstBoxElement(null)).toBeNull()
  })
})
