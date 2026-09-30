import { cn } from '@/lib/cn'
import { statusLabels, type DisplayStatus } from '@/lib/aria2/task'

const styles: Record<DisplayStatus, string> = {
  active: 'text-accent before:bg-accent before:animate-pulse',
  seeding: 'text-up before:bg-up before:animate-pulse',
  verifying: 'text-warn before:bg-warn before:animate-pulse',
  'waiting-verify': 'text-warn before:bg-warn',
  waiting: 'text-fg-muted before:bg-fg-faint',
  paused: 'text-fg-muted before:bg-fg-faint before:rounded-[1px]',
  complete: 'text-ok before:bg-ok',
  error: 'text-danger before:bg-danger',
  removed: 'text-fg-faint before:bg-fg-faint',
}

export function StatusBadge({ status, className }: { status: DisplayStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] before:size-1.5 before:shrink-0 before:rounded-full',
        styles[status],
        className,
      )}
    >
      {statusLabels[status]}
    </span>
  )
}
