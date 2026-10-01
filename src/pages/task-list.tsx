import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import {
  ArrowDownUp,
  ArrowUpToLine,
  ArrowDownToLine,
  ChevronUp,
  ChevronDown,
  CircleCheckBig,
  Copy,
  Ellipsis,
  Info,
  ListOrdered,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
  Eraser,
  Layers,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTaskActions, useTasks, useRetry, type TaskFilter } from '@/hooks/aria2'
import type { Aria2Task } from '@/lib/aria2/types'
import {
  canPause,
  canResume,
  canRetry,
  displayStatus,
  errorDescription,
  isBitTorrent,
  isStopped,
  progress,
  taskKind,
  taskName,
} from '@/lib/aria2/task'
import { formatBytes, formatPercent, formatSpeed } from '@/lib/format'
import { useAria2 } from '@/lib/aria2/client-context'
import { remainingNow } from '@/lib/aria2/countdown'
import { cn } from '@/lib/cn'
import { useSettings, type SortKey } from '@/store/settings'
import { useUi } from '@/store/ui'
import { useRemoveTasks } from '@/components/confirm-remove'
import { KindIcon } from '@/components/task-icon'
import { StatusBadge } from '@/components/status-badge'
import { TimeLeft } from '@/components/time-left'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Progress } from '@/components/ui/progress'
import { Tooltip } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown'

const titles: Record<TaskFilter, { title: string; empty: string; icon: typeof Layers }> = {
  active: { title: 'Downloading', empty: 'Nothing is downloading right now.', icon: ArrowDownToLine },
  waiting: { title: 'Queued', empty: 'The queue is empty. Paused and waiting tasks show up here.', icon: ListOrdered },
  stopped: { title: 'Finished', empty: 'Completed, failed and removed tasks show up here.', icon: CircleCheckBig },
  all: { title: 'All tasks', empty: 'No tasks yet.', icon: Layers },
}

const sortLabels: Record<SortKey, string> = {
  default: 'Queue order',
  name: 'Name',
  size: 'Size',
  progress: 'Progress',
  remaining: 'Time left',
  downloadSpeed: 'Download speed',
  uploadSpeed: 'Upload speed',
}

function sortTasks(tasks: Aria2Task[], key: SortKey, desc: boolean, scope: string) {
  if (key === 'default') return desc ? [...tasks].reverse() : tasks
  const value = (t: Aria2Task): number | string => {
    switch (key) {
      case 'name':
        return taskName(t).toLowerCase()
      case 'size':
        return Number(t.totalLength)
      case 'progress':
        return progress(t)
      case 'remaining':
        return remainingNow(scope, t.gid) ?? Number.POSITIVE_INFINITY
      case 'downloadSpeed':
        return Number(t.downloadSpeed)
      case 'uploadSpeed':
        return Number(t.uploadSpeed)
    }
  }
  const sorted = [...tasks].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    const r = typeof va === 'string' ? va.localeCompare(vb as string, undefined, { numeric: true }) : va - (vb as number)
    return r
  })
  return desc ? sorted.reverse() : sorted
}

function firstUri(task: Aria2Task) {
  if (task.infoHash) return `magnet:?xt=urn:btih:${task.infoHash}`
  return task.files?.[0]?.uris?.[0]?.uri
}

