import { useState, type ReactNode } from 'react'
import { Link } from 'wouter'
import { Power, Save } from 'lucide-react'
import { useGlobalStat, useRpcAction, useSessionInfo, useVersion } from '@/hooks/aria2'
import { useAria2 } from '@/lib/aria2/client-context'
import { rpcUrl } from '@/lib/aria2/rpc'
import { profileLabel, useActiveProfile } from '@/store/settings'
import { bytesParts } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog'

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('overflow-hidden rounded-2xl border border-line bg-surface', className)}>
      <div className="eyebrow border-b border-line px-5 py-3">{title}</div>
      {children}
    </section>
  )
}

function Metric({ label, value, unit, tone }: { label: string; value: ReactNode; unit?: string; tone?: string }) {
  return (
    <div className="px-5 py-4">
      <div className="eyebrow">{label}</div>
      <div className={cn('tabular mt-1 text-3xl font-medium tracking-[-0.03em]', tone)}>
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-fg-faint">{unit}</span>}
      </div>
    </div>
  )
}

export function StatusPage() {
  const profile = useActiveProfile()
  const { state } = useAria2()
  const { data: version, error: versionError } = useVersion()
  const { data: session } = useSessionInfo()
  const { data: stat } = useGlobalStat()
  const [confirmShutdown, setConfirmShutdown] = useState(false)

  const save = useRpcAction<void>((c) => c.call('aria2.saveSession'), {
    success: 'Session saved',
    errorTitle: 'Could not save session',
  })
  const shutdown = useRpcAction<void>((c) => c.call('aria2.shutdown'), {
    success: 'aria2 is shutting down',
    errorTitle: 'Could not shut down aria2',
  })

  const [down, downUnit] = bytesParts(stat?.downloadSpeed ?? 0)
  const [up, upUnit] = bytesParts(stat?.uploadSpeed ?? 0)
  const connected = !!version && !versionError

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-5 sm:px-6 sm:pt-7">
      <div className="eyebrow">Server</div>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">{profileLabel(profile)}</h1>
          <p className="tabular mt-1 truncate text-sm text-fg-muted">{rpcUrl(profile)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!connected} loading={save.isPending} onClick={() => save.mutate()}>
            <Save /> Save session
          </Button>
          <Button variant="danger" disabled={!connected} onClick={() => setConfirmShutdown(true)}>
            <Power /> Shut down
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <Card title="Connection" className="grid-texture">
          <div className="flex items-center gap-3 px-5 pt-5">
            <span className="relative flex size-2.5">
              {connected && <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />}
              <span className={cn('relative inline-flex size-2.5 rounded-full', connected ? 'bg-ok' : state === 'connecting' ? 'bg-warn' : 'bg-danger')} />
            </span>
            <span className="text-sm font-medium">
              {connected ? 'Connected' : state === 'connecting' ? 'Connecting…' : 'Not connected'}
            </span>
            {profile.protocol.startsWith('ws') && <span className="eyebrow">WebSocket</span>}
          </div>
          {versionError && <p className="px-5 pt-2 text-sm text-danger">{versionError.message}</p>}
          <div className="grid grid-cols-2">
            <Metric label="aria2 version" value={version?.version ?? '-'} />
            <Metric label="Session" value={<span className="text-base">{session?.sessionId?.slice(0, 16) ?? '-'}</span>} />
          </div>
          {!connected && (
            <div className="px-5 pb-5 text-sm text-fg-muted">
              Check the server in{' '}
              <Link href="/settings/rpc" className="text-accent hover:underline">
                Preferences
              </Link>
              . aria2 must run with <code className="tabular rounded bg-surface-2 px-1.5 py-0.5 text-xs">--enable-rpc</code>.
            </div>
          )}
        </Card>

        <Card title="Right now">
          <div className="grid grid-cols-2 divide-x divide-line">
            <Metric label="Down" value={down} unit={`${downUnit}/s`} tone="text-accent" />
            <Metric label="Up" value={up} unit={`${upUnit}/s`} tone="text-up" />
          </div>
          <div className="grid grid-cols-3 divide-x divide-line border-t border-line">
            <Metric label="Active" value={stat?.numActive ?? '-'} />
            <Metric label="Waiting" value={stat?.numWaiting ?? '-'} />
            <Metric label="Stopped" value={stat?.numStoppedTotal ?? stat?.numStopped ?? '-'} />
          </div>
        </Card>

        {version && (
          <Card title="Enabled features" className="md:col-span-2">
            <div className="flex flex-wrap gap-2 p-5">
              {version.enabledFeatures.map((f) => (
                <span key={f} className="tabular rounded-md border border-line bg-surface-2 px-2.5 py-1 text-xs">
                  {f}
                </span>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Dialog open={confirmShutdown} onOpenChange={setConfirmShutdown}>
        <DialogContent title="Shut down aria2?" description="All downloads stop. You will need to start aria2 again on the server.">
          <DialogBody />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button
              variant="danger"
              loading={shutdown.isPending}
              onClick={() => shutdown.mutate(undefined, { onSettled: () => setConfirmShutdown(false) })}
            >
              Shut down
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
