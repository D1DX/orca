import type { WindowShortcutAction, WindowShortcutInput } from './window-shortcut-policy'

export type WindowShortcutBindingActionId =
  | 'openQuickOpen'
  | 'toggleWorktreePalette'
  | 'openNewWorkspace'
  | 'toggleLeftSidebar'
  | 'toggleRightSidebar'
  | 'toggleFloatingTerminal'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'worktreeHistoryBack'
  | 'worktreeHistoryForward'
  | 'dictationKeyDown'

export type WindowShortcutBinding = {
  key: string
  code?: string
  meta?: boolean
  control?: boolean
  alt?: boolean
  shift?: boolean
}

export type WindowShortcutBindings = Partial<
  Record<WindowShortcutBindingActionId, WindowShortcutBinding>
>

export type WindowShortcutBindingDefinition = {
  id: WindowShortcutBindingActionId
  title: string
  group: 'Global' | 'Navigation' | 'View'
  keywords: string[]
  toAction: () => WindowShortcutAction
  defaultBinding: (platform: NodeJS.Platform) => WindowShortcutBinding
}

export const WINDOW_SHORTCUT_BINDING_DEFINITIONS: WindowShortcutBindingDefinition[] = [
  {
    id: 'openQuickOpen',
    title: 'Go to File',
    group: 'Global',
    keywords: ['shortcut', 'global', 'file'],
    toAction: () => ({ type: 'openQuickOpen' }),
    defaultBinding: (platform) => primaryBinding(platform, 'p', 'KeyP')
  },
  {
    id: 'toggleWorktreePalette',
    title: 'Switch worktree',
    group: 'Global',
    keywords: ['shortcut', 'global', 'worktree', 'switch', 'jump'],
    toAction: () => ({ type: 'toggleWorktreePalette' }),
    defaultBinding: (platform) => ({
      ...primaryBinding(platform, 'j', 'KeyJ'),
      shift: platform !== 'darwin'
    })
  },
  {
    id: 'openNewWorkspace',
    title: 'Create worktree',
    group: 'Global',
    keywords: ['shortcut', 'global', 'worktree'],
    toAction: () => ({ type: 'openNewWorkspace' }),
    defaultBinding: (platform) => primaryBinding(platform, 'n', 'KeyN')
  },
  {
    id: 'toggleLeftSidebar',
    title: 'Toggle Sidebar',
    group: 'Global',
    keywords: ['shortcut', 'sidebar'],
    toAction: () => ({ type: 'toggleLeftSidebar' }),
    defaultBinding: (platform) => primaryBinding(platform, 'b', 'KeyB')
  },
  {
    id: 'toggleRightSidebar',
    title: 'Toggle Right Sidebar',
    group: 'Global',
    keywords: ['shortcut', 'sidebar', 'right'],
    toAction: () => ({ type: 'toggleRightSidebar' }),
    defaultBinding: (platform) => primaryBinding(platform, 'l', 'KeyL')
  },
  {
    id: 'toggleFloatingTerminal',
    title: 'Toggle Floating Terminal',
    group: 'Global',
    keywords: ['shortcut', 'terminal', 'floating'],
    toAction: () => ({ type: 'toggleFloatingTerminal' }),
    defaultBinding: (platform) => ({ ...primaryBinding(platform, 't', 'KeyT'), alt: true })
  },
  {
    id: 'dictationKeyDown',
    title: 'Dictation',
    group: 'Global',
    keywords: ['shortcut', 'dictation', 'voice', 'speech', 'microphone'],
    toAction: () => ({ type: 'dictationKeyDown' }),
    defaultBinding: (platform) => primaryBinding(platform, 'e', 'KeyE')
  },
  {
    id: 'worktreeHistoryBack',
    title: 'Previous worktree',
    group: 'Navigation',
    keywords: ['shortcut', 'global', 'worktree', 'history', 'back'],
    toAction: () => ({ type: 'worktreeHistoryNavigate', direction: 'back' }),
    defaultBinding: (platform) => ({
      ...primaryBinding(platform, 'ArrowLeft', 'ArrowLeft'),
      alt: true
    })
  },
  {
    id: 'worktreeHistoryForward',
    title: 'Next worktree',
    group: 'Navigation',
    keywords: ['shortcut', 'global', 'worktree', 'history', 'forward'],
    toAction: () => ({ type: 'worktreeHistoryNavigate', direction: 'forward' }),
    defaultBinding: (platform) => ({
      ...primaryBinding(platform, 'ArrowRight', 'ArrowRight'),
      alt: true
    })
  },
  {
    id: 'zoomIn',
    title: 'Zoom In',
    group: 'View',
    keywords: ['shortcut', 'zoom', 'in', 'scale'],
    toAction: () => ({ type: 'zoom', direction: 'in' }),
    defaultBinding: (platform) =>
      platform === 'darwin'
        ? { key: '=', code: 'Equal', meta: true }
        : { key: '+', code: 'Equal', control: true, shift: true }
  },
  {
    id: 'zoomOut',
    title: 'Zoom Out',
    group: 'View',
    keywords: ['shortcut', 'zoom', 'out', 'scale'],
    toAction: () => ({ type: 'zoom', direction: 'out' }),
    defaultBinding: (platform) => primaryBinding(platform, '-', 'Minus')
  },
  {
    id: 'zoomReset',
    title: 'Reset Size',
    group: 'View',
    keywords: ['shortcut', 'zoom', 'reset', 'size', 'actual'],
    toAction: () => ({ type: 'zoom', direction: 'reset' }),
    defaultBinding: (platform) => primaryBinding(platform, '0', 'Digit0')
  }
]

