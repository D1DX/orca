import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { hardenExistingSecureFile, writeSecureJsonFile } from '../../shared/secure-file'
import type { RuntimeRelayConfig } from './relay-client'

const CONFIG_FILE = 'runtime-relay-config.json'

export const DEFAULT_RUNTIME_RELAY_CONFIG: RuntimeRelayConfig = {
  enabled: false,
  endpoint: ''
}

export function loadRuntimeRelayConfig(userDataPath: string): RuntimeRelayConfig {
  const path = runtimeRelayConfigPath(userDataPath)
  if (!existsSync(path)) {
    return DEFAULT_RUNTIME_RELAY_CONFIG
  }
  try {
    hardenExistingSecureFile(path)
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as RuntimeRelayConfig
    return normalizeRuntimeRelayConfig(parsed)
  } catch {
    return DEFAULT_RUNTIME_RELAY_CONFIG
  }
}

export function saveRuntimeRelayConfig(
  userDataPath: string,
  config: RuntimeRelayConfig
): RuntimeRelayConfig {
  const normalized = normalizeRuntimeRelayConfig(config)
  const path = runtimeRelayConfigPath(userDataPath)
  writeSecureJsonFile(path, normalized)
  return normalized
}

function runtimeRelayConfigPath(userDataPath: string): string {
  return join(userDataPath, CONFIG_FILE)
}

function normalizeRuntimeRelayConfig(config: RuntimeRelayConfig): RuntimeRelayConfig {
  return {
    enabled: config.enabled === true,
    endpoint: typeof config.endpoint === 'string' ? config.endpoint.trim() : ''
  }
}
