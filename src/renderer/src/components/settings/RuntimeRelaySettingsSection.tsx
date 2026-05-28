import { Loader2, QrCode, RadioTower, RefreshCw, Save } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { SettingsSwitch } from './SettingsFormControls'
import { cn } from '@/lib/utils'

type RuntimeRelayConfig = {
  enabled: boolean
  endpoint: string
}

type RuntimeRelayStatus = {
  state: string
  activeDataSockets: number
  error: string | null
}

type RelayMobilePairingResult = {
  qrDataUrl: string
  pairingUrl: string
  endpoint: string
  deviceId: string
}

type RuntimeRelaySettingsSectionProps = {
  onMobilePairingGenerated: (result: RelayMobilePairingResult) => void
  onRelayConfigChanged?: () => void
  mobilePairingBusy?: boolean
  tryBeginMobilePairingGeneration?: () => number | null
  isCurrentMobilePairingGeneration?: (requestId: number) => boolean
  finishMobilePairingGeneration?: (requestId: number) => void
}

function relayStatusLabel(status: RuntimeRelayStatus): string {
  if (status.state === 'connected') {
    return status.activeDataSockets > 0
      ? `Connected · ${status.activeDataSockets} active`
      : 'Connected'
  }
  if (status.state === 'connecting') {
    return 'Connecting…'
  }
  if (status.state === 'error') {
    return 'Error'
  }
  return 'Off'
}

function relayStatusToneClass(status: RuntimeRelayStatus): string {
  if (status.state === 'error') {
    return 'border-destructive/40 text-destructive'
  }
  if (status.state === 'connected') {
    return 'border-border/60 text-foreground/80'
  }
  return 'border-border/60 text-muted-foreground'
}

