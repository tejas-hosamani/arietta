import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { ArrowLeft, Check, Copy, Pause, Play, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRetry, useTask, useTaskActions } from '@/hooks/aria2'
import {
  canPause,
  canResume,
  canRetry,
  displayStatus,
  errorDescription,
  eta,
  isBitTorrent,
  progress,
  taskKind,
  taskName,
} from '@/lib/aria2/task'
import { formatBytes, formatDate, formatDuration, formatPercent, bytesParts } from '@/lib/format'
import { useRemoveTasks } from '@/components/confirm-remove'
import { KindIcon } from '@/components/task-icon'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FilesTab } from './files-tab'
import { ConnectionsTab, OptionsTab, PeersTab, PieceMap, TrackersTab, Empty } from './panels'

function CopyValue({ value, children }: { value: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="group inline-flex max-w-full cursor-pointer items-center gap-1.5 text-left"
      onClick={() =>
        navigator.clipboard.writeText(value).then(
          () => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          },
          () => toast.error('Could not access clipboard'),
        )
      }
    >
      <span className="min-w-0 break-all">{children ?? value}</span>
      {copied ? <Check className="size-3 shrink-0 text-ok" /> : <Copy className="size-3 shrink-0 text-fg-faint opacity-0 group-hover:opacity-100" />}
    </button>
  )
}

function Stat({ label, value, unit, tone }: { label: string; value: ReactNode; unit?: string; tone?: string }) {
  return (
    <div className="min-w-0 px-4 py-3 sm:px-5">
      <div className="eyebrow">{label}</div>
      <div className={`tabular mt-1 truncate text-xl font-medium tracking-tight ${tone ?? ''}`}>
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-fg-faint">{unit}</span>}
      </div>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="eyebrow pt-0.5">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  )
}

