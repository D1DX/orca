import type { AgentActivityDisplayMode, WorktreeCardProperty } from '../../../../shared/types'
import { translate } from '@/i18n/i18n'

export const GROUP_BY_OPTIONS = [
  {
    id: 'none',
    label: translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.c2c7a45cda', 'None')
  },
  {
    id: 'workspace-status',
    label: translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.e029a2d775', 'Status')
  },
  {
    id: 'pr-status',
    label: translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.0f9b959b31', 'PR')
  },
  {
    id: 'repo',
    label: translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.2170d553cf', 'Project')
  }
] as const

export const CARD_LAYOUT_OPTIONS = [
  {
    id: 'detailed',
    label: translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.cc17bd443b', 'Detailed')
  },
  {
    id: 'compact',
    label: translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.25105b28cb', 'Compact')
  }
] as const

export const PROPERTY_OPTIONS: { id: WorktreeCardProperty; label: string }[] = [
  {
    id: 'issue',
    label: translate(
      'auto.components.sidebar.SidebarWorkspaceOptionsMenu.91dfc653e8',
      'GitHub ticket'
    )
  },
  {
    id: 'linear-issue',
    label: translate(
      'auto.components.sidebar.SidebarWorkspaceOptionsMenu.ca4d3c522e',
      'Linear issue'
    )
  },
  {
    id: 'pr',
    label: translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.b8dcc6f321', 'PR/MR link')
  },
  {
    id: 'comment',
    label: translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.26c71e536c', 'Notes')
  },
  {
    id: 'ports',
    label: translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.b64d8bcca0', 'Ports')
  },
  {
    id: 'inline-agents',
    label: translate(
      'auto.components.sidebar.SidebarWorkspaceOptionsMenu.d7084e8bc8',
      'Agent activity'
    )
  }
]

export const AGENT_ACTIVITY_DISPLAY_OPTIONS: {
  id: AgentActivityDisplayMode
  label: string
}[] = [
  {
    id: 'compact',
    label: translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.25105b28cb', 'Compact')
  },
  {
    id: 'full',
    label: translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.2a81e07366', 'Full list')
  }
]

export const SORT_OPTIONS = [
  {
    id: 'name',
    label: translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.3728165cdd', 'Name'),
    description: null
  },
  {
    id: 'smart',
    label: translate(
      'auto.components.sidebar.SidebarWorkspaceOptionsMenu.503462f2b4',
      'Agent Activity'
    ),
    description: translate(
      'auto.components.sidebar.SidebarWorkspaceOptionsMenu.b759bb87ee',
      'Agents that need attention, then most recent activity.'
    )
  },
  {
    id: 'recent',
    label: translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.b451c8b162', 'Recent'),
    description: null
  },
  {
    id: 'repo',
    label: translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.2170d553cf', 'Project'),
    description: null
  },
  {
    id: 'manual',
    label: translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.7b316bdd51', 'Manual'),
    description: translate(
      'auto.components.sidebar.SidebarWorkspaceOptionsMenu.7153d07485',
      'Drag workspaces to arrange them within each group.'
    )
  }
] as const

export const PROJECT_ORDER_OPTIONS = [
  {
    id: 'manual',
    label: translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.7b316bdd51', 'Manual'),
    description: translate(
      'auto.components.sidebar.SidebarWorkspaceOptionsMenu.6664282a7b',
      'Drag projects to arrange them'
    )
  },
  {
    id: 'recent',
    label: translate('auto.components.sidebar.SidebarWorkspaceOptionsMenu.b451c8b162', 'Recent'),
    description: translate(
      'auto.components.sidebar.SidebarWorkspaceOptionsMenu.af9249c505',
      'Most recent workspace activity'
    )
  }
] as const
