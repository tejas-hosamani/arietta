import { create } from 'zustand'
import { Trash2 } from 'lucide-react'
import type { Aria2Task } from '@/lib/aria2/types'
import { taskName } from '@/lib/aria2/task'
import { useTaskActions } from '@/hooks/aria2'
import { useSettings } from '@/store/settings'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'

const useRemoveState = create<{ tasks: Aria2Task[]; onDone?: () => void; set: (tasks: Aria2Task[], onDone?: () => void) => void }>()(
  (set) => ({ tasks: [], set: (tasks, onDone) => set({ tasks, onDone }) }),
)

/** Returns a function that removes tasks, asking for confirmation when the preference is on. */
export function useRemoveTasks() {
  const confirm = useSettings((s) => s.confirmRemoval)
  const { remove } = useTaskActions()
  const open = useRemoveState((s) => s.set)
  return (tasks: Aria2Task[], onDone?: () => void) => {
    if (tasks.length === 0) return
    if (confirm) open(tasks, onDone)
    else remove.mutate(tasks, { onSuccess: onDone })
  }
}

export function ConfirmRemoveDialog() {
  const { tasks, onDone, set } = useRemoveState()
  const { remove } = useTaskActions()
  const close = () => set([])
  const running = tasks.filter((t) => ['active', 'waiting', 'paused'].includes(t.status)).length

  return (
    <Dialog open={tasks.length > 0} onOpenChange={(o) => !o && close()}>
      <DialogContent
        className="max-w-md"
        title={tasks.length === 1 ? 'Remove this task?' : `Remove ${tasks.length} tasks?`}
        description={
          running > 0
            ? 'Running downloads will be stopped. Files already written to disk are kept.'
            : 'They will be cleared from the list. Files on disk are kept.'
        }
      >
        <DialogBody className="max-h-56 py-3">
          <ul className="flex flex-col gap-1">
            {tasks.slice(0, 8).map((t) => (
              <li key={t.gid} className="truncate rounded-md bg-surface-2 px-2.5 py-1.5 text-sm">
                {taskName(t)}
              </li>
            ))}
            {tasks.length > 8 && <li className="px-2.5 text-sm text-fg-muted">and {tasks.length - 8} more</li>}
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="danger"
            autoFocus
            loading={remove.isPending}
            onClick={() =>
              remove.mutate(tasks, {
                onSuccess: () => {
                  onDone?.()
                  close()
                },
              })
            }
          >
            <Trash2 /> Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