function TaskMenu({ task, index, count }: { task: Aria2Task; index: number; count: number }) {
  const { pause, resume, move } = useTaskActions()
  const retry = useRetry()
  const removeTasks = useRemoveTasks()
  const [, navigate] = useLocation()
  const queued = task.status === 'waiting' || task.status === 'paused'
  const uri = firstUri(task)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Task actions" onClick={(e) => e.stopPropagation()}>
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => navigate(`/task/${task.gid}`)}>
          <Info /> Details
        </DropdownMenuItem>
        {canPause(task) && (
          <DropdownMenuItem onSelect={() => pause.mutate([task.gid])}>
            <Pause /> Pause
          </DropdownMenuItem>
        )}
        {canResume(task) && (
          <DropdownMenuItem onSelect={() => resume.mutate([task.gid])}>
            <Play /> Resume
          </DropdownMenuItem>
        )}
        {canRetry(task) && (
          <DropdownMenuItem onSelect={() => retry.mutate([task])}>
            <RotateCcw /> Retry
          </DropdownMenuItem>
        )}
        {queued && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={index === 0} onSelect={() => move.mutate({ gid: task.gid, pos: 0, how: 'POS_SET' })}>
              <ArrowUpToLine /> Move to top
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index === 0} onSelect={() => move.mutate({ gid: task.gid, pos: -1, how: 'POS_CUR' })}>
              <ChevronUp /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index === count - 1} onSelect={() => move.mutate({ gid: task.gid, pos: 1, how: 'POS_CUR' })}>
              <ChevronDown /> Move down
            </DropdownMenuItem>
          </>
        )}
        {uri && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() =>
                navigator.clipboard.writeText(uri).then(
                  () => toast.success('Link copied'),
                  () => toast.error('Could not access clipboard'),
                )
              }
            >
              <Copy /> Copy link
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem danger onSelect={() => removeTasks([task])}>
          <Trash2 /> Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TaskRow({
  task,
  index,
  count,
  selected,
  onSelect,
  compact,
}: {
  task: Aria2Task
  index: number
  count: number
  selected: boolean
  onSelect: (checked: boolean, shift: boolean) => void
  compact: boolean
}) {
  const { pause, resume } = useTaskActions()
  const retry = useRetry()
  const [, navigate] = useLocation()
  const status = displayStatus(task)
  const ratio = progress(task)
  const name = taskName(task)
  const active = task.status === 'active'
  const err = errorDescription(task)
  const bt = isBitTorrent(task)
  const verifying = status === 'verifying'
  const shownRatio = verifying ? Number(task.verifiedLength) / Number(task.totalLength || 1) : ratio

  const tone =
    status === 'error' ? 'danger' : status === 'complete' ? 'ok' : status === 'seeding' ? 'up' : status === 'verifying' ? 'warn' : active ? 'accent' : 'muted'

  return (
    <div
      role="row"
      aria-selected={selected}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button,a,[role="checkbox"],[role="menu"]')) return
        if (e.metaKey || e.ctrlKey || e.shiftKey) onSelect(!selected, e.shiftKey)
        else navigate(`/task/${task.gid}`)
      }}
      className={cn(
        'group relative grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-3 border-b border-line px-4 transition-colors sm:px-6',
        compact ? 'py-2' : 'py-3.5',
        selected ? 'bg-accent-soft/50' : 'hover:bg-surface-2/60',
      )}
    >
      <div className="flex items-center gap-3">
        <Checkbox
          checked={selected}
          onClick={(e) => {
            e.stopPropagation()
            onSelect(!selected, e.shiftKey)
          }}
          aria-label={`Select ${name}`}
          className={cn('transition-opacity', !selected && 'sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100')}
        />
        <KindIcon kind={taskKind(task)} className={cn(compact && 'size-7 rounded-lg [&_svg]:size-[15px]', 'max-sm:hidden')} />
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-2">
          <Link href={`/task/${task.gid}`} className="truncate text-[14px] font-medium tracking-[-0.005em] hover:underline hover:decoration-line-strong hover:underline-offset-4">
            {name}
          </Link>
        </div>
        <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted', compact ? 'mt-0.5' : 'mt-1')}>
          <StatusBadge status={status} />
          <span className="tabular">
            {ratio < 1 && Number(task.totalLength) > 0 ? `${formatBytes(task.completedLength)} / ` : ''}
            {formatBytes(task.totalLength)}
          </span>
          {active && !verifying && ratio < 1 && <span className="tabular"><TimeLeft gid={task.gid} suffix="left" /></span>}
          {active && (
            <span className="tabular inline-flex items-center gap-1">
              <Users className="size-3" />
              {bt ? `${task.numSeeders ?? 0}/${task.connections}` : task.connections}
            </span>
          )}
          {err && (
            <Tooltip content={task.errorMessage}>
              <span className="truncate text-danger">{err}</span>
            </Tooltip>
          )}
        </div>
        {!compact && (
          <div className="mt-2.5 flex items-center gap-3">
            <Progress value={shownRatio} tone={tone} live={active && Number(task.downloadSpeed) > 0} className="h-[5px]" />
            <span className="tabular w-12 shrink-0 text-right text-[11px] text-fg-muted">{formatPercent(shownRatio)}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {active && (
          <div className="mr-2 hidden w-24 flex-col items-end text-xs sm:flex">
            <span className="tabular flex items-center gap-1 text-fg">
              <ArrowDownToLine className="size-3 text-accent" />
              {formatSpeed(task.downloadSpeed)}
            </span>
            {(bt || Number(task.uploadSpeed) > 0) && (
              <span className="tabular flex items-center gap-1 text-fg-muted">
                <ArrowUpToLine className="size-3 text-up" />
                {formatSpeed(task.uploadSpeed)}
              </span>
            )}
          </div>
        )}
        {compact && (
          <span className="tabular mr-2 hidden w-12 text-right text-xs text-fg-muted sm:block">{formatPercent(shownRatio, 0)}</span>
        )}
        <div className="flex items-center">
          {canPause(task) && (
            <Tooltip content="Pause">
              <Button variant="ghost" size="icon-sm" aria-label="Pause" onClick={() => pause.mutate([task.gid])}>
                <Pause />
              </Button>
            </Tooltip>
          )}
          {canResume(task) && (
            <Tooltip content="Resume">
              <Button variant="ghost" size="icon-sm" aria-label="Resume" onClick={() => resume.mutate([task.gid])} className="text-accent">
                <Play />
              </Button>
            </Tooltip>
          )}
          {canRetry(task) && (
            <Tooltip content="Retry">
              <Button variant="ghost" size="icon-sm" aria-label="Retry" onClick={() => retry.mutate([task])}>
                <RotateCcw />
              </Button>
            </Tooltip>
          )}
          <TaskMenu task={task} index={index} count={count} />
        </div>
      </div>
    </div>
  )
}

