import { describe, expect, it } from 'vitest'
import { getAutomationAgentCompletionObservation } from './automation-agent-completion'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'

function status(overrides: Partial<AgentStatusEntry>): AgentStatusEntry {
  return {
    state: 'working',
    prompt: '',
    updatedAt: 2,
    stateStartedAt: 2,
    paneKey: 'tab-1:11111111-1111-4111-8111-111111111111',
    stateHistory: [],
    ...overrides
  }
}

describe('getAutomationAgentCompletionObservation', () => {
  it('ignores stale entries from before the automation completion window', () => {
    expect(
      getAutomationAgentCompletionObservation({
        entry: status({ state: 'done', updatedAt: 1 }),
        startedAfter: 2,
        sawWorkingAfterStart: false
      })
    ).toEqual({
      sawWorkingAfterStart: false,
      latestAssistantMessage: null,
      done: false
    })
  })

  it('requires a fresh working state before completing reused sessions', () => {
    const waiting = getAutomationAgentCompletionObservation({
      entry: status({ state: 'done', updatedAt: 3 }),
      startedAfter: 2,
      sawWorkingAfterStart: false,
      requireWorkingAfterStart: true
    })
    const working = getAutomationAgentCompletionObservation({
      entry: status({ state: 'working', updatedAt: 4 }),
      startedAfter: 2,
      sawWorkingAfterStart: waiting.sawWorkingAfterStart,
      requireWorkingAfterStart: true
    })
    const done = getAutomationAgentCompletionObservation({
      entry: status({ state: 'done', updatedAt: 5, lastAssistantMessage: '  finished  ' }),
      startedAfter: 2,
      sawWorkingAfterStart: working.sawWorkingAfterStart,
      requireWorkingAfterStart: true
    })

    expect(waiting.done).toBe(false)
    expect(working.sawWorkingAfterStart).toBe(true)
    expect(done).toEqual({
      sawWorkingAfterStart: true,
      latestAssistantMessage: 'finished',
      done: true
    })
  })
})
