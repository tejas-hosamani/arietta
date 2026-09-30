import { cn } from '@/lib/cn'

type Tone = 'accent' | 'up' | 'muted' | 'danger' | 'ok' | 'warn'

const tones: Record<Tone, string> = {
  accent: 'bg-accent',
  up: 'bg-up',
  muted: 'bg-fg-faint',
  danger: 'bg-danger',
  ok: 'bg-ok',
  warn: 'bg-warn',
}

export function Progress({
  value,
  tone = 'accent',
  live,
  className,
}: {
  value: number
  tone?: Tone
  live?: boolean
  className?: string
}) {
  const pct = Math.max(0, Math.min(1, value || 0)) * 100
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('relative h-1 w-full overflow-hidden rounded-full bg-surface-3', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-700 ease-out', tones[tone])}
        style={{ width: `${pct}%` }}
      >
        {live && (
          <div className="size-full animate-stripes bg-[linear-gradient(45deg,rgb(255_255_255/0.28)_25%,transparent_25%,transparent_50%,rgb(255_255_255/0.28)_50%,rgb(255_255_255/0.28)_75%,transparent_75%)] bg-[length:16px_16px]" />
        )}
      </div>
    </div>
  )
}