function EmptyState({ filter, searching }: { filter: TaskFilter; searching: boolean }) {
  const openNewTask = useUi((s) => s.openNewTask)
  const Icon = titles[filter].icon
  if (searching) {
    return <div className="px-6 py-20 text-center text-sm text-fg-muted">No tasks match your search.</div>
  }
  return (
    <div className="flex animate-rise flex-col items-center px-6 py-20 text-center">
      <div className="relative mb-6">
        <div className="absolute -inset-6 rounded-full grid-texture [mask-image:radial-gradient(closest-side,black,transparent)]" />
        <div className="relative grid size-16 place-items-center rounded-2xl border border-line bg-surface text-fg-faint shadow-panel">
          <Icon className="size-7" strokeWidth={1.5} />
        </div>
      </div>
      <p className="max-w-sm text-sm text-fg-muted">{titles[filter].empty}</p>
      {filter !== 'stopped' && (
        <>
          <Button variant="primary" className="mt-6" onClick={() => openNewTask()}>
            <Plus /> New download
          </Button>
          <p className="mt-4 hidden items-center gap-1.5 text-xs text-fg-faint sm:flex">
            Press <Kbd>N</Kbd>, paste a link anywhere, or drop a .torrent file
          </p>
        </>
      )}
    </div>
  )
}