export function TaskDetailPage({ gid }: { gid: string }) {
  const { data: task, error, isLoading, failureReason } = useTask(gid)
  const { pause, resume } = useTaskActions()
  const retry = useRetry()
  const removeTasks = useRemoveTasks()
  const [, navigate] = useLocation()
  const [tab, setTab] = useState('overview')

  if (isLoading) {
    return <div className="p-10 text-sm text-fg-muted">{failureReason ? `Waiting for aria2: ${failureReason.message}` : 'Loading…'}</div>
  }
  if (error || !task) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-24 text-center">
        <p className="text-sm text-fg-muted">This task no longer exists on the aria2 server.</p>
        <Button variant="outline" onClick={() => navigate('/')}>
          <ArrowLeft /> Back to tasks
        </Button>
      </div>
    )
  }

  const status = displayStatus(task)
  const ratio = progress(task)
  const bt = isBitTorrent(task)
  const [sizeNum, sizeUnit] = bytesParts(task.totalLength)
  const [doneNum, doneUnit] = bytesParts(task.completedLength)
  const [downNum, downUnit] = bytesParts(task.downloadSpeed)
  const [upNum, upUnit] = bytesParts(task.uploadSpeed)
  const shareRatio = Number(task.completedLength) ? Number(task.uploadLength) / Number(task.completedLength) : 0
  const err = errorDescription(task)
  const backTo = task.status === 'active' ? '/tasks/active' : task.status === 'waiting' || task.status === 'paused' ? '/tasks/waiting' : '/tasks/stopped'

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6 sm:pt-7">
      <Link href={backTo} className="eyebrow inline-flex items-center gap-1.5 hover:text-fg">
        <ArrowLeft className="size-3" /> Back
      </Link>

      <div className="mt-4 flex flex-wrap items-start gap-4">
        <KindIcon kind={taskKind(task)} className="size-12 rounded-xl [&_svg]:size-6" />
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-xl font-semibold leading-snug tracking-[-0.015em] sm:text-2xl">{taskName(task)}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge status={status} />
            <span className="tabular text-xs text-fg-faint">GID {task.gid}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {canPause(task) && (
            <Button variant="outline" onClick={() => pause.mutate([task.gid])}>
              <Pause /> Pause
            </Button>
          )}
          {canResume(task) && (
            <Button variant="primary" onClick={() => resume.mutate([task.gid])}>
              <Play /> Resume
            </Button>
          )}
          {canRetry(task) && (
            <Button variant="primary" onClick={() => retry.mutate([task])}>
              <RotateCcw /> Retry
            </Button>
          )}
          <Button variant="outline" size="icon" aria-label="Remove" onClick={() => removeTasks([task], () => navigate(backTo))}>
            <Trash2 className="text-danger" />
          </Button>
        </div>
      </div>

      {err && (
        <div className="mt-5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm">
          <span className="font-medium text-danger">{err}</span>
          {task.errorMessage && task.errorMessage !== err && <div className="mt-1 text-xs text-fg-muted">{task.errorMessage}</div>}
        </div>
      )}

      <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface shadow-panel">
        <div className="relative px-4 pb-4 pt-5 sm:px-5">
          <div className="flex items-end justify-between gap-4">
            <div className="tabular text-5xl font-medium leading-none tracking-[-0.04em] sm:text-6xl">
              {formatPercent(ratio, 1).replace('%', '')}
              <span className="text-2xl text-fg-faint">%</span>
            </div>
            <div className="tabular text-right text-sm text-fg-muted">
              {doneNum} <span className="text-fg-faint">{doneUnit}</span> of {sizeNum} <span className="text-fg-faint">{sizeUnit}</span>
              {task.status === 'active' && ratio < 1 && <div className="mt-0.5 text-fg">{formatDuration(eta(task))} remaining</div>}
            </div>
          </div>
          <Progress
            value={ratio}
            tone={status === 'error' ? 'danger' : status === 'complete' ? 'ok' : status === 'seeding' ? 'up' : 'accent'}
            live={task.status === 'active' && Number(task.downloadSpeed) > 0}
            className="mt-4 h-2"
          />
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-line border-t border-line sm:grid-cols-4 sm:divide-y-0">
          <Stat label="Download" value={downNum} unit={`${downUnit}/s`} tone={Number(task.downloadSpeed) ? 'text-accent' : undefined} />
          <Stat label="Upload" value={upNum} unit={`${upUnit}/s`} tone={Number(task.uploadSpeed) ? 'text-up' : undefined} />
          <Stat label={bt ? 'Seeds / Peers' : 'Connections'} value={bt ? `${task.numSeeders ?? 0} / ${task.connections}` : task.connections} />
          <Stat label={bt ? 'Share ratio' : 'Uploaded'} value={bt ? shareRatio.toFixed(2) : formatBytes(task.uploadLength)} />
        </div>
      </section>

      <Tabs value={tab} onValueChange={setTab} className="mt-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="files">
            Files <span className="tabular text-xs text-fg-faint">{task.files.length}</span>
          </TabsTrigger>
          {Number(task.numPieces) > 0 && <TabsTrigger value="pieces">Pieces</TabsTrigger>}
          {bt && <TabsTrigger value="peers">Peers</TabsTrigger>}
          {bt && <TabsTrigger value="trackers">Trackers</TabsTrigger>}
          {!bt && <TabsTrigger value="sources">Sources</TabsTrigger>}
          <TabsTrigger value="options">Options</TabsTrigger>
        </TabsList>
        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
          <TabsContent value="overview">
            <dl className="divide-y divide-line">
              <InfoRow label="Name">{taskName(task)}</InfoRow>
              <InfoRow label="Directory">
                <span className="tabular text-[13px]">
                  <CopyValue value={task.dir} />
                </span>
              </InfoRow>
              <InfoRow label="Size">
                <span className="tabular">{formatBytes(task.totalLength, 2)}</span>
                <span className="text-fg-faint"> · {Number(task.totalLength).toLocaleString()} bytes</span>
              </InfoRow>
              {Number(task.numPieces) > 0 && (
                <InfoRow label="Pieces">
                  <span className="tabular">
                    {Number(task.numPieces).toLocaleString()} × {formatBytes(task.pieceLength)}
                  </span>
                </InfoRow>
              )}
              {task.infoHash && (
                <InfoRow label="Info hash">
                  <span className="tabular text-[13px]">
                    <CopyValue value={task.infoHash} />
                  </span>
                </InfoRow>
              )}
              {task.infoHash && (
                <InfoRow label="Magnet">
                  <span className="tabular text-[13px] text-fg-muted">
                    <CopyValue value={`magnet:?xt=urn:btih:${task.infoHash}${task.bittorrent?.info?.name ? `&dn=${encodeURIComponent(task.bittorrent.info.name)}` : ''}`}>
                      magnet:?xt=urn:btih:{task.infoHash.slice(0, 12)}…
                    </CopyValue>
                  </span>
                </InfoRow>
              )}
              {task.bittorrent?.creationDate && <InfoRow label="Created">{formatDate(task.bittorrent.creationDate)}</InfoRow>}
              {task.bittorrent?.comment && <InfoRow label="Comment">{task.bittorrent.comment}</InfoRow>}
              {task.bittorrent?.mode && <InfoRow label="Mode">{task.bittorrent.mode === 'multi' ? 'Multi-file' : 'Single file'}</InfoRow>}
              {task.following && (
                <InfoRow label="Follows">
                  <Link href={`/task/${task.following}`} className="tabular text-accent hover:underline">{task.following}</Link>
                </InfoRow>
              )}
              {task.followedBy?.length ? (
                <InfoRow label="Followed by">
                  <div className="flex flex-wrap gap-2">
                    {task.followedBy.map((g) => (
                      <Link key={g} href={`/task/${g}`} className="tabular text-accent hover:underline">{g}</Link>
                    ))}
                  </div>
                </InfoRow>
              ) : null}
              {task.belongsTo && (
                <InfoRow label="Belongs to">
                  <Link href={`/task/${task.belongsTo}`} className="tabular text-accent hover:underline">{task.belongsTo}</Link>
                </InfoRow>
              )}
            </dl>
          </TabsContent>
          <TabsContent value="files">
            {task.files.length ? <FilesTab task={task} /> : <Empty>No files yet.</Empty>}
          </TabsContent>
          <TabsContent value="pieces">
            <PieceMap task={task} />
          </TabsContent>
          <TabsContent value="peers">
            <PeersTab task={task} />
          </TabsContent>
          <TabsContent value="trackers">
            <TrackersTab task={task} />
          </TabsContent>
          <TabsContent value="sources">
            <ConnectionsTab task={task} />
          </TabsContent>
          <TabsContent value="options">
            <OptionsTab task={task} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
