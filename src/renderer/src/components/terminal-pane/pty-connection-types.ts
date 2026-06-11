import type { PtyTransport } from './pty-transport'
import type { ReplayingPanesRef } from './replay-guard'
import type { ParsedAgentStatusPayload } from '../../../../shared/agent-status-types'
import type { EventProps } from '../../../../shared/telemetry-events'
import type { TuiAgent } from '../../../../shared/types'

export type PtyConnectionDeps = {
  tabId: string
  worktreeId: string
  cwd?: string
  startup?: {
    command: string
    /** Renderer-delivered startup input for callers that need xterm paste
     *  semantics before the submit Enter. */
    delivery?: 'terminal-paste'
    env?: Record<string, string>
    /** Telemetry payload for `agent_started`. Forwarded to `pty:spawn`
     *  so main fires the event only after the spawn succeeds. */
    telemetry?: EventProps<'agent_started'>
    /** Initial prompt-start status for agents that lack native prompt hooks. */
    initialAgentStatus?: { agent: TuiAgent; prompt: string }
  } | null
  restoredLeafId?: string | null
  restoredPtyIdByLeafId?: Record<string, string>
  paneTransportsRef: React.RefObject<Map<number, PtyTransport>>
  replayingPanesRef: ReplayingPanesRef
  isActiveRef: React.RefObject<boolean>
  isVisibleRef: React.RefObject<boolean>
  onPtyExitRef: React.RefObject<(ptyId: string) => void>
  onPtyErrorRef?: React.RefObject<(paneId: number, message: string) => void>
  clearTabPtyId: (tabId: string, ptyId: string) => void
  consumeSuppressedPtyExit: (ptyId: string) => boolean
  updateTabTitle: (tabId: string, title: string) => void
  setRuntimePaneTitle: (tabId: string, paneId: number, title: string) => void
  clearRuntimePaneTitle: (tabId: string, paneId: number) => void
  updateTabPtyId: (tabId: string, ptyId: string) => void
  markWorktreeUnread: (worktreeId: string) => void
  markTerminalTabUnread: (tabId: string) => void
  markTerminalPaneUnread: (paneKey: string) => void
  clearWorktreeUnread: (worktreeId: string) => void
  clearTerminalTabUnread: (tabId: string) => void
  clearTerminalPaneUnread: (paneKey: string) => void
  // Why: the renderer dispatches two notification sources — BEL from the PTY
  // byte stream and agent-task-complete on the working→idle title transition.
  // shared/types.ts keeps a wider NotificationEventSource union because the
  // main process can also emit `'test'` from the settings-pane button.
  dispatchNotification: (event: {
    source: 'terminal-bell' | 'agent-task-complete'
    terminalTitle?: string
    paneKey?: string
    agentStatusSnapshot?: ParsedAgentStatusPayload
    suppressOsNotification?: boolean
  }) => void
  setCacheTimerStartedAt: (key: string, ts: number | null) => void
  syncPanePtyLayoutBinding: (paneId: number, ptyId: string | null) => void
  /** Records a DECSET 2031 subscription answered from main's
   *  '2031-subscribe' fact, mirroring the xterm CSI handler's registry write
   *  (paneMode2031 + last replied theme) so later theme flips push CSI 997.
   *  The reply itself is sent by the fact handler — query authority stays
   *  with the view (model/view contract invariant 6). */
  recordPaneMode2031Subscription?: (paneId: number, repliedMode: 'dark' | 'light') => void
}