function SkeletonRows() {
  return (
    <div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line px-6 py-4" style={{ opacity: 1 - i * 0.18 }}>
          <div className="size-9 animate-pulse rounded-[10px] bg-surface-2" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-surface-2" />
            <div className="h-2 w-1/5 animate-pulse rounded bg-surface-2" />
            <div className="h-1 w-full animate-pulse rounded bg-surface-2" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function TaskListPage({ filter }: { filter: TaskFilter }) {
  const { data, isLoading, error: queryError, failureReason } = useTasks(filter)
  const error = queryError ?? (data ? null : failureReason)
  const { sort, density, set } = useSettings()
  const { client } = useAria2()
  const { pause, resume, pauseAll, resumeAll, purge } = useTaskActions()
  const retry = useRetry()
  const removeTasks = useRemoveTasks()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)

  useEffect(() => {
    setSelected(new Set())
    setQuery('')
  }, [filter])

  const tasks = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = (data ?? []).filter((t) => !q || taskName(t).toLowerCase().includes(q) || t.gid.includes(q))
    return sortTasks(filtered, sort.key, sort.desc, client.profile.id)
  }, [data, query, sort, client])

  // Drop selections for tasks that disappeared.
  useEffect(() => {
    if (!data) return
    setSelected((prev) => {
      const ids = new Set(data.map((t) => t.gid))
      const next = new Set([...prev].filter((g) => ids.has(g)))
      return next.size === prev.size ? prev : next
    })
  }, [data])

  const selectedTasks = tasks.filter((t) => selected.has(t.gid))
  const allSelected = tasks.length > 0 && selectedTasks.length === tasks.length

  const toggle = (gid: string, checked: boolean, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (shift && anchor) {
        const a = tasks.findIndex((t) => t.gid === anchor)
        const b = tasks.findIndex((t) => t.gid === gid)
        if (a !== -1 && b !== -1) {
          for (const t of tasks.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(t.gid)
          return next
        }
      }
      if (checked) next.add(gid)
      else next.delete(gid)
      return next
    })
    setAnchor(gid)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || document.querySelector('[role="dialog"]')) return
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        setSelected(new Set(tasks.map((t) => t.gid)))
      } else if (e.key === 'Escape') {
        setSelected(new Set())
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTasks.length) {
        e.preventDefault()
        removeTasks(selectedTasks, () => setSelected(new Set()))
      } else if (e.key === '/') {
        e.preventDefault()
        document.getElementById('task-search')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tasks, selectedTasks, removeTasks])

  const { title } = titles[filter]
  const totalDown = (data ?? []).reduce((a, t) => a + Number(t.downloadSpeed), 0)
  const hasStopped = (data ?? []).some(isStopped)

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3 px-4 pb-4 pt-5 sm:px-6 sm:pt-7">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Transfers</div>
            <h1 className="mt-1 flex items-baseline gap-3 text-2xl font-semibold tracking-[-0.02em]">
              {title}
              <span className="tabular text-base font-normal text-fg-faint">{data?.length ?? '–'}</span>
            </h1>
          </div>
          {filter === 'active' && totalDown > 0 && (
            <div className="hidden text-right md:block">
              <div className="eyebrow">Combined</div>
              <div className="tabular mt-1 text-lg text-accent">{formatSpeed(totalDown)}</div>
            </div>
          )}
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative flex-1 sm:w-64 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint" />
              <Input
                id="task-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter tasks"
                className="pl-9 pr-8"
              />
              {query ? (
                <button className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-fg-faint hover:text-fg" onClick={() => setQuery('')} aria-label="Clear filter">
                  <X className="size-4" />
                </button>
              ) : (
                <Kbd className="absolute right-2 top-1/2 hidden -translate-y-1/2 sm:inline-flex">/</Kbd>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Sort and view">
                  <ArrowDownUp />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={sort.key} onValueChange={(v) => set({ sort: { ...sort, key: v as SortKey } })}>
                  {Object.entries(sortLabels).map(([k, label]) => (
                    <DropdownMenuRadioItem key={k} value={k} onSelect={(e) => e.preventDefault()}>
                      {label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={sort.desc ? 'desc' : 'asc'} onValueChange={(v) => set({ sort: { ...sort, desc: v === 'desc' } })}>
                  <DropdownMenuRadioItem value="asc" onSelect={(e) => e.preventDefault()}>Ascending</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="desc" onSelect={(e) => e.preventDefault()}>Descending</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Density</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={density} onValueChange={(v) => set({ density: v as 'comfortable' | 'compact' })}>
                  <DropdownMenuRadioItem value="comfortable" onSelect={(e) => e.preventDefault()}>Comfortable</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="compact" onSelect={(e) => e.preventDefault()}>Compact</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Bulk actions">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => resumeAll.mutate(undefined)}>
                  <Play /> Resume all
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => pauseAll.mutate(undefined)}>
                  <Pause /> Pause all
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!hasStopped && filter !== 'stopped'} onSelect={() => purge.mutate(undefined)}>
                  <Eraser /> Clear finished
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {tasks.length > 0 && (
          <div className="flex h-9 items-center gap-3 border-t border-line px-4 text-xs text-fg-muted sm:px-6">
            <Checkbox
              checked={allSelected ? true : selectedTasks.length ? 'indeterminate' : false}
              onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(tasks.map((t) => t.gid)))}
              aria-label="Select all"
            />
            <span className="eyebrow">
              {selectedTasks.length ? `${selectedTasks.length} selected` : `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`}
            </span>
            <span className="eyebrow ml-auto hidden sm:inline">{sortLabels[sort.key]} {sort.desc ? '↓' : '↑'}</span>
          </div>
        )}
      </div>

      {error ? (
        <div className="px-6 py-20 text-center text-sm text-fg-muted">Couldn't load tasks: {error.message}</div>
      ) : isLoading ? (
        <SkeletonRows />
      ) : tasks.length === 0 ? (
        <EmptyState filter={filter} searching={!!query} />
      ) : (
        <div role="table" className="pb-28">
          {tasks.map((t, i) => (
            <TaskRow
              key={t.gid}
              task={t}
              index={i}
              count={tasks.length}
              selected={selected.has(t.gid)}
              onSelect={(c, shift) => toggle(t.gid, c, shift)}
              compact={density === 'compact'}
            />
          ))}
        </div>
      )}

      {selectedTasks.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-20 flex justify-center px-3 lg:left-64">
          <div className="pointer-events-auto flex animate-in items-center gap-1 rounded-2xl border border-line-strong bg-fg p-1.5 pl-4 text-bg shadow-panel dark:bg-surface-3 dark:text-fg">
            <span className="tabular mr-2 text-sm">{selectedTasks.length} selected</span>
            <Button
              size="sm"
              variant="ghost"
              className="text-inherit hover:bg-white/10 hover:text-inherit"
              disabled={!selectedTasks.some(canResume)}
              onClick={() => resume.mutate(selectedTasks.filter(canResume).map((t) => t.gid))}
            >
              <Play /> <span className="max-sm:hidden">Resume</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-inherit hover:bg-white/10 hover:text-inherit"
              disabled={!selectedTasks.some(canPause)}
              onClick={() => pause.mutate(selectedTasks.filter(canPause).map((t) => t.gid))}
            >
              <Pause /> <span className="max-sm:hidden">Pause</span>
            </Button>
            {selectedTasks.some(canRetry) && (
              <Button
                size="sm"
                variant="ghost"
                className="text-inherit hover:bg-white/10 hover:text-inherit"
                onClick={() => retry.mutate(selectedTasks.filter(canRetry))}
              >
                <RotateCcw /> <span className="max-sm:hidden">Retry</span>
              </Button>
            )}
            <Button size="sm" variant="danger" onClick={() => removeTasks(selectedTasks, () => setSelected(new Set()))}>
              <Trash2 /> <span className="max-sm:hidden">Remove</span>
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="text-inherit hover:bg-white/10 hover:text-inherit"
              onClick={() => setSelected(new Set())}
              aria-label="Clear selection"
            >
              <X />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
