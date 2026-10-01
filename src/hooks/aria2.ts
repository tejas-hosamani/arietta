import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAria2 } from '@/lib/aria2/client-context'
import { Aria2Error, type Aria2Client } from '@/lib/aria2/rpc'
import { observeTasks } from '@/lib/aria2/countdown'
import type {
  Aria2GlobalStat,
  Aria2Options,
  Aria2Peer,
  Aria2Server,
  Aria2Task,
  Aria2Version,
  TaskListKind,
} from '@/lib/aria2/types'
import { useSettings } from '@/store/settings'

const LIST_KEYS = [
  'gid', 'totalLength', 'completedLength', 'uploadSpeed', 'downloadSpeed', 'connections', 'numSeeders', 'seeder',
  'status', 'errorCode', 'errorMessage', 'verifiedLength', 'verifyIntegrityPending', 'files', 'bittorrent', 'infoHash',
  'dir', 'uploadLength',
]

export type TaskFilter = TaskListKind | 'all'

/** No response at all (unreachable, timed out). aria2 errors carry a code. */
const isConnectionError = (e: unknown) => e instanceof Aria2Error && e.code === undefined

/**
 * Polling behaviour for live queries. Connection failures are retried in place so a query without data
 * stays pending with a failureReason instead of flipping between pending and error on every tick.
 * Real RPC errors (bad secret, unknown gid) stop polling until the query is invalidated.
 */
function poll(interval: number) {
  return {
    refetchInterval: (q: { state: { status: string } }) => (q.state.status === 'error' ? false : interval),
    retry: (_count: number, e: Error) => isConnectionError(e),
    retryDelay: Math.max(interval, 2000),
  } as const
}

function useKeys() {
  const { client } = useAria2()
  return { client, pid: client.profile.id }
}

export function useGlobalStat() {
  const { client, pid } = useKeys()
  const interval = useSettings((s) => s.globalStatInterval)
  return useQuery({
    queryKey: [pid, 'globalStat'],
    queryFn: () => client.call<Aria2GlobalStat>('aria2.getGlobalStat'),
    ...poll(interval),
  })
}

async function fetchTasks(client: Aria2Client, filter: TaskFilter): Promise<Aria2Task[]> {
  const calls = {
    active: { method: 'aria2.tellActive', params: [LIST_KEYS] },
    waiting: { method: 'aria2.tellWaiting', params: [0, 1000, LIST_KEYS] },
    stopped: { method: 'aria2.tellStopped', params: [0, 1000, LIST_KEYS] },
  }
  const kinds: TaskListKind[] = filter === 'all' ? ['active', 'waiting', 'stopped'] : [filter]
  const results = await client.multicall(kinds.map((k) => calls[k]))
  const tasks: Aria2Task[] = []
  for (const r of results) {
    if (r instanceof Aria2Error) throw r
    tasks.push(...(r as Aria2Task[]))
  }
  observeTasks(client.profile.id, tasks)
  return tasks
}

export function useTasks(filter: TaskFilter) {
  const { client, pid } = useKeys()
  const interval = useSettings((s) => s.refreshInterval)
  return useQuery({
    queryKey: [pid, 'tasks', filter],
    queryFn: () => fetchTasks(client, filter),
    ...poll(interval),
  })
}

export function useTask(gid: string) {
  const { client, pid } = useKeys()
  const interval = useSettings((s) => s.refreshInterval)
  return useQuery({
    queryKey: [pid, 'task', gid],
    queryFn: async () => {
      const task = await client.call<Aria2Task>('aria2.tellStatus', gid)
      observeTasks(pid, [task])
      return task
    },
    ...poll(interval),
  })
}

export function usePeers(gid: string, enabled: boolean) {
  const { client, pid } = useKeys()
  const interval = useSettings((s) => s.refreshInterval)
  return useQuery({
    queryKey: [pid, 'peers', gid],
    queryFn: () => client.call<Aria2Peer[]>('aria2.getPeers', gid),
    ...poll(interval),
    enabled,
  })
}

export function useServers(gid: string, enabled: boolean) {
  const { client, pid } = useKeys()
  const interval = useSettings((s) => s.refreshInterval)
  return useQuery({
    queryKey: [pid, 'servers', gid],
    queryFn: () => client.call<Aria2Server[]>('aria2.getServers', gid),
    ...poll(interval),
    enabled,
  })
}

