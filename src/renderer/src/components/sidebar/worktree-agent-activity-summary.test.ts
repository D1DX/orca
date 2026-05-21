import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { selectWorktreeAgentActivitySummary } from './worktree-agent-activity-summary'

const LEAF_ID = '11111111-1111-4111-8111-111111111111'

function makeAgentStatusEntry(args: {
  paneKey: string
  state: AgentStatusEntry['state']
}): AgentStatusEntry {
  return {
    paneKey: args.paneKey,
    state: args.state,
    prompt: '',
    updatedAt: 1_000,
    stateStartedAt: 1_000,
    stateHistory: []
  }
}

describe('selectWorktreeAgentActivitySummary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('builds one cached agent summary index for multiple worktree lookups', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(2_000)
    const firstPaneKey = makePaneKey('tab-1', LEAF_ID)
    const state = {
      tabsByWorktree: {
        'repo::/wt-1': [{ id: 'tab-1' }],
        'repo::/wt-2': [{ id: 'tab-2' }]
      },
      agentStatusEpoch: 0,
      agentStatusByPaneKey: {
        [firstPaneKey]: makeAgentStatusEntry({ paneKey: firstPaneKey, state: 'working' })
      },
      migrationUnsupportedByPtyId: {},
      retainedAgentsByPaneKey: {
        'tab-2:0': { worktreeId: 'repo::/wt-2' }
      }
    }

    expect(selectWorktreeAgentActivitySummary(state as never, 'repo::/wt-1')).toMatchObject({
      hasLiveWorking: true,
      hasRetainedDone: false
    })
    expect(selectWorktreeAgentActivitySummary(state as never, 'repo::/wt-2')).toMatchObject({
      hasLiveWorking: false,
      hasRetainedDone: true
    })
    expect(nowSpy).toHaveBeenCalledTimes(1)
  })

  it('reuses the cached summary when same-state agent pings only clone the status map', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(2_000)
    const paneKey = makePaneKey('tab-1', LEAF_ID)
    const tabsByWorktree = {
      'repo::/wt-1': [{ id: 'tab-1' }]
    }
    const migrationUnsupportedByPtyId = {}
    const retainedAgentsByPaneKey = {}
    const entry = makeAgentStatusEntry({ paneKey, state: 'working' })
    const state = {
      tabsByWorktree,
      agentStatusEpoch: 0,
      agentStatusByPaneKey: {
        [paneKey]: entry
      },
      migrationUnsupportedByPtyId,
      retainedAgentsByPaneKey
    }
    const sameStatePing = {
      ...state,
      agentStatusByPaneKey: {
        [paneKey]: {
          ...entry,
          prompt: 'new prompt preview',
          updatedAt: 1_500
        }
      }
    }

    expect(selectWorktreeAgentActivitySummary(state as never, 'repo::/wt-1')).toMatchObject({
      hasLiveWorking: true
    })
    expect(selectWorktreeAgentActivitySummary(sameStatePing as never, 'repo::/wt-1')).toMatchObject(
      {
        hasLiveWorking: true
      }
    )
    expect(nowSpy).toHaveBeenCalledTimes(1)
  })

  it('rebuilds the summary when the agent status epoch changes', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(2_000)
    const paneKey = makePaneKey('tab-1', LEAF_ID)
    const tabsByWorktree = {
      'repo::/wt-1': [{ id: 'tab-1' }]
    }
    const migrationUnsupportedByPtyId = {}
    const retainedAgentsByPaneKey = {}
    const state = {
      tabsByWorktree,
      agentStatusEpoch: 0,
      agentStatusByPaneKey: {
        [paneKey]: makeAgentStatusEntry({ paneKey, state: 'working' })
      },
      migrationUnsupportedByPtyId,
      retainedAgentsByPaneKey
    }
    const changedState = {
      ...state,
      agentStatusEpoch: 1,
      agentStatusByPaneKey: {
        [paneKey]: makeAgentStatusEntry({ paneKey, state: 'done' })
      }
    }

    expect(selectWorktreeAgentActivitySummary(state as never, 'repo::/wt-1')).toMatchObject({
      hasLiveWorking: true,
      hasLiveDone: false
    })
    expect(selectWorktreeAgentActivitySummary(changedState as never, 'repo::/wt-1')).toMatchObject({
      hasLiveWorking: false,
      hasLiveDone: true
    })
    expect(nowSpy).toHaveBeenCalledTimes(2)
  })
})
