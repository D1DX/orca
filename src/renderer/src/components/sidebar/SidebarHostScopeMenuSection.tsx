import type React from 'react'
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import type { WorkspaceHostScope } from '../../../../shared/types'
import type { SidebarHostScopeOption } from './sidebar-host-options'
import { translate } from '@/i18n/i18n'

type SidebarHostScopeMenuSectionProps = {
  hostOptionsCount: number
  hostScopeLabel: string
  hostScopeOptions: readonly SidebarHostScopeOption[]
  preserveWorkspaceBoardOpen: boolean
  workspaceHostScope: WorkspaceHostScope
  setWorkspaceHostScope: (scope: WorkspaceHostScope) => void
}

export function SidebarHostScopeMenuSection({
  hostOptionsCount,
  hostScopeLabel,
  hostScopeOptions,
  preserveWorkspaceBoardOpen,
  workspaceHostScope,
  setWorkspaceHostScope
}: SidebarHostScopeMenuSectionProps): React.JSX.Element {
  return (
    <>
      <DropdownMenuLabel>
        {translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.631b97eea9', 'Host scope')}
      </DropdownMenuLabel>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <span className="flex flex-1 items-center justify-between gap-3">
            <span className="min-w-0 truncate">{hostScopeLabel}</span>
            <span className="text-[11px] font-medium text-muted-foreground">
              {hostOptionsCount}
            </span>
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
          className="w-56"
          data-workspace-board-preserve-open={preserveWorkspaceBoardOpen ? '' : undefined}
        >
          <DropdownMenuRadioGroup
            value={workspaceHostScope}
            onValueChange={(value) => setWorkspaceHostScope(value as WorkspaceHostScope)}
          >
            {hostScopeOptions.map((option) => (
              <DropdownMenuRadioItem
                key={option.id}
                value={option.id}
                onSelect={(e) => e.preventDefault()}
                className="flex-col items-start gap-0.5"
              >
                <span>{option.label}</span>
                {option.detail && (
                  <span className="max-w-44 truncate text-[11px] font-normal text-muted-foreground">
                    {option.detail}
                  </span>
                )}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSeparator />
    </>
  )
}
