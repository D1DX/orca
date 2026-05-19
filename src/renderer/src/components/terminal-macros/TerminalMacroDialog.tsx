import { useEffect, useState } from 'react'
import type { TerminalMacro, TerminalMacroLayout } from '../../../../shared/types'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

type TerminalMacroDialogMode = 'add' | 'edit'

type TerminalMacroDialogProps = {
  open: boolean
  mode: TerminalMacroDialogMode
  macro: TerminalMacro
  onOpenChange: (open: boolean) => void
  onSave: (macro: TerminalMacro) => void
}

export function createTerminalMacroDraft(): TerminalMacro {
  return {
    id: `terminal-macro-${createBrowserUuid()}`,
    name: '',
    layout: 'tab',
    command: '',
    appendEnter: true
  }
}

export function TerminalMacroDialog({
  open,
  mode,
  macro,
  onOpenChange,
  onSave
}: TerminalMacroDialogProps): React.JSX.Element {
  const [draft, setDraft] = useState<TerminalMacro>(macro)

  useEffect(() => {
    if (open) {
      setDraft({ ...macro })
    }
  }, [macro, open])

  const saveDraft = (): void => {
    const nextLayout = draft.layout
    const next: TerminalMacro = {
      ...draft,
      name: draft.name.trim(),
      command: draft.command.trimEnd(),
      layout: nextLayout,
      appendEnter: draft.appendEnter !== false
    }
    if (!next.name) {
      return
    }
    onSave(next)
    onOpenChange(false)
  }

  const canSave = draft.name.trim().length > 0
  const targetsSplitPane = draft.layout !== 'tab'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-sm">
            {mode === 'edit' ? 'Edit Macro' : 'Add Macro'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Macros open a named terminal tab and can place it in a tab split.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Codex review"
            />
          </div>

          <div className="space-y-2">
            <Label>Launch Layout</Label>
            <ToggleGroup
              type="single"
              value={draft.layout}
              onValueChange={(value) => {
                if (value === 'tab' || value === 'split-right' || value === 'split-down') {
                  setDraft((current) => ({
                    ...current,
                    layout: value as TerminalMacroLayout
                  }))
                }
              }}
              className="justify-start"
            >
              <ToggleGroupItem value="tab">Tab</ToggleGroupItem>
              <ToggleGroupItem value="split-right">Tab Split Right</ToggleGroupItem>
              <ToggleGroupItem value="split-down">Tab Split Down</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-2">
            <Label>{targetsSplitPane ? 'New Pane Startup' : 'Tab Startup'}</Label>
            <textarea
              value={draft.command}
              onChange={(event) =>
                setDraft((current) => ({ ...current, command: event.target.value }))
              }
              placeholder={targetsSplitPane ? 'npm run dev' : 'codex --model gpt-5.5'}
              rows={5}
              className="min-h-28 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            {!targetsSplitPane && (
              <p className="text-xs text-muted-foreground">
                Optional startup text for the new tab.
              </p>
            )}
            <MacroAppendEnterToggle
              checked={draft.appendEnter !== false}
              label="Run startup command"
              description="Press Enter after this text is in the terminal."
              onToggle={() =>
                setDraft((current) => ({ ...current, appendEnter: !current.appendEnter }))
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={saveDraft} disabled={!canSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MacroAppendEnterToggle({
  checked,
  label,
  description,
  onToggle
}: {
  checked: boolean
  label: string
  description: string
  onToggle: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border/50 px-3 py-2">
      <div className="space-y-0.5">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors ${
          checked ? 'bg-foreground' : 'bg-muted-foreground/30'
        }`}
      >
        <span
          className={`pointer-events-none block size-3.5 rounded-full bg-background shadow-sm transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}
