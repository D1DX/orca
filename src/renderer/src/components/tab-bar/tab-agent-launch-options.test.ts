import { describe, expect, it } from 'vitest'
import {
  buildTabAgentLaunchOptions,
  findMatchingTabAgentLaunchOptions,
  orderTabLaunchAgents
} from './tab-agent-launch-options'

describe('tab agent launch options', () => {
  it('orders detected agents by the configured default first', () => {
    expect(orderTabLaunchAgents('codex', ['claude', 'codex', 'gemini'])).toEqual([
      'codex',
      'claude',
      'gemini'
    ])
  })

  it('matches detected agents by id, label, command, and command override', () => {
    const options = buildTabAgentLaunchOptions(['claude', 'codex', 'antigravity'], {
      codex: 'codex-beta'
    })

    expect(
      findMatchingTabAgentLaunchOptions('Claude', options).map((option) => option.agent)
    ).toEqual(['claude'])
    expect(findMatchingTabAgentLaunchOptions('openai codex', options)).toEqual([])
    expect(
      findMatchingTabAgentLaunchOptions('codex-beta', options).map((option) => option.agent)
    ).toEqual(['codex'])
    expect(findMatchingTabAgentLaunchOptions('agy', options).map((option) => option.agent)).toEqual(
      ['antigravity']
    )
  })

  it('adds named launch profile variants under the built-in agent identity', () => {
    const options = buildTabAgentLaunchOptions(['codex'], {}, [
      {
        id: 'codex:work',
        agentId: 'codex',
        name: 'Work',
        args: '--profile work'
      }
    ])

    expect(options).toEqual([
      expect.objectContaining({ agent: 'codex', label: 'Codex' }),
      expect.objectContaining({
        agent: 'codex',
        label: 'Codex: Work',
        profileId: 'codex:work'
      })
    ])
    expect(
      findMatchingTabAgentLaunchOptions('Codex: Work', options).map((option) => ({
        agent: option.agent,
        profileId: option.profileId
      }))
    ).toEqual([{ agent: 'codex', profileId: 'codex:work' }])
    expect(
      findMatchingTabAgentLaunchOptions('--profile work', options).map((option) => ({
        agent: option.agent,
        profileId: option.profileId
      }))
    ).toEqual([{ agent: 'codex', profileId: 'codex:work' }])
  })
})
