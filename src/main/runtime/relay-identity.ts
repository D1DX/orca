import { randomBytes } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { hardenExistingSecureFile, writeSecureJsonFile } from '../../shared/secure-file'

export type RuntimeRelayIdentity = {
  serverId: string
  hostToken: string
}

const IDENTITY_FILE = 'runtime-relay-identity.json'

export function loadOrCreateRuntimeRelayIdentity(userDataPath: string): RuntimeRelayIdentity {
  const path = runtimeRelayIdentityPath(userDataPath)
  if (existsSync(path)) {
    try {
      hardenExistingSecureFile(path)
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as RuntimeRelayIdentity
      if (isValidRelayIdentity(parsed)) {
        return parsed
      }
    } catch {
      // Fall through and replace corrupt identity with a fresh host-only secret.
    }
  }
  const identity = createRuntimeRelayIdentity()
  writeSecureJsonFile(path, identity)
  return identity
}

export function rotateRuntimeRelayIdentity(userDataPath: string): RuntimeRelayIdentity {
  const identity = createRuntimeRelayIdentity()
  const path = runtimeRelayIdentityPath(userDataPath)
  writeSecureJsonFile(path, identity)
  return identity
}

function runtimeRelayIdentityPath(userDataPath: string): string {
  return join(userDataPath, IDENTITY_FILE)
}

function createRuntimeRelayIdentity(): RuntimeRelayIdentity {
  return {
    serverId: randomBytes(24).toString('base64url'),
    hostToken: randomBytes(32).toString('base64url')
  }
}

function isValidRelayIdentity(value: RuntimeRelayIdentity): boolean {
  return (
    typeof value.serverId === 'string' &&
    value.serverId.length >= 16 &&
    typeof value.hostToken === 'string' &&
    value.hostToken.length >= 32
  )
}
