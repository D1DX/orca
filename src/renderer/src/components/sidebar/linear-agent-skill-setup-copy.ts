import type { LocalAgentRuntime } from '../settings/CliSkillRuntimeSetup'
import { translate } from '@/i18n/i18n'

export function getLinearAgentSkillSetupMissingLabel(
  cliAvailable: boolean,
  skillInstalled: boolean
): string {
  if (!cliAvailable && !skillInstalled) {
    return translate(
      'auto.components.sidebar.LinearAgentSkillSetupPrompt.missingCliAndSkill',
      'Orca CLI and Linear agent skill are missing.'
    )
  }
  if (!cliAvailable) {
    return translate(
      'auto.components.sidebar.LinearAgentSkillSetupPrompt.missingCli',
      'Orca CLI is missing.'
    )
  }
  return translate(
    'auto.components.sidebar.LinearAgentSkillSetupPrompt.missingSkill',
    'Linear agent skill is missing.'
  )
}

export function getLinearAgentSkillSetupToastTitle(
  cliAvailable: boolean,
  skillInstalled: boolean
): string {
  if (!cliAvailable && !skillInstalled) {
    return translate(
      'auto.components.sidebar.LinearAgentSkillSetupPrompt.toastMissingCliAndSkill',
      'Orca CLI and Linear skill are missing'
    )
  }
  if (!cliAvailable) {
    return translate(
      'auto.components.sidebar.LinearAgentSkillSetupPrompt.toastMissingCli',
      'Orca CLI is missing'
    )
  }
  return translate(
    'auto.components.sidebar.LinearAgentSkillSetupPrompt.toastMissingSkill',
    'Linear skill is missing'
  )
}

export function getLinearAgentSkillSetupToastDescription(
  remote: boolean,
  agentRuntime: LocalAgentRuntime
): string {
  const baseDescription = getLinearAgentSkillSetupToastBaseDescription()
  if (remote) {
    return translate(
      'auto.components.sidebar.LinearAgentSkillSetupPrompt.toastRemoteDescription',
      '{{value0}} Remote environments may need setup too.',
      { value0: baseDescription }
    )
  }
  if (agentRuntime.runtime === 'wsl') {
    return translate(
      'auto.components.sidebar.LinearAgentSkillSetupPrompt.toastWslDescription',
      '{{value0}} This setup runs in the selected WSL runtime.',
      { value0: baseDescription }
    )
  }
  return baseDescription
}

function getLinearAgentSkillSetupToastBaseDescription(): string {
  return translate(
    'auto.components.sidebar.LinearAgentSkillSetupPrompt.toastLinkedTaskDescription',
    'Needed for linked Linear tasks.'
  )
}

export function getLinearAgentSkillSetupInlineRuntimeCopy(
  remote: boolean,
  agentRuntime: LocalAgentRuntime
): string {
  if (remote) {
    return translate(
      'auto.components.sidebar.LinearAgentSkillSetupPrompt.remoteCopy',
      'This installs host setup; remote agent environments may need separate setup.'
    )
  }
  if (agentRuntime.runtime === 'wsl') {
    return translate(
      'auto.components.sidebar.LinearAgentSkillSetupPrompt.wslCopy',
      'Install it for WSL agent handoffs from linked Linear work.'
    )
  }
  return translate(
    'auto.components.sidebar.LinearAgentSkillSetupPrompt.hostCopy',
    'Install it for host agent handoffs from linked Linear work.'
  )
}
