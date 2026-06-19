import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from './dispatcher'
import type { RpcRequest } from './core'
import type { DriverState, OrcaRuntimeService } from '../orca-runtime'
import { TERMINAL_METHODS } from './methods/terminal'

function stubRuntime(overrides: Partial<OrcaRuntimeService> = {}): OrcaRuntimeService {
  return {
    getRuntimeId: () => 'test-runtime',
    ...overrides
  } as OrcaRuntimeService
}

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

describe('terminal send RPC', () => {
  it('reports whether a terminal handle is running a recognized agent', async () => {
    const runtime = stubRuntime({
      isTerminalRunningAgent: vi.fn().mockResolvedValue(true)
    })
    const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('terminal.isRunningAgent', {
        terminal: 'terminal-1'
      })
    )

    expect(response.ok).toBe(true)
    if (!response.ok) {
      throw new Error(response.error.message)
    }
    expect(response.result).toEqual({ isRunningAgent: true })
    expect(runtime.isTerminalRunningAgent).toHaveBeenCalledWith('terminal-1')
  })

  it('drops desktop input while a mobile client owns the terminal floor', async () => {
    const runtime = stubRuntime({
      resolveLeafForHandle: vi.fn().mockReturnValue({ ptyId: 'pty-1' }),
      getDriver: vi.fn().mockReturnValue({ kind: 'mobile', clientId: 'mobile-1' }),
      sendTerminal: vi.fn(),
      mobileTookFloor: vi.fn()
    })
    const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('terminal.send', {
        terminal: 'terminal-1',
        text: 'x',
        client: { id: 'desktop-1', type: 'desktop' }
      })
    )

    expect(response.ok).toBe(true)
    if (!response.ok) {
      throw new Error(response.error.message)
    }
    expect(response.result).toEqual({
      send: {
        handle: 'terminal-1',
        accepted: false,
        bytesWritten: 0
      }
    })
    expect(runtime.sendTerminal).not.toHaveBeenCalled()
    expect(runtime.mobileTookFloor).not.toHaveBeenCalled()
  })

  it('drops idle-gated desktop input while a mobile client owns the terminal floor', async () => {
    const runtime = stubRuntime({
      resolveLeafForHandle: vi.fn().mockReturnValue({ ptyId: 'pty-1' }),
      getDriver: vi.fn().mockReturnValue({ kind: 'mobile', clientId: 'mobile-1' }),
      sendTerminalWhenIdle: vi.fn(),
      mobileTookFloor: vi.fn()
    })
    const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('terminal.sendWhenIdle', {
        terminal: 'terminal-1',
        text: 'x',
        enter: true,
        timeoutMs: 60_000,
        client: { id: 'desktop-1', type: 'desktop' }
      })
    )

    expect(response.ok).toBe(true)
    if (!response.ok) {
      throw new Error(response.error.message)
    }
    expect(response.result).toEqual({
      send: {
        handle: 'terminal-1',
        status: 'not-writable',
        bytesWritten: 0
      }
    })
    expect(runtime.sendTerminalWhenIdle).not.toHaveBeenCalled()
    expect(runtime.mobileTookFloor).not.toHaveBeenCalled()
  })

  it('routes idle-gated terminal sends through the runtime and preserves mobile floor semantics', async () => {
    const runtime = stubRuntime({
      resolveLeafForHandle: vi.fn().mockReturnValue({ ptyId: 'pty-1' }),
      getDriver: vi.fn().mockReturnValue({ kind: 'mobile', clientId: 'mobile-1' }),
      sendTerminalWhenIdle: vi.fn().mockResolvedValue({
        handle: 'terminal-1',
        status: 'sent',
        bytesWritten: 1
      }),
      mobileTookFloor: vi.fn().mockResolvedValue(undefined)
    })
    const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('terminal.sendWhenIdle', {
        terminal: 'terminal-1',
        text: 'x',
        enter: true,
        timeoutMs: 60_000
      })
    )

    expect(response.ok).toBe(true)
    if (!response.ok) {
      throw new Error(response.error.message)
    }
    expect(response.result).toMatchObject({ send: { status: 'sent', bytesWritten: 1 } })
    expect(runtime.sendTerminalWhenIdle).toHaveBeenCalledWith(
      'terminal-1',
      {
        text: 'x',
        enter: true,
        interrupt: false
      },
      { timeoutMs: 60_000, signal: undefined, beforeWrite: expect.any(Function) }
    )
    expect(runtime.mobileTookFloor).toHaveBeenCalledWith('pty-1', 'mobile-1')
  })

  it('rechecks mobile floor ownership immediately before idle-gated writes', async () => {
    let driver: DriverState = { kind: 'desktop' }
    const runtime = stubRuntime({
      resolveLeafForHandle: vi.fn().mockReturnValue({ ptyId: 'pty-1' }),
      getDriver: vi.fn(() => driver),
      sendTerminalWhenIdle: vi.fn(async (_handle, _action, options) => {
        driver = { kind: 'mobile', clientId: 'mobile-1' }
        try {
          options?.beforeWrite?.('pty-1')
        } catch {
          return {
            handle: 'terminal-1',
            status: 'not-writable' as const,
            bytesWritten: 0
          }
        }
        return {
          handle: 'terminal-1',
          status: 'sent' as const,
          bytesWritten: 1
        }
      }),
      mobileTookFloor: vi.fn().mockResolvedValue(undefined)
    })
    const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('terminal.sendWhenIdle', {
        terminal: 'terminal-1',
        text: 'x',
        enter: true,
        timeoutMs: 60_000,
        client: { id: 'desktop-1', type: 'desktop' }
      })
    )

    expect(response.ok).toBe(true)
    if (!response.ok) {
      throw new Error(response.error.message)
    }
    expect(response.result).toEqual({
      send: {
        handle: 'terminal-1',
        status: 'not-writable',
        bytesWritten: 0
      }
    })
    expect(runtime.mobileTookFloor).not.toHaveBeenCalled()
  })

  it('accepts legacy clientless mobile input when the current driver is mobile', async () => {
    const runtime = stubRuntime({
      resolveLeafForHandle: vi.fn().mockReturnValue({ ptyId: 'pty-1' }),
      getDriver: vi.fn().mockReturnValue({ kind: 'mobile', clientId: 'mobile-1' }),
      sendTerminal: vi.fn().mockResolvedValue({
        handle: 'terminal-1',
        accepted: true,
        bytesWritten: 1
      }),
      mobileTookFloor: vi.fn().mockResolvedValue(undefined)
    })
    const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('terminal.send', {
        terminal: 'terminal-1',
        text: 'x'
      })
    )

    expect(response.ok).toBe(true)
    if (!response.ok) {
      throw new Error(response.error.message)
    }
    expect(response.result).toMatchObject({ send: { accepted: true, bytesWritten: 1 } })
    expect(runtime.sendTerminal).toHaveBeenCalledWith('terminal-1', {
      text: 'x',
      enter: false,
      interrupt: false
    })
    expect(runtime.mobileTookFloor).toHaveBeenCalledWith('pty-1', 'mobile-1')
  })

  it('routes terminal restore fit through the runtime driver state machine', async () => {
    const runtime = stubRuntime({
      resolveLeafForHandle: vi.fn().mockReturnValue({ ptyId: 'pty-1' }),
      reclaimTerminalForDesktop: vi.fn().mockResolvedValue(true)
    })
    const dispatcher = new RpcDispatcher({ runtime, methods: TERMINAL_METHODS })

    const response = await dispatcher.dispatch(
      makeRequest('terminal.restoreFit', {
        terminal: 'terminal-1'
      })
    )

    expect(response.ok).toBe(true)
    if (!response.ok) {
      throw new Error(response.error.message)
    }
    expect(response.result).toEqual({ restored: true })
    expect(runtime.reclaimTerminalForDesktop).toHaveBeenCalledWith('pty-1')
  })
})
