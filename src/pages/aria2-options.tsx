import { useMemo, useState } from 'react'
import { Link } from 'wouter'
import { Search } from 'lucide-react'
import { globalOptionGroups, optionDef, deserializeOption, serializeOption } from '@/lib/aria2/options'
import { useGlobalOptions, useRpcAction, useVersion } from '@/hooks/aria2'
import { cn } from '@/lib/cn'
import { OptionField } from '@/components/option-field'
import { Input } from '@/components/ui/input'

export function Aria2OptionsPage({ group }: { group?: string }) {
  const { data: options, isLoading, error } = useGlobalOptions()
  const { data: version } = useVersion()
  const [query, setQuery] = useState('')
  const active = globalOptionGroups.find((g) => g.id === group) ?? globalOptionGroups[0]

  const change = useRpcAction(
    (c, { key, value }: { key: string; value: string }) =>
      c.call('aria2.changeGlobalOption', { [key]: serializeOption(optionDef(key), value) }),
    { success: (a) => `Updated ${optionDef(a.key).name}`, errorTitle: 'Could not change option' },
  )

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    const seen = new Set<string>()
    return globalOptionGroups
      .flatMap((g) => g.keys)
      .filter((k) => {
        if (seen.has(k)) return false
        seen.add(k)
        const def = optionDef(k)
        return `${def.name} ${k} ${def.description}`.toLowerCase().includes(q)
      })
  }, [query])

  const keys = searchResults ?? active.keys

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-5 sm:px-6 sm:pt-7">
      <div className="eyebrow">Configure</div>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">aria2 options</h1>
          <p className="mt-1 max-w-xl text-sm text-fg-muted">
            Global options on the running aria2 instance. Changes apply immediately but are not written to aria2.conf, so they
            reset when aria2 restarts.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-faint" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all options" className="pl-9" />
        </div>
      </div>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
        {globalOptionGroups.map((g) => (
          <Link
            key={g.id}
            href={`/aria2/${g.id}`}
            onClick={() => setQuery('')}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors',
              !searchResults && g.id === active.id ? 'border-accent text-fg' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {g.label}
          </Link>
        ))}
      </div>

      {error ? (
        <div className="py-16 text-center text-sm text-fg-muted">Couldn't load options: {error.message}</div>
      ) : isLoading || !options ? (
        <div className="py-16 text-center text-sm text-fg-muted">Loading…</div>
      ) : (
        <div key={searchResults ? 'search' : active.id} className="mt-2 animate-rise divide-y divide-line">
          {searchResults && <div className="eyebrow py-3">{keys.length} matching options</div>}
          {keys.map((key) => {
            const def = optionDef(key)
            return (
              <OptionField
                key={key}
                def={def}
                value={deserializeOption(def, options[key])}
                compareVersion={version?.version}
                onCommit={(value) => change.mutate({ key, value })}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