function primaryBinding(
  platform: NodeJS.Platform,
  key: string,
  code: string
): WindowShortcutBinding {
  return platform === 'darwin' ? { key, code, meta: true } : { key, code, control: true }
}

function modifierValue(value: boolean | undefined): boolean {
  return value === true
}

export function isRecordableWindowShortcutBinding(binding: WindowShortcutBinding): boolean {
  // Why: bare keys and Shift-only chords would steal normal typing from
  // terminals, editors, and SSH sessions. Custom app shortcuts still need at
  // least one non-Shift modifier.
  return modifierValue(binding.meta) || modifierValue(binding.control) || modifierValue(binding.alt)
}

export function normalizeWindowShortcutBindings(input: unknown): WindowShortcutBindings {
  if (!input || typeof input !== 'object') {
    return {}
  }
  const validIds = new Set(WINDOW_SHORTCUT_BINDING_DEFINITIONS.map((definition) => definition.id))
  const result: WindowShortcutBindings = {}
  for (const [id, value] of Object.entries(input)) {
    if (!validIds.has(id as WindowShortcutBindingActionId) || !value || typeof value !== 'object') {
      continue
    }
    const binding = value as Partial<WindowShortcutBinding>
    if (typeof binding.key !== 'string' || binding.key.length === 0) {
      continue
    }
    const normalized: WindowShortcutBinding = {
      key: binding.key,
      ...(typeof binding.code === 'string' && binding.code.length > 0
        ? { code: binding.code }
        : {}),
      ...(binding.meta === true ? { meta: true } : {}),
      ...(binding.control === true ? { control: true } : {}),
      ...(binding.alt === true ? { alt: true } : {}),
      ...(binding.shift === true ? { shift: true } : {})
    }
    if (isRecordableWindowShortcutBinding(normalized)) {
      result[id as WindowShortcutBindingActionId] = normalized
    }
  }
  return result
}

export function effectiveWindowShortcutBinding(
  actionId: WindowShortcutBindingActionId,
  platform: NodeJS.Platform,
  bindings?: WindowShortcutBindings
): WindowShortcutBinding {
  const custom = bindings?.[actionId]
  if (custom && isRecordableWindowShortcutBinding(custom)) {
    return custom
  }
  const definition = WINDOW_SHORTCUT_BINDING_DEFINITIONS.find((item) => item.id === actionId)
  if (!definition) {
    throw new Error(`Unknown window shortcut action: ${actionId}`)
  }
  return definition.defaultBinding(platform)
}

export function resolveCustomWindowShortcutAction(
  input: WindowShortcutInput,
  bindings?: WindowShortcutBindings
): WindowShortcutAction | null {
  const normalizedBindings = normalizeWindowShortcutBindings(bindings)
  for (const definition of WINDOW_SHORTCUT_BINDING_DEFINITIONS) {
    const custom = normalizedBindings[definition.id]
    if (custom && matchesWindowShortcutBinding(input, custom)) {
      return definition.toAction()
    }
  }
  return null
}

export function matchesWindowShortcutBinding(
  input: WindowShortcutInput,
  binding: WindowShortcutBinding
): boolean {
  if (
    modifierValue(input.meta) !== modifierValue(binding.meta) ||
    modifierValue(input.control) !== modifierValue(binding.control) ||
    modifierValue(input.alt) !== modifierValue(binding.alt) ||
    modifierValue(input.shift) !== modifierValue(binding.shift)
  ) {
    return false
  }

  const bindingKey = normalizeShortcutKey(binding.key)
  const inputKey = normalizeShortcutKey(input.key ?? '')
  if (bindingKey && inputKey) {
    if (isLetter(bindingKey) && isLetter(inputKey)) {
      return bindingKey === inputKey
    }
    if (bindingKey === inputKey) {
      return true
    }
  }

  // Why: `key` is layout-aware and should win for printable characters, but
  // Electron can emit empty/dead keys for some layouts. `code` keeps custom
  // bindings reachable as a fallback without making QWERTY position primary.
  return Boolean(binding.code && input.code && binding.code === input.code)
}

function isLetter(value: string): boolean {
  return value.length === 1 && value >= 'a' && value <= 'z'
}

function normalizeShortcutKey(key: string): string {
  if (key.length === 1) {
    return key.toLowerCase()
  }
  return key
}

export function formatWindowShortcutBinding(
  binding: WindowShortcutBinding,
  isMac: boolean
): string[] {
  const keys: string[] = []
  if (binding.control) {
    keys.push(isMac ? '⌃' : 'Ctrl')
  }
  if (binding.meta) {
    keys.push(isMac ? '⌘' : 'Meta')
  }
  if (binding.alt) {
    keys.push(isMac ? '⌥' : 'Alt')
  }
  if (binding.shift) {
    keys.push(isMac ? '⇧' : 'Shift')
  }
  keys.push(formatKeyLabel(binding.key, binding.code))
  return keys
}

function formatKeyLabel(key: string, code?: string): string {
  if (key === ' ') {
    return 'Space'
  }
  if (key === 'ArrowUp') {
    return '↑'
  }
  if (key === 'ArrowDown') {
    return '↓'
  }
  if (key === 'ArrowLeft') {
    return '←'
  }
  if (key === 'ArrowRight') {
    return '→'
  }
  if (key === 'Escape') {
    return 'Esc'
  }
  if (key.length === 1) {
    return key.toUpperCase()
  }
  if (key === 'Control' || key === 'Meta' || key === 'Alt' || key === 'Shift') {
    return code ?? key
  }
  return key
}
