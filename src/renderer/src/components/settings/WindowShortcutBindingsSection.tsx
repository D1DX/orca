import React, { useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import {
  effectiveWindowShortcutBinding,
  formatWindowShortcutBinding,
  isRecordableWindowShortcutBinding,
  WINDOW_SHORTCUT_BINDING_DEFINITIONS,
  type WindowShortcutBinding,
  type WindowShortcutBindingActionId,
  type WindowShortcutBindings
} from '../../../../shared/window-shortcut-bindings'
import { useAppStore } from '../../store'
import { ShortcutKeyCombo } from '../ShortcutKeyCombo'
import { Button } from '../ui/button'
import { matchesSettingsSearch, type SettingsSearchEntry } from './settings-search'
import { SearchableSetting } from './SearchableSetting'

export const WINDOW_SHORTCUT_BINDING_SEARCH_ENTRIES: SettingsSearchEntry[] =
  WINDOW_SHORTCUT_BINDING_DEFINITIONS.map((definition) => ({
    title: definition.title,
    description: `${definition.group} shortcut`,
    keywords: definition.keywords
  }))

export const CUSTOMIZABLE_ACTION_TITLES = new Set(
  WINDOW_SHORTCUT_BINDING_DEFINITIONS.map((definition) => definition.title)
)

type WindowShortcutBindingsSectionProps = {
  searchQuery: string
}

export function WindowShortcutBindingsSection({
  searchQuery
}: WindowShortcutBindingsSectionProps): React.JSX.Element | null {
  const windowShortcutBindings = useAppStore(
    (state) => state.settings?.windowShortcutBindings ?? {}
  )
  const updateSettings = useAppStore((state) => state.updateSettings)
  const isMac = navigator.userAgent.includes('Mac')
  const shortcutPlatform = (isMac ? 'darwin' : 'linux') as NodeJS.Platform
  const [recordingActionId, setRecordingActionId] = useState<WindowShortcutBindingActionId | null>(
    null
  )
  const [recordingError, setRecordingError] = useState<string | null>(null)

  const customizableRows = useMemo(
    () =>
      WINDOW_SHORTCUT_BINDING_DEFINITIONS.map((definition) => {
        const binding = effectiveWindowShortcutBinding(
          definition.id,
          shortcutPlatform,
          windowShortcutBindings
        )
        return {
          ...definition,
          binding,
          keys: formatWindowShortcutBinding(binding, isMac),
          customized: Boolean(windowShortcutBindings[definition.id])
        }
      }),
    [isMac, shortcutPlatform, windowShortcutBindings]
  )

  const setShortcutBinding = (
    actionId: WindowShortcutBindingActionId,
    binding: WindowShortcutBinding
  ): void => {
    void updateSettings({
      windowShortcutBindings: {
        ...windowShortcutBindings,
        [actionId]: binding
      }
    })
  }

  const resetShortcutBinding = (actionId: WindowShortcutBindingActionId): void => {
    const next: WindowShortcutBindings = { ...windowShortcutBindings }
    delete next[actionId]
    void updateSettings({ windowShortcutBindings: next })
  }

  const handleRecorderKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    actionId: WindowShortcutBindingActionId
  ): void => {
    if (recordingActionId !== actionId) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      setRecordingActionId(null)
      setRecordingError(null)
      return
    }
    const binding = bindingFromKeyboardEvent(event.nativeEvent)
    if (!binding) {
      setRecordingError('Press a key with Ctrl, Cmd, or Alt.')
      return
    }
    const conflict = customizableRows.find(
      (row) => row.id !== actionId && bindingSignature(row.binding) === bindingSignature(binding)
    )
    if (conflict) {
      setRecordingError(`Already used by ${conflict.title}.`)
      return
    }
    setShortcutBinding(actionId, binding)
    setRecordingActionId(null)
    setRecordingError(null)
  }

  if (!matchesSettingsSearch(searchQuery, WINDOW_SHORTCUT_BINDING_SEARCH_ENTRIES)) {
    return null
  }

  return (
    <div className="space-y-3">
      <h3 className="border-b border-border/50 pb-2 text-sm font-medium text-muted-foreground">
        Customizable
      </h3>
      <div className="grid gap-2">
        {customizableRows
          .filter((row) =>
            matchesSettingsSearch(searchQuery, [
              {
                title: row.title,
                description: `${row.group} shortcut`,
                keywords: row.keywords
              }
            ])
          )
          .map((row) => {
            const isRecording = recordingActionId === row.id
            return (
              <SearchableSetting
                key={row.id}
                title={row.title}
                description={`${row.group} shortcut`}
                keywords={row.keywords}
                className="flex items-center justify-between gap-4 py-1"
              >
                <div className="min-w-0 space-y-0.5">
                  <span className="text-sm text-foreground">{row.title}</span>
                  {isRecording && recordingError ? (
                    <p className="text-xs text-destructive">{recordingError}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ShortcutKeyCombo keys={row.keys} />
                  <Button
                    type="button"
                    variant={isRecording ? 'secondary' : 'outline'}
                    size="xs"
                    onClick={() => {
                      setRecordingActionId(isRecording ? null : row.id)
                      setRecordingError(null)
                    }}
                    onKeyDown={(event) => handleRecorderKeyDown(event, row.id)}
                  >
                    {isRecording ? 'Recording' : 'Record'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={!row.customized}
                    onClick={() => resetShortcutBinding(row.id)}
                    aria-label={`Reset ${row.title} shortcut`}
                  >
                    <RotateCcw />
                  </Button>
                </div>
              </SearchableSetting>
            )
          })}
      </div>
    </div>
  )
}

function bindingFromKeyboardEvent(event: KeyboardEvent): WindowShortcutBinding | null {
  if (
    event.key === 'Meta' ||
    event.key === 'Control' ||
    event.key === 'Alt' ||
    event.key === 'Shift'
  ) {
    return null
  }
  const binding: WindowShortcutBinding = {
    key: event.key,
    code: event.code,
    meta: event.metaKey,
    control: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey
  }
  return isRecordableWindowShortcutBinding(binding) ? binding : null
}

function bindingSignature(binding: WindowShortcutBinding): string {
  return [
    binding.meta === true ? 'meta' : '',
    binding.control === true ? 'control' : '',
    binding.alt === true ? 'alt' : '',
    binding.shift === true ? 'shift' : '',
    binding.key.toLowerCase(),
    binding.code ?? ''
  ].join('|')
}
