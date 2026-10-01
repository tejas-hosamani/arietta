import { useMemo, useState } from 'react'
import { Lock, Unlock, Sprout } from 'lucide-react'
import type { Aria2Task } from '@/lib/aria2/types'
import { bitfieldRatio, decodeBitfield, isBitTorrent, peerClient } from '@/lib/aria2/task'
import { optionDef, deserializeOption, serializeOption, taskOptionKeys, type TaskOptionContext } from '@/lib/aria2/options'
import { usePeers, useRpcAction, useServers, useTaskOptions } from '@/hooks/aria2'
import { formatBytes, formatSpeed, formatPercent } from '@/lib/format'
import { cn } from '@/lib/cn'
import { OptionField } from '@/components/option-field'
import { CopyValue } from '@/components/copy-value'
import { Progress } from '@/components/ui/progress'
import { Tooltip } from '@/components/ui/tooltip'

export function PieceMap({ task }: { task: Aria2Task }) {
  const numPieces = Number(task.numPieces ?? 0)
  const pieces = useMemo(() => decodeBitfield(task.bitfield, numPieces), [task.bitfield, numPieces])
  if (!numPieces) return <Empty>No piece information yet.</Empty>
  // Very large torrents are bucketed so the map stays readable and cheap to render.
  const MAX = 2400
  const bucket = Math.ceil(numPieces / MAX)
  const cells: number[] = []
  for (let i = 0; i < numPieces; i += bucket) {
    const slice = pieces.slice(i, i + bucket)
    cells.push(slice.filter(Boolean).length / slice.length)
  }
  const done = pieces.filter(Boolean).length
  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
        <span className="eyebrow">
          {done.toLocaleString()} / {numPieces.toLocaleString()} pieces · {formatBytes(task.pieceLength)} each
        </span>
        {bucket > 1 && <span className="text-fg-faint">Each cell = {bucket} pieces</span>}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9px,1fr))] gap-[2px]">
        {cells.map((c, i) => (
          <div
            key={i}
            className={cn('aspect-square rounded-[2px]', c === 0 && 'bg-surface-3')}
            style={c > 0 ? { background: `color-mix(in oklab, var(--accent) ${Math.round(35 + c * 65)}%, var(--surface-3))` } : undefined}
          />
        ))}
      </div>
    </div>
  )
}

