import { z } from 'zod'
import { isTuiAgent } from '../../../../shared/tui-agent-config'
import type { TuiAgent } from '../../../../shared/types'

export const WorktreeTabSelector = z.object({
  worktree: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing worktree selector'))
})

export const SessionTabsUnsubscribe = WorktreeTabSelector.extend({
  subscriptionId: z.string().min(1).optional()
})

export const ActivateTab = WorktreeTabSelector.extend({
  tabId: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing tab id')),
  leafId: z.string().max(128).optional()
})

type TerminalPaneLayoutNodeInput =
  | { type: 'leaf'; leafId: string }
  | {
      type: 'split'
      direction: 'horizontal' | 'vertical'
      first: TerminalPaneLayoutNodeInput
      second: TerminalPaneLayoutNodeInput
      ratio?: number
    }

const TerminalPaneLayoutNodeSchema: z.ZodType<TerminalPaneLayoutNodeInput> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('leaf'), leafId: z.string().min(1).max(128) }).strict(),
    z
      .object({
        type: z.literal('split'),
        direction: z.enum(['horizontal', 'vertical']),
        first: TerminalPaneLayoutNodeSchema,
        second: TerminalPaneLayoutNodeSchema,
        ratio: z.number().min(0).max(1).optional()
      })
      .strict()
  ])
)

export const UpdatePaneLayout = WorktreeTabSelector.extend({
  tabId: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing tab id')),
  root: TerminalPaneLayoutNodeSchema.nullable(),
  expandedLeafId: z.string().max(128).nullable().optional(),
  titlesByLeafId: z.record(z.string(), z.string()).optional()
})

export const CreateTerminalTab = WorktreeTabSelector.extend({
  afterTabId: z.string().optional(),
  targetGroupId: z.string().optional(),
  command: z.string().optional(),
  agent: z
    .custom<TuiAgent>(isTuiAgent, {
      message: 'Unknown agent preset'
    })
    .optional(),
  activate: z.boolean().optional()
})

const MoveTabBase = {
  worktree: WorktreeTabSelector.shape.worktree,
  tabId: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing tab id')),
  targetGroupId: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing target group id'))
} as const

export const MoveTab = z.discriminatedUnion('kind', [
  z
    .object({
      ...MoveTabBase,
      kind: z.literal('reorder'),
      tabOrder: z.array(z.string().min(1)).min(1, 'Missing tab order')
    })
    .strict(),
  z
    .object({
      ...MoveTabBase,
      kind: z.literal('move-to-group'),
      index: z.number().int().nonnegative().optional()
    })
    .strict(),
  z
    .object({
      ...MoveTabBase,
      kind: z.literal('split'),
      splitDirection: z.enum(['left', 'right', 'up', 'down'])
    })
    .strict()
])

export const SaveMarkdownTab = ActivateTab.extend({
  baseVersion: z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : ''))
    .pipe(z.string().min(1, 'Missing base version')),
  content: z.string()
})