export function RuntimeRelaySettingsSection({
  onMobilePairingGenerated,
  onRelayConfigChanged,
  mobilePairingBusy = false,
  tryBeginMobilePairingGeneration,
  isCurrentMobilePairingGeneration,
  finishMobilePairingGeneration
}: RuntimeRelaySettingsSectionProps): React.JSX.Element {
  const [config, setConfig] = useState<RuntimeRelayConfig>({ enabled: false, endpoint: '' })
  const [endpointInput, setEndpointInput] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<RuntimeRelayStatus>({
    state: 'disabled',
    activeDataSockets: 0,
    error: null
  })
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshingStatus, setRefreshingStatus] = useState(false)
  const [generatingQr, setGeneratingQr] = useState(false)
  const refreshingStatusRef = useRef(false)

  const loadRelayConfig = useCallback(async (): Promise<void> => {
    setLoadingConfig(true)
    try {
      const result = await window.api.mobile.getRelayConfig()
      setConfig(result.config)
      setEndpointInput(result.config.endpoint)
      setEnabled(result.config.enabled)
      setStatus(result.status)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load relay settings.')
    } finally {
      setLoadingConfig(false)
    }
  }, [])

  const refreshRelayStatus = useCallback(
    async (options: { showToastOnError?: boolean } = {}): Promise<void> => {
      // Why: interval and manual refresh can fire together; one in-flight read
      // keeps older relay status responses from replacing newer UI state.
      if (refreshingStatusRef.current) {
        return
      }
      refreshingStatusRef.current = true
      setRefreshingStatus(true)
      try {
        const result = await window.api.mobile.getRelayStatus()
        setStatus(result.status)
      } catch (error) {
        if (options.showToastOnError) {
          toast.error(error instanceof Error ? error.message : 'Failed to refresh relay status.')
        }
      } finally {
        refreshingStatusRef.current = false
        setRefreshingStatus(false)
      }
    },
    []
  )

  useEffect(() => {
    void loadRelayConfig()
  }, [loadRelayConfig])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const interval = window.setInterval(() => {
      void refreshRelayStatus()
    }, 2_000)
    return () => window.clearInterval(interval)
  }, [enabled, refreshRelayStatus])

  const saveRelayConfig = async (): Promise<void> => {
    setSaving(true)
    try {
      const result = await window.api.mobile.updateRelayConfig({
        enabled,
        endpoint: endpointInput.trim()
      })
      setConfig(result.config)
      setEndpointInput(result.config.endpoint)
      setEnabled(result.config.enabled)
      setStatus(result.status)
      onRelayConfigChanged?.()
      toast.success(result.config.enabled ? 'Relay enabled.' : 'Relay disabled.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save relay settings.')
    } finally {
      setSaving(false)
    }
  }

  const generateRelayQr = async (): Promise<void> => {
    const pairingRequestId = tryBeginMobilePairingGeneration?.()
    if (pairingRequestId === null) {
      return
    }
    const requestId = pairingRequestId ?? 0
    setGeneratingQr(true)
    try {
      const result = await window.api.mobile.getRelayPairingQR({ rotate: true, scope: 'mobile' })
      if (isCurrentMobilePairingGeneration && !isCurrentMobilePairingGeneration(requestId)) {
        return
      }
      if (!result.available) {
        toast.error('Relay pairing is unavailable.')
        await refreshRelayStatus()
        return
      }
      onMobilePairingGenerated(result)
      toast.success('Generated relay pairing code.')
    } catch (error) {
      if (!isCurrentMobilePairingGeneration || isCurrentMobilePairingGeneration(requestId)) {
        toast.error(error instanceof Error ? error.message : 'Failed to generate relay QR code.')
      }
    } finally {
      setGeneratingQr(false)
      finishMobilePairingGeneration?.(requestId)
    }
  }

  const hasUnsavedChanges = config.enabled !== enabled || config.endpoint !== endpointInput.trim()
  const relayConnected = status.state === 'connected'
  const relayConfigLocked = loadingConfig || saving || generatingQr || mobilePairingBusy

  return (
    <div className="rounded-lg border border-border/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <RadioTower className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Self-hosted relay (fallback)</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[11px]',
              relayStatusToneClass(status)
            )}
          >
            {relayStatusLabel(status)}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void refreshRelayStatus({ showToastOnError: true })}
                disabled={refreshingStatus}
                aria-label="Refresh relay status"
                className="text-muted-foreground"
              >
                <RefreshCw className={refreshingStatus ? 'animate-spin' : ''} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              Refresh relay status
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        If direct pairing can&apos;t reach this computer, route traffic through a relay you trust.
        Pairing data and runtime traffic stay end-to-end encrypted; the relay only sees ciphertext.
      </p>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 space-y-1">
            <Label htmlFor="runtime-relay-endpoint">Relay endpoint</Label>
            <Input
              id="runtime-relay-endpoint"
              value={endpointInput}
              onChange={(event) => setEndpointInput(event.target.value)}
              placeholder="wss://relay.example.com/ws?enrollmentToken=..."
              disabled={relayConfigLocked}
              className="h-8 font-mono text-xs"
            />
          </div>
          <div className="flex items-end gap-2">
            <SettingsSwitch
              checked={enabled}
              onChange={() => setEnabled((current) => !current)}
              ariaLabel="Enable self-hosted relay"
              disabled={relayConfigLocked}
            />
            <Button
              type="button"
              variant={hasUnsavedChanges ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={() => void saveRelayConfig()}
              disabled={relayConfigLocked || !hasUnsavedChanges}
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
        {status.error ? <p className="text-xs text-destructive">{status.error}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Why: wrap in span so the tooltip still surfaces while the
                  button is disabled (Radix triggers can't fire on the disabled
                  button itself). */}
              <span tabIndex={relayConnected ? -1 : 0}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void generateRelayQr()}
                  disabled={
                    !relayConnected || generatingQr || mobilePairingBusy || hasUnsavedChanges
                  }
                >
                  {generatingQr ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <QrCode className="size-3.5" />
                  )}
                  {generatingQr ? 'Generating…' : 'Generate pairing QR'}
                </Button>
              </span>
            </TooltipTrigger>
            {!relayConnected || hasUnsavedChanges ? (
              <TooltipContent side="bottom" sideOffset={6}>
                {hasUnsavedChanges
                  ? 'Save changes before generating a relay code.'
                  : 'Connect to the relay to generate a relay code.'}
              </TooltipContent>
            ) : null}
          </Tooltip>
          <p className="text-xs text-muted-foreground">
            Paste a relay URL with its enrollment token, save, then generate a code for the mobile
            app.
          </p>
        </div>
      </div>
    </div>
  )
}