export function useTaskOptions(gid: string) {
  const { client, pid } = useKeys()
  return useQuery({
    queryKey: [pid, 'taskOptions', gid],
    queryFn: () => client.call<Aria2Options>('aria2.getOption', gid),
  })
}

export function useGlobalOptions() {
  const { client, pid } = useKeys()
  return useQuery({
    queryKey: [pid, 'globalOptions'],
    queryFn: () => client.call<Aria2Options>('aria2.getGlobalOption'),
  })
}

export function useVersion() {
  const { client, pid } = useKeys()
  return useQuery({
    queryKey: [pid, 'version'],
    queryFn: () => client.call<Aria2Version>('aria2.getVersion'),
    retry: false,
    staleTime: 60_000,
  })
}

export function useSessionInfo() {
  const { client, pid } = useKeys()
  return useQuery({
    queryKey: [pid, 'session'],
    queryFn: () => client.call<{ sessionId: string }>('aria2.getSessionInfo'),
    retry: false,
  })
}

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

/** Generic mutation that runs an RPC action, refreshes data and reports errors. */
export function useRpcAction<TArgs>(
  run: (client: Aria2Client, args: TArgs) => Promise<unknown>,
  opts: { success?: string | ((args: TArgs) => string); errorTitle?: string } = {},
) {
  const { client, pid } = useKeys()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (args: TArgs) => run(client, args),
    onSuccess: (_d, args) => {
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(args) : opts.success)
    },
    onError: (e) => toast.error(opts.errorTitle ?? 'Operation failed', { description: errorMessage(e) }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [pid] }),
  })
}

/** Runs one method over many gids in a single multicall and reports partial failures. */
async function batch(client: Aria2Client, method: string, gids: string[]) {
  if (gids.length === 0) return
  const results = await client.multicall(gids.map((gid) => ({ method, params: [gid] })))
  const failed = results.filter((r) => r instanceof Aria2Error) as Aria2Error[]
  if (failed.length === gids.length) throw failed[0]
  if (failed.length) toast.warning(`${failed.length} of ${gids.length} tasks failed`, { description: failed[0].message })
}

export function useTaskActions() {
  const pause = useRpcAction((c, gids: string[]) => batch(c, 'aria2.forcePause', gids))
  const resume = useRpcAction((c, gids: string[]) => batch(c, 'aria2.unpause', gids))
  const remove = useRpcAction(async (c, tasks: Aria2Task[]) => {
    const active = tasks.filter((t) => ['active', 'waiting', 'paused'].includes(t.status)).map((t) => t.gid)
    const stopped = tasks.filter((t) => !['active', 'waiting', 'paused'].includes(t.status)).map((t) => t.gid)
    await batch(c, 'aria2.forceRemove', active)
    await batch(c, 'aria2.removeDownloadResult', stopped)
  })
  const pauseAll = useRpcAction((c) => c.call('aria2.forcePauseAll'), { success: 'All tasks paused' })
  const resumeAll = useRpcAction((c) => c.call('aria2.unpauseAll'), { success: 'All tasks resumed' })
  const purge = useRpcAction((c) => c.call('aria2.purgeDownloadResult'), { success: 'Cleared finished tasks' })
  const move = useRpcAction((c, { gid, pos, how }: { gid: string; pos: number; how: 'POS_SET' | 'POS_CUR' | 'POS_END' }) =>
    c.call('aria2.changePosition', gid, pos, how),
  )
  return { pause, resume, remove, pauseAll, resumeAll, purge, move }
}

/** Re-adds a failed/removed HTTP/FTP task with its original URIs and options. */
export function useRetry() {
  const removeOld = useSettings((s) => s.removeOldTaskAfterRetrying)
  return useRpcAction(
    async (c, tasks: Aria2Task[]) => {
      for (const task of tasks) {
        const [options, status] = await c.multicall([
          { method: 'aria2.getOption', params: [task.gid] },
          { method: 'aria2.tellStatus', params: [task.gid, ['files']] },
        ])
        if (options instanceof Aria2Error) throw options
        if (status instanceof Aria2Error) throw status
        const file = (status as Aria2Task).files[0]
        const uris = [...new Set(file.uris.map((u) => u.uri))]
        await c.call('aria2.addUri', uris, options)
        if (removeOld) await c.call('aria2.removeDownloadResult', task.gid)
      }
    },
    { success: (tasks) => (tasks.length > 1 ? `Retrying ${tasks.length} tasks` : 'Task restarted') },
  )
}