export function PeersTab({ task }: { task: Aria2Task }) {
  const { data: peers, isLoading } = usePeers(task.gid, task.status === 'active')
  const numPieces = Number(task.numPieces ?? 0)
  if (task.status !== 'active') return <Empty>Peers are shown while the task is active.</Empty>
  if (isLoading) return <Empty>Loading peers…</Empty>
  if (!peers?.length) return <Empty>No connected peers.</Empty>
  const sorted = [...peers].sort((a, b) => Number(b.downloadSpeed) - Number(a.downloadSpeed))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="eyebrow border-b border-line text-left [&>th]:px-4 [&>th]:py-2.5 [&>th]:font-normal">
            <th>Address</th>
            <th>Client</th>
            <th className="w-40">Has</th>
            <th className="text-right">Down</th>
            <th className="text-right">Up</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const ratio = bitfieldRatio(p.bitfield, numPieces)
            return (
              <tr key={`${p.ip}:${p.port}`} className="border-b border-line hover:bg-surface-2/50 [&>td]:px-4 [&>td]:py-2.5">
                <td className="tabular text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    {p.seeder === 'true' && (
                      <Tooltip content="Seeder">
                        <Sprout className="size-3.5 text-ok" />
                      </Tooltip>
                    )}
                    {p.ip}:{p.port}
                  </span>
                </td>
                <td className="text-xs text-fg-muted">{peerClient(p.peerId)}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <Progress value={ratio} tone={ratio >= 1 ? 'ok' : 'accent'} className="h-[3px]" />
                    <span className="tabular w-10 text-right text-[11px] text-fg-muted">{formatPercent(ratio, 0)}</span>
                  </div>
                </td>
                <td className="tabular text-right text-xs">{formatSpeed(p.downloadSpeed)}</td>
                <td className="tabular text-right text-xs text-fg-muted">
                  <span className="inline-flex items-center gap-1.5">
                    {p.amChoking === 'true' ? <Lock className="size-3 text-fg-faint" /> : <Unlock className="size-3 text-up" />}
                    {formatSpeed(p.uploadSpeed)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function TrackersTab({ task }: { task: Aria2Task }) {
  const tiers = task.bittorrent?.announceList ?? []
  if (!tiers.length) return <Empty>This torrent has no trackers (DHT / PEX only).</Empty>
  return (
    <div className="divide-y divide-line">
      {tiers.map((tier, i) => (
        <div key={i} className="grid grid-cols-[4rem_1fr] gap-3 px-4 py-3">
          <span className="eyebrow pt-0.5">Tier {i + 1}</span>
          <div className="min-w-0 space-y-1">
            {tier.map((url) => (
              <div key={url} className="tabular truncate text-xs text-fg-muted" title={url}>
                {url}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ConnectionsTab({ task }: { task: Aria2Task }) {
  const { data } = useServers(task.gid, task.status === 'active' && !isBitTorrent(task))
  const uris = task.files.flatMap((f) => f.uris.map((u) => ({ ...u, file: f.index })))
  return (
    <div>
      {task.status === 'active' && data && data.some((s) => s.servers.length) && (
        <div className="border-b border-line">
          <div className="eyebrow px-4 pb-1 pt-3">Active connections</div>
          {data.flatMap((s) =>
            s.servers.map((srv, i) => (
              <div key={`${s.index}-${i}`} className="flex items-center gap-4 px-4 py-2 text-xs">
                <span className="tabular min-w-0 flex-1 truncate text-fg-muted" title={srv.currentUri}>{srv.currentUri}</span>
                <span className="tabular">{formatSpeed(srv.downloadSpeed)}</span>
              </div>
            )),
          )}
        </div>
      )}
      <div className="eyebrow px-4 pb-1 pt-3">Sources</div>
      {uris.length === 0 ? (
        <Empty>No source URIs.</Empty>
      ) : (
        [...new Map(uris.map((u) => [u.uri, u])).values()].map((u) => (
          <div key={u.uri} className="flex items-center gap-3 px-4 py-2 text-xs">
            <span className={cn('size-1.5 shrink-0 rounded-full', u.status === 'used' ? 'bg-accent' : 'bg-fg-faint')} />
            <span className="tabular min-w-0 flex-1 text-fg-muted">
              <CopyValue value={u.uri} truncate />
            </span>
            <span className="eyebrow">{u.status}</span>
          </div>
        ))
      )}
    </div>
  )
}

export function OptionsTab({ task }: { task: Aria2Task }) {
  const { data: options, isLoading } = useTaskOptions(task.gid)
  const [filter, setFilter] = useState('')
  const context: TaskOptionContext | null =
    task.status === 'active' || task.status === 'waiting' || task.status === 'paused' ? task.status : null
  const change = useRpcAction(
    (c, { key, value }: { key: string; value: string }) =>
      c.call('aria2.changeOption', task.gid, { [key]: serializeOption(optionDef(key), value) }),
    { success: 'Option updated', errorTitle: 'Could not change option' },
  )
  if (isLoading || !options) return <Empty>Loading options…</Empty>
  const keys = taskOptionKeys(context ?? 'active', isBitTorrent(task)).filter((o) => {
    const def = optionDef(o.key)
    return !filter || `${def.name} ${o.key}`.toLowerCase().includes(filter.toLowerCase())
  })
  return (
    <div>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter options"
          className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-faint"
        />
        {!context && <span className="eyebrow">Read-only for stopped tasks</span>}
      </div>
      <div className="divide-y divide-line px-4">
        {keys.map((o) => {
          const def = optionDef(o.key)
          return (
            <OptionField
              key={o.key}
              def={def}
              value={deserializeOption(def, options[o.key])}
              readonly={!context || o.readonly}
              onCommit={(value) => change.mutate({ key: o.key, value })}
            />
          )
        })}
      </div>
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-14 text-center text-sm text-fg-muted">{children}</div>
}
