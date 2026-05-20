import React, { useCallback, useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Server, X } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { searchRepos } from '@/lib/repo-search'
import { cn } from '@/lib/utils'
import type { Repo } from '../../../../shared/types'
import RepoDotLabel from '@/components/repo/RepoDotLabel'

type WorkspaceRepoPillSelectProps = {
  repos: Repo[]
  value: readonly string[]
  onValueChange: (repoIds: string[]) => void
  placeholder?: string
  triggerClassName?: string
}

function normalizeRepoIds(repos: Repo[], repoIds: readonly string[]): string[] {
  const validRepoIds = new Set(repos.map((repo) => repo.id))
  const seen = new Set<string>()
  const result: string[] = []
  for (const repoId of repoIds) {
    if (!validRepoIds.has(repoId) || seen.has(repoId)) {
      continue
    }
    seen.add(repoId)
    result.push(repoId)
  }
  return result
}

export default function WorkspaceRepoPillSelect({
  repos,
  value,
  onValueChange,
  placeholder = 'Choose projects',
  triggerClassName
}: WorkspaceRepoPillSelectProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [commandValue, setCommandValue] = useState('')
  const normalizedValue = useMemo(() => normalizeRepoIds(repos, value), [repos, value])
  const selectedRepoIds = useMemo(() => new Set(normalizedValue), [normalizedValue])
  const selectedRepos = useMemo(
    () =>
      normalizedValue
        .map((repoId) => repos.find((repo) => repo.id === repoId))
        .filter((repo): repo is Repo => repo !== undefined),
    [normalizedValue, repos]
  )
  const filteredRepos = useMemo(() => searchRepos(repos, query), [query, repos])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setQuery('')
    }
  }, [])

  React.useEffect(() => {
    if (!open) {
      return
    }
    const frame = requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(
        '[data-workspace-repo-pill-select-content="true"] [data-slot="command-input"]'
      )
      input?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  const toggleRepo = useCallback(
    (repoId: string): void => {
      if (selectedRepoIds.has(repoId)) {
        if (normalizedValue.length <= 1) {
          return
        }
        onValueChange(normalizedValue.filter((id) => id !== repoId))
        return
      }
      onValueChange([...normalizedValue, repoId])
    },
    [normalizedValue, onValueChange, selectedRepoIds]
  )

  const removeRepo = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, repoId: string): void => {
      event.preventDefault()
      event.stopPropagation()
      if (normalizedValue.length <= 1) {
        return
      }
      onValueChange(normalizedValue.filter((id) => id !== repoId))
    },
    [normalizedValue, onValueChange]
  )

  const handleTriggerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      if (open) {
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        setOpen(true)
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }
      if (event.key.length === 1 && /\S/.test(event.key)) {
        event.preventDefault()
        setQuery(event.key)
        setOpen(true)
      }
    },
    [open]
  )

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <div
          role="combobox"
          aria-expanded={open}
          tabIndex={0}
          data-repo-combobox-root="true"
          onKeyDown={handleTriggerKeyDown}
          className={cn(
            'flex min-h-9 w-full cursor-pointer items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none',
            'focus:border-ring focus:ring-[3px] focus:ring-ring/50',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            triggerClassName
          )}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {selectedRepos.length === 0 ? (
              <span className="px-1 text-muted-foreground">{placeholder}</span>
            ) : (
              selectedRepos.map((repo, index) => (
                <span
                  key={repo.id}
                  className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted/55 px-1.5 py-0.5 text-xs text-foreground"
                >
                  <RepoDotLabel
                    name={repo.displayName}
                    color={repo.badgeColor}
                    className="max-w-[9rem]"
                    dotClassName="size-1.5"
                  />
                  {index === 0 ? (
                    <span className="rounded bg-background px-1 py-0.5 text-[9px] font-medium uppercase leading-none text-muted-foreground">
                      primary
                    </span>
                  ) : null}
                  {repo.connectionId ? (
                    <Server className="size-2.5 shrink-0 text-muted-foreground" />
                  ) : null}
                  <button
                    type="button"
                    className={cn(
                      'ml-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground',
                      normalizedValue.length <= 1 && 'cursor-not-allowed opacity-40'
                    )}
                    aria-label={`Remove ${repo.displayName}`}
                    disabled={normalizedValue.length <= 1}
                    onClick={(event) => removeRepo(event, repo.id)}
                  >
                    <X className="size-2.5" />
                  </button>
                </span>
              ))
            )}
          </div>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground opacity-70" />
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[18rem] p-0"
        data-workspace-repo-pill-select-content="true"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Command shouldFilter={false} value={commandValue} onValueChange={setCommandValue}>
          <CommandInput
            placeholder="Search projects..."
            value={query}
            onValueChange={setQuery}
            className="text-xs"
          />
          <CommandList>
            <CommandEmpty>No projects match your search.</CommandEmpty>
            {filteredRepos.map((repo) => {
              const isSelected = selectedRepoIds.has(repo.id)
              const isLastSelected = isSelected && normalizedValue.length <= 1
              return (
                <CommandItem
                  key={repo.id}
                  value={repo.id}
                  onSelect={() => toggleRepo(repo.id)}
                  disabled={isLastSelected}
                  className="items-center gap-2 px-3 py-2"
                >
                  <Check
                    className={cn(
                      'size-4 text-foreground',
                      isSelected ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="inline-flex items-center gap-1.5">
                      <RepoDotLabel
                        name={repo.displayName}
                        color={repo.badgeColor}
                        className="max-w-full"
                      />
                      {repo.connectionId ? (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-[9px] font-medium leading-none text-muted-foreground">
                          <Server className="size-2.5" />
                          SSH
                        </span>
                      ) : null}
                    </span>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{repo.path}</p>
                  </div>
                </CommandItem>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
