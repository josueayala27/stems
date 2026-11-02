export interface NavItem {
  label: string
  href: string
  icon: string
  /** Extra path prefixes that keep this item highlighted. */
  also?: string[]
}

export interface NavSection {
  title: string
  items: NavItem[]
}

/** Workspaces from docs/architecture/04-ui.md. */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Perform',
    items: [
      { label: 'Play', href: '/', icon: 'lucide:play' },
      { label: 'Mixer', href: '/mixer', icon: 'lucide:sliders-vertical' },
    ],
  },
  {
    title: 'Build',
    items: [{ label: 'Arrange', href: '/arrange', icon: 'lucide:audio-waveform' }],
  },
  {
    title: 'Library',
    items: [
      { label: 'Songs', href: '/songs', icon: 'lucide:music' },
      { label: 'Setlists', href: '/setlists', icon: 'lucide:list-music' },
    ],
  },
  {
    title: 'System',
    items: [{ label: 'Settings', href: '/settings', icon: 'lucide:settings-2' }],
  },
]

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

/** `/` only matches itself; every other item also covers its sub-routes (e.g. `/arrange/:songId`). */
export function isNavActive(item: NavItem, path: string): boolean {
  if (item.href === '/') return path === '/' || (item.also ?? []).some((prefix) => matches(path, prefix))
  return matches(path, item.href) || (item.also ?? []).some((prefix) => matches(path, prefix))
}
