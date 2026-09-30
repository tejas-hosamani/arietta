import { useEffect, useId, useState } from 'react'
import { Lock, RotateCcw } from 'lucide-react'
import { optionValueLabel, validateOption, type OptionDef } from '@/lib/aria2/options'
import { cn } from '@/lib/cn'
import { Input, NativeSelect, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tooltip } from '@/components/ui/tooltip'

const suffixLabels: Record<string, string> = {
  Bytes: 'bytes · K/M suffix',
  Seconds: 'sec',
  Minutes: 'min',
  Milliseconds: 'ms',
  Hours: 'h',
}

/**
 * A single aria2 option row: label + description on the left, editor on the right.
 * Calls onCommit with a validated string once the user finishes editing (blur / toggle / select).
 */
export function OptionField({
  def,
  value,
  onCommit,
  readonly,
  dirty,
  history,
  compareVersion,
}: {
  def: OptionDef
  value: string
  onCommit: (value: string) => void
  readonly?: boolean
  dirty?: boolean
  history?: string[]
  compareVersion?: string
}) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setDraft(value)
    setError(null)
  }, [value])

  const isReadonly = readonly || def.readonly
  const unsupported = !!(compareVersion && def.since && compareSemver(compareVersion, def.since) < 0)

  const commit = (next: string) => {
    if (next === value) return
    const err = validateOption(def, next.trim())
    setError(err)
    if (!err) onCommit(def.type === 'text' ? next : next.trim())
  }

  let editor: React.ReactNode
  if (def.type === 'boolean') {
    editor = (
      <div className="flex h-9 items-center justify-end">
        <Switch
          id={id}
          checked={draft === 'true'}
          disabled={isReadonly}
          onCheckedChange={(c) => {
            const next = c ? 'true' : 'false'
            setDraft(next)
            commit(next)
          }}
        />
      </div>
    )
  } else if (def.type === 'option') {
    editor = (
      <NativeSelect
        id={id}
        value={draft}
        disabled={isReadonly}
        onChange={(e) => {
          setDraft(e.target.value)
          commit(e.target.value)
        }}
      >
        {!def.required && <option value="">Default</option>}
        {draft && !def.options?.includes(draft) && <option value={draft}>{draft}</option>}
        {def.options?.map((o) => (
          <option key={o} value={o}>
            {optionValueLabel(o)}
          </option>
        ))}
      </NativeSelect>
    )
  } else if (def.type === 'text') {
    const count = draft.split('\n').filter((l) => l.trim()).length
    editor = (
      <div>
        <Textarea
          id={id}
          value={draft}
          readOnly={isReadonly}
          aria-invalid={!!error}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          className="tabular min-h-20 text-xs"
          placeholder={def.defaultValue ? `Default: ${def.defaultValue}` : 'One per line'}
        />
        {def.showCount && <div className="eyebrow mt-1 text-right">{count} entries</div>}
      </div>
    )
  } else {
    const listId = history?.length ? `${id}-history` : undefined
    editor = (
      <div className="relative">
        <Input
          id={id}
          value={draft}
          readOnly={isReadonly}
          aria-invalid={!!error}
          list={listId}
          inputMode={def.type === 'integer' ? 'numeric' : def.type === 'float' ? 'decimal' : undefined}
          type={/passwd/.test(def.key) ? 'password' : 'text'}
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setDraft(value)
              setError(null)
            }
          }}
          placeholder={def.defaultValue ? `Default: ${def.defaultValue}` : ''}
          className={cn('tabular text-[13px]', def.suffix && 'pr-24')}
        />
        {def.suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-wider text-fg-faint">
            {suffixLabels[def.suffix] ?? def.suffix}
          </span>
        )}
        {listId && (
          <datalist id={listId}>
            {history!.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'grid gap-x-8 gap-y-2 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]',
        unsupported && 'opacity-50',
      )}
    >
      <div className="min-w-0">
        <label htmlFor={id} className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {def.name}
          {dirty && <span className="size-1.5 rounded-full bg-accent" title="Changed" />}
          {isReadonly && (
            <Tooltip content="Read-only here">
              <Lock className="size-3 text-fg-faint" />
            </Tooltip>
          )}
        </label>
        <div className="tabular mt-0.5 text-[11px] text-fg-faint">
          --{def.key}
          {def.since && <span> · aria2 ≥ {def.since}</span>}
        </div>
        {def.description && <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-fg-muted">{def.description}</p>}
      </div>
      <div className="min-w-0">
        {editor}
        {error && (
          <div className="mt-1.5 flex items-center justify-between text-xs text-danger">
            {error}
            <button
              className="inline-flex cursor-pointer items-center gap-1 text-fg-muted hover:text-fg"
              onClick={() => {
                setDraft(value)
                setError(null)
              }}
            >
              <RotateCcw className="size-3" /> Revert
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function compareSemver(a: string, b: string) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}
