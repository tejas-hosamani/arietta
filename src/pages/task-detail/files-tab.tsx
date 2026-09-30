import { useMemo, useState } from 'react'
import { ChevronRight, Folder, FolderOpen } from 'lucide-react'
import type { Aria2Task } from '@/lib/aria2/types'
import { buildFileTree, fileKind, leafFiles, isBitTorrent, type FileNode } from '@/lib/aria2/task'
import { useRpcAction } from '@/hooks/aria2'
import { formatBytes, formatPercent } from '@/lib/format'
import { cn } from '@/lib/cn'
import { KindIcon } from '@/components/task-icon'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'

function NodeRow({
  node,
  depth,
  selection,
  toggle,
  editable,
  collapsed,
  toggleCollapsed,
}: {
  node: FileNode
  depth: number
  selection: Set<string>
  toggle: (indexes: string[], checked: boolean) => void
  editable: boolean
  collapsed: Set<string>
  toggleCollapsed: (path: string) => void
}) {
  const files = leafFiles(node)
  const selectedCount = files.filter((f) => selection.has(f.index)).length
  const state = selectedCount === 0 ? false : selectedCount === files.length ? true : 'indeterminate'
  const ratio = node.length ? node.completedLength / node.length : 0
  const isDir = !node.file
  const isCollapsed = collapsed.has(node.path)

  return (
    <>
      <div
        className={cn('grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-line py-2 pr-4 text-sm hover:bg-surface-2/50', state === false && 'text-fg-faint')}
        style={{ paddingLeft: `${16 + depth * 20}px` }}
      >
        <div className="flex items-center gap-2">
          <Checkbox checked={state} disabled={!editable} onCheckedChange={() => toggle(files.map((f) => f.index), state !== true)} aria-label={`Select ${node.name}`} />
          {isDir ? (
            <button className="flex cursor-pointer items-center text-fg-muted" onClick={() => toggleCollapsed(node.path)} aria-label={isCollapsed ? 'Expand' : 'Collapse'}>
              <ChevronRight className={cn('size-4 transition-transform', !isCollapsed && 'rotate-90')} />
              {isCollapsed ? <Folder className="size-4" /> : <FolderOpen className="size-4" />}
            </button>
          ) : (
            <KindIcon kind={fileKind(node.name)} className="size-6 rounded-md [&_svg]:size-3.5" />
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate" title={node.path}>{node.name}</div>
          <Progress value={ratio} tone={ratio >= 1 ? 'ok' : 'accent'} className="mt-1.5 h-[3px] max-w-md" />
        </div>
        <div className="tabular text-right text-xs text-fg-muted">
          <div>{formatBytes(node.length)}</div>
          <div className="text-fg-faint">{formatPercent(ratio, 0)}</div>
        </div>
      </div>
      {isDir &&
        !isCollapsed &&
        node.children.map((c) => (
          <NodeRow
            key={c.path + (c.file?.index ?? '')}
            node={c}
            depth={depth + 1}
            selection={selection}
            toggle={toggle}
            editable={editable}
            collapsed={collapsed}
            toggleCollapsed={toggleCollapsed}
          />
        ))}
    </>
  )
}

export function FilesTab({ task }: { task: Aria2Task }) {
  const tree = useMemo(() => buildFileTree(task), [task])
  const serverSelection = useMemo(() => new Set(task.files.filter((f) => f.selected === 'true').map((f) => f.index)), [task.files])
  const [draft, setDraft] = useState<Set<string> | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const selection = draft ?? serverSelection
  // aria2 only allows changing file selection of BitTorrent tasks that are not running.
  const editable = isBitTorrent(task) && (task.status === 'paused' || task.status === 'waiting') && task.files.length > 1
  const dirty = draft !== null && (draft.size !== serverSelection.size || [...draft].some((i) => !serverSelection.has(i)))

  const apply = useRpcAction(
    (c, indexes: string[]) => c.call('aria2.changeOption', task.gid, { 'select-file': indexes.sort((a, b) => Number(a) - Number(b)).join(',') }),
    { success: 'File selection updated' },
  )

  const toggle = (indexes: string[], checked: boolean) => {
    const next = new Set(selection)
    for (const i of indexes) {
      if (checked) next.add(i)
      else next.delete(i)
    }
    setDraft(next)
  }

  const selectedSize = task.files.filter((f) => selection.has(f.index)).reduce((a, f) => a + Number(f.length), 0)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 text-xs text-fg-muted">
        <span className="eyebrow">
          {selection.size} of {task.files.length} files · {formatBytes(selectedSize)}
        </span>
        {!editable && isBitTorrent(task) && task.files.length > 1 && (
          <span className="text-fg-faint">Pause the task to change which files are downloaded.</span>
        )}
        {dirty && (
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Reset
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={selection.size === 0}
              loading={apply.isPending}
              onClick={() => apply.mutate([...selection], { onSuccess: () => setDraft(null) })}
            >
              Apply selection
            </Button>
          </div>
        )}
      </div>
      {tree.children.map((c) => (
        <NodeRow
          key={c.path + (c.file?.index ?? '')}
          node={c}
          depth={0}
          selection={selection}
          toggle={toggle}
          editable={editable}
          collapsed={collapsed}
          toggleCollapsed={(p) =>
            setCollapsed((prev) => {
              const next = new Set(prev)
              if (next.has(p)) next.delete(p)
              else next.add(p)
              return next
            })
          }
        />
      ))}
    </div>
  )
}
