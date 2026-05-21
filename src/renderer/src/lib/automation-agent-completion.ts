import type { AgentStatusEntry } from '../../../shared/agent-status-types'

export type AutomationAgentCompletionObservation = {
  sawWorkingAfterStart: boolean
  latestAssistantMessage: string | null
  done: boolean
}

export function getAutomationAgentCompletionObservation(args: {
  entry: AgentStatusEntry | undefined
  startedAfter: number
  sawWorkingAfterStart: boolean
  requireWorkingAfterStart?: boolean
}): AutomationAgentCompletionObservation {
  const { entry, startedAfter, requireWorkingAfterStart } = args
  if (!entry || entry.updatedAt < startedAfter) {
    return {
      sawWorkingAfterStart: args.sawWorkingAfterStart,
      latestAssistantMessage: null,
      done: false
    }
  }

  const sawWorkingAfterStart = args.sawWorkingAfterStart || entry.state === 'working'
  return {
    sawWorkingAfterStart,
    latestAssistantMessage: entry.lastAssistantMessage?.trim() || null,
    done: entry.state === 'done' && (!requireWorkingAfterStart || sawWorkingAfterStart)
  }
}
