import { useEffect, useState, type ReactNode } from 'react'
import { Check, Monitor, Moon, Plus, Server, Sun, Trash2, Zap, Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Aria2Client, rpcUrl } from '@/lib/aria2/rpc'
import type { Aria2Version } from '@/lib/aria2/types'
import { newProfileId, profileLabel, useSettings, type RpcProfile, type Theme } from '@/store/settings'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 border-t border-line py-8 first:border-t-0 first:pt-2 md:grid md:grid-cols-[14rem_1fr] md:gap-10">
      <div className="mb-5 md:mb-0">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line py-3.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-[13px] text-fg-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function ThemePicker() {
  const theme = useSettings((s) => s.theme)
  const set = useSettings((s) => s.set)
  const options: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => set({ theme: o.value })}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm transition-colors',
            theme === o.value ? 'border-accent bg-accent-soft/40 text-fg' : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
          )}
        >
          <o.icon className="size-5" strokeWidth={1.75} />
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ProfileEditor({ profile, onDone }: { profile: RpcProfile; onDone: () => void }) {
  const { upsertProfile, removeProfile, profiles, setActiveProfile, activeProfileId } = useSettings()
  const [draft, setDraft] = useState(profile)
  const [testing, setTesting] = useState(false)
  useEffect(() => setDraft(profile), [profile])
  const patch = (p: Partial<RpcProfile>) => setDraft((d) => ({ ...d, ...p }))
  const isNew = !profiles.some((p) => p.id === profile.id)
  const isWs = draft.protocol === 'ws' || draft.protocol === 'wss'

  const test = async () => {
    setTesting(true)
    const client = new Aria2Client(draft)
    try {
      const v = await client.call<Aria2Version>('aria2.getVersion')
      toast.success(`Connected to aria2 ${v.version}`, { description: rpcUrl(draft) })
    } catch (e) {
      toast.error('Connection failed', { description: (e as Error).message })
    } finally {
      client.close()
      setTesting(false)
    }
  }

  const save = () => {
    if (!draft.host.trim()) {
      toast.error('Host is required')
      return
    }
    upsertProfile({ ...draft, host: draft.host.trim(), port: draft.port.trim() || '6800' })
    if (isNew) setActiveProfile(draft.id)
    toast.success('Server saved')
    onDone()
  }

  return (
    <div className="animate-in space-y-4 rounded-xl border border-line bg-surface p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="eyebrow mb-1.5 block">Name</span>
          <Input value={draft.alias} onChange={(e) => patch({ alias: e.target.value })} placeholder="e.g. Home NAS" />
        </label>
        <label>
          <span className="eyebrow mb-1.5 block">Protocol</span>
          <NativeSelect value={draft.protocol} onChange={(e) => patch({ protocol: e.target.value as RpcProfile['protocol'] })}>
            <option value="ws">WebSocket (ws)</option>
            <option value="wss">WebSocket secure (wss)</option>
            <option value="http">HTTP</option>
            <option value="https">HTTPS</option>
          </NativeSelect>
        </label>
        {!isWs && (
          <label>
            <span className="eyebrow mb-1.5 block">HTTP method</span>
            <NativeSelect value={draft.httpMethod} onChange={(e) => patch({ httpMethod: e.target.value as 'POST' | 'GET' })}>
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </NativeSelect>
          </label>
        )}
        <label className={cn(isWs && 'sm:col-span-1')}>
          <span className="eyebrow mb-1.5 block">Host</span>
          <Input value={draft.host} onChange={(e) => patch({ host: e.target.value })} placeholder="localhost" className="tabular" />
        </label>
        <label>
          <span className="eyebrow mb-1.5 block">Port</span>
          <Input value={draft.port} inputMode="numeric" onChange={(e) => patch({ port: e.target.value.replace(/\D/g, '') })} placeholder="6800" className="tabular" />
        </label>
        <label>
          <span className="eyebrow mb-1.5 block">Path</span>
          <Input value={draft.path} onChange={(e) => patch({ path: e.target.value })} placeholder="jsonrpc" className="tabular" />
        </label>
        <label className="sm:col-span-2">
          <span className="eyebrow mb-1.5 block">Secret token</span>
          <Input type="password" value={draft.secret} onChange={(e) => patch({ secret: e.target.value })} placeholder="--rpc-secret" autoComplete="off" />
        </label>
        {!isWs && (
          <label className="sm:col-span-2">
            <span className="eyebrow mb-1.5 block">Extra request headers</span>
            <Textarea
              value={draft.headers}
              onChange={(e) => patch({ headers: e.target.value })}
              placeholder="Header-Name: value (one per line)"
              className="tabular min-h-16 text-xs"
            />
          </label>
        )}
      </div>
      <div className="tabular truncate rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-muted">{rpcUrl(draft)}</div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={test} loading={testing}>
          <Zap /> Test
        </Button>
        {!isNew && profiles.length > 1 && (
          <Button
            variant="ghost"
            className="text-danger hover:bg-danger-soft hover:text-danger"
            onClick={() => {
              removeProfile(profile.id)
              onDone()
            }}
          >
            <Trash2 /> Delete
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {isNew ? 'Add server' : activeProfileId === profile.id ? 'Save & reconnect' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Servers() {
  const { profiles, activeProfileId, setActiveProfile } = useSettings()
  const [editing, setEditing] = useState<RpcProfile | null>(null)
  return (
    <div className="space-y-2">
      {profiles.map((p) =>
        editing?.id === p.id ? (
          <ProfileEditor key={p.id} profile={p} onDone={() => setEditing(null)} />
        ) : (
          <div
            key={p.id}
            className={cn(
              'flex items-center gap-3 rounded-xl border px-4 py-3',
              p.id === activeProfileId ? 'border-accent/60 bg-accent-soft/25' : 'border-line bg-surface',
            )}
          >
            <Server className="size-4 text-fg-faint" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{profileLabel(p)}</div>
              <div className="tabular truncate text-xs text-fg-muted">{rpcUrl(p)}</div>
            </div>
            {p.id === activeProfileId ? (
              <span className="eyebrow inline-flex items-center gap-1 !text-accent">
                <Check className="size-3" /> In use
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setActiveProfile(p.id)}>
                Use
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
              Edit
            </Button>
          </div>
        ),
      )}
      {editing && !profiles.some((p) => p.id === editing.id) ? (
        <ProfileEditor profile={editing} onDone={() => setEditing(null)} />
      ) : (
        <Button
          variant="ghost"
          className="w-full border border-dashed border-line-strong"
          onClick={() =>
            setEditing({
              id: newProfileId(),
              alias: '',
              protocol: 'ws',
              host: 'localhost',
              port: '6800',
              path: 'jsonrpc',
              secret: '',
              httpMethod: 'POST',
              headers: '',
            })
          }
        >
          <Plus /> Add server
        </Button>
      )}
    </div>
  )
}

function DataSection() {
  const exportSettings = () => {
    const raw = localStorage.getItem('arietta:settings') ?? '{}'
    const blob = new Blob([raw], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'arietta-settings.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const importSettings = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const parsed = JSON.parse(await file.text())
        if (!parsed?.state?.profiles) throw new Error('Not an Arietta settings file')
        useSettings.setState(parsed.state)
        toast.success('Settings imported')
      } catch (e) {
        toast.error('Import failed', { description: (e as Error).message })
      }
    }
    input.click()
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={exportSettings}>
        <Download /> Export settings
      </Button>
      <Button variant="outline" onClick={importSettings}>
        <Upload /> Import settings
      </Button>
      <Button
        variant="ghost"
        className="text-danger hover:bg-danger-soft hover:text-danger"
        onClick={() => {
          if (window.confirm('Reset all preferences and saved servers?')) {
            localStorage.removeItem('arietta:settings')
            window.location.reload()
          }
        }}
      >
        Reset everything
      </Button>
    </div>
  )
}

export function PreferencesPage({ section }: { section?: string }) {
  const s = useSettings()
  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView({ behavior: 'smooth' })
  }, [section])

  const intervals = [
    { v: 500, l: '0.5 s' },
    { v: 1000, l: '1 s' },
    { v: 2000, l: '2 s' },
    { v: 5000, l: '5 s' },
    { v: 10000, l: '10 s' },
  ]

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-5 sm:px-6 sm:pt-7">
      <div className="eyebrow">Configure</div>
      <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">Preferences</h1>
      <p className="mt-1 text-sm text-fg-muted">Stored in this browser only.</p>

      <div className="mt-8">
        <Section id="rpc" title="aria2 servers" description="Connect to one or more aria2 RPC endpoints and switch between them from the sidebar.">
          <Servers />
        </Section>

        <Section id="appearance" title="Appearance">
          <ThemePicker />
          <div className="mt-4">
            <Row label="Compact task list" hint="Denser rows without progress bars.">
              <Switch checked={s.density === 'compact'} onCheckedChange={(c) => s.set({ density: c ? 'compact' : 'comfortable' })} />
            </Row>
            <Row label="Window title" hint="Placeholders: ${downspeed} ${upspeed} ${active} ${waiting} ${stopped}">
              <Input value={s.titleTemplate} onChange={(e) => s.set({ titleTemplate: e.target.value })} className="tabular w-72 text-xs" />
            </Row>
          </div>
        </Section>

        <Section id="behavior" title="Behavior">
          <Row label="Task refresh interval">
            <NativeSelect value={s.refreshInterval} onChange={(e) => s.set({ refreshInterval: Number(e.target.value) })} className="w-28">
              {intervals.map((i) => (
                <option key={i.v} value={i.v}>{i.l}</option>
              ))}
            </NativeSelect>
          </Row>
          <Row label="Speed refresh interval">
            <NativeSelect value={s.globalStatInterval} onChange={(e) => s.set({ globalStatInterval: Number(e.target.value) })} className="w-28">
              {intervals.map((i) => (
                <option key={i.v} value={i.v}>{i.l}</option>
              ))}
            </NativeSelect>
          </Row>
          <Row label="After adding a download">
            <NativeSelect value={s.afterCreatingTask} onChange={(e) => s.set({ afterCreatingTask: e.target.value as 'list' | 'stay' })} className="w-44">
              <option value="list">Go to its list</option>
              <option value="stay">Stay on this page</option>
            </NativeSelect>
          </Row>
          <Row label="Confirm before removing tasks">
            <Switch checked={s.confirmRemoval} onCheckedChange={(c) => s.set({ confirmRemoval: c })} />
          </Row>
          <Row label="Remove the old task after retrying">
            <Switch checked={s.removeOldTaskAfterRetrying} onCheckedChange={(c) => s.set({ removeOldTaskAfterRetrying: c })} />
          </Row>
          <Row label="Desktop notifications" hint="When a download completes or fails while this tab is in the background. Needs WebSocket.">
            <Switch
              checked={s.browserNotifications}
              onCheckedChange={async (c) => {
                if (c && 'Notification' in window && Notification.permission !== 'granted') {
                  const res = await Notification.requestPermission()
                  if (res !== 'granted') {
                    toast.error('Notification permission denied')
                    return
                  }
                }
                s.set({ browserNotifications: c })
              }}
            />
          </Row>
        </Section>

        <Section id="shortcuts" title="Keyboard">
          <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {[
              ['N', 'New download'],
              ['1 – 4', 'Switch task list'],
              ['/', 'Filter tasks'],
              ['⌘/Ctrl A', 'Select all tasks'],
              ['Delete', 'Remove selected'],
              ['Esc', 'Clear selection'],
              ['⌘/Ctrl ↵', 'Submit new download'],
              ['Paste', 'Add copied link'],
            ].map(([k, l]) => (
              <div key={k} className="flex items-center justify-between border-b border-line py-2">
                <span className="text-fg-muted">{l}</span>
                <span className="tabular text-xs">{k}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="data" title="Data" description="Back up servers and preferences, or move them to another browser.">
          <DataSection />
        </Section>
      </div>
    </div>
  )
}
