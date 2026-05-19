import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { TerminalMacro } from '../../../../shared/types'
import {
  createTerminalMacroDraft,
  TerminalMacroDialog
} from '@/components/terminal-macros/TerminalMacroDialog'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Label } from '../ui/label'

type TerminalMacrosSectionProps = {
  macros: TerminalMacro[]
  onChange: (macros: TerminalMacro[]) => void
}

type EditorState =
  | { mode: 'add'; macro: TerminalMacro }
  | { mode: 'edit'; macro: TerminalMacro }
  | null

function layoutLabel(layout: TerminalMacro['layout']): string {
  if (layout === 'split-right') {
    return 'Tab Split Right'
  }
  if (layout === 'split-down') {
    return 'Tab Split Down'
  }
  return 'Tab'
}

export function TerminalMacrosSection({
  macros,
  onChange
}: TerminalMacrosSectionProps): React.JSX.Element {
  const [editor, setEditor] = useState<EditorState>(null)
  const visibleMacros = macros.filter((macro) => macro.name.trim() || macro.command.trimEnd())

  const saveMacro = (next: TerminalMacro): void => {
    if (editor?.mode === 'edit') {
      onChange(macros.map((macro) => (macro.id === next.id ? next : macro)))
    } else {
      onChange([...macros, next])
    }
  }

  const removeMacro = (id: string): void => {
    onChange(macros.filter((macro) => macro.id !== id))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <Label>Saved Macros</Label>
          <p className="text-xs text-muted-foreground">
            Each macro opens a named tab in the current tab group or a new tab split.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditor({ mode: 'add', macro: createTerminalMacroDraft() })}
        >
          <Plus />
          Add Macro
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/50">
        {visibleMacros.length === 0 ? (
          <div className="px-3 py-6 text-sm text-muted-foreground">No terminal macros saved.</div>
        ) : (
          <div className="divide-y divide-border/50">
            {visibleMacros.map((macro) => (
              <div key={macro.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="truncate text-sm font-medium">{macro.name || 'Untitled'}</div>
                    <Badge variant="outline">{layoutLabel(macro.layout)}</Badge>
                  </div>
                  <div className="truncate font-mono text-xs text-muted-foreground">
                    {macro.command || 'Opens an idle shell'}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${macro.name || 'macro'}`}
                  onClick={() => setEditor({ mode: 'edit', macro })}
                >
                  <Pencil />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${macro.name || 'macro'}`}
                  onClick={() => removeMacro(macro.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <TerminalMacroDialog
        open={editor !== null}
        mode={editor?.mode ?? 'add'}
        macro={editor?.macro ?? createTerminalMacroDraft()}
        onOpenChange={(open) => !open && setEditor(null)}
        onSave={saveMacro}
      />
    </div>
  )
}
