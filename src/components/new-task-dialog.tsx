import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { ChevronDown, FileUp, Link2, Magnet, Upload, X, Download } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useAria2 } from '@/lib/aria2/client-context'
import { Aria2Error } from '@/lib/aria2/rpc'
import { optionDef, serializeOption, taskOptionKeys } from '@/lib/aria2/options'
import { useGlobalOptions } from '@/hooks/aria2'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { formatBytes } from '@/lib/format'
import { cn } from '@/lib/cn'
import { OptionField } from '@/components/option-field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogBody, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Input, Textarea } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function parseLinks(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    // A line may hold several mirrors of the same file separated by whitespace.
    .map((l) => l.split(/\s+/).filter(Boolean))
}

const QUICK_KEYS = ['dir', 'out', 'split', 'max-download-limit']

export function NewTaskDialog() {
  const { newTaskOpen, newTaskSeed, closeNewTask } = useUi()
  const { client } = useAria2()
  const queryClient = useQueryClient()
  const { afterCreatingTask, dirHistory, pushDirHistory } = useSettings()
  const { data: globalOptions } = useGlobalOptions()
  const [, navigate] = useLocation()

  const [links, setLinks] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [options, setOptions] = useState<Record<string, string>>({})
  const [paused, setPaused] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!newTaskOpen) return
    setLinks(newTaskSeed?.links ?? '')
    setFiles(newTaskSeed?.files ?? [])
    setOptions({})
    setPaused(false)
    setShowAdvanced(false)
  }, [newTaskOpen, newTaskSeed])

  const parsed = useMemo(() => parseLinks(links), [links])
  const advancedKeys = useMemo(() => taskOptionKeys('new', true).filter((o) => !QUICK_KEYS.includes(o.key)), [])
  const total = parsed.length + files.length

  const setOption = (key: string, value: string) =>
    setOptions((prev) => {
      const next = { ...prev }
      if (value === '') delete next[key]
      else next[key] = value
      return next
    })

  const submit = async () => {
    if (total === 0) return
    setSubmitting(true)
    const opts: Record<string, string | string[]> = {}
    for (const [k, v] of Object.entries(options)) opts[k] = serializeOption(optionDef(k), v)
    if (paused) opts.pause = 'true'
    try {
      const calls = [
        ...parsed.map((uris) => ({ method: 'aria2.addUri', params: [uris, opts] })),
        ...(await Promise.all(
          files.map(async (f) =>
            /\.torrent$/i.test(f.name)
              ? { method: 'aria2.addTorrent', params: [await readBase64(f), [], opts] }
              : { method: 'aria2.addMetalink', params: [await readBase64(f), opts] },
          ),
        )),
      ]
      const results = await client.multicall(calls)
      const failed = results.filter((r) => r instanceof Aria2Error) as Aria2Error[]
      const ok = results.length - failed.length
      if (ok > 0) {
        toast.success(ok === 1 ? 'Download added' : `${ok} downloads added`, {
          description: paused ? 'Added paused to the queue' : undefined,
        })
        if (options.dir) pushDirHistory(options.dir)
      }
      if (failed.length) toast.error(`${failed.length} failed to add`, { description: failed[0].message })
      queryClient.invalidateQueries({ queryKey: [client.profile.id] })
      if (failed.length === 0) {
        closeNewTask()
        if (afterCreatingTask === 'list') navigate(paused ? '/tasks/waiting' : '/tasks/active')
      }
    } catch (e) {
      toast.error('Could not add download', { description: (e as Error).message })
    } finally {
      setSubmitting(false)
    }
  }

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const accepted = [...list].filter((f) => /\.(torrent|meta4|metalink)$/i.test(f.name))
    if (accepted.length < list.length) toast.warning('Only .torrent, .meta4 and .metalink files are supported')
    setFiles((prev) => [...prev, ...accepted])
  }

  return (
    <Dialog open={newTaskOpen} onOpenChange={(o) => !o && closeNewTask()}>
      <DialogContent
        className="max-w-2xl"
        title="New download"
        description="HTTP, FTP, SFTP, magnet links, torrents and metalinks."
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
      >
        <DialogBody className="space-y-5">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="new-links" className="flex items-center gap-2 text-sm font-medium">
                <Link2 className="size-4 text-fg-faint" /> Links
              </label>
              <span className="eyebrow">{parsed.length ? `${parsed.length} ${parsed.length === 1 ? 'task' : 'tasks'}` : 'one per line'}</span>
            </div>
            <Textarea
              id="new-links"
              autoFocus
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              placeholder={'https://example.com/file.iso\nmagnet:?xt=urn:btih:…'}
              className="tabular min-h-28 text-[13px]"
              spellCheck={false}
            />
          </div>

          <div>
            <input
              ref={fileInput}
              type="file"
              accept=".torrent,.meta4,.metalink,application/x-bittorrent,application/metalink4+xml"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            {files.length > 0 && (
              <ul className="mb-2 flex flex-col gap-1.5">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
                    {/\.torrent$/i.test(f.name) ? <Magnet className="size-4 text-accent" /> : <FileUp className="size-4 text-accent" />}
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="tabular text-xs text-fg-faint">{formatBytes(f.size)}</span>
                    <button
                      className="cursor-pointer text-fg-faint hover:text-danger"
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                addFiles(e.dataTransfer.files)
              }}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-3 text-sm text-fg-muted transition-colors hover:border-accent hover:bg-accent-soft/30 hover:text-fg"
            >
              <Upload className="size-4" /> Add .torrent or .metalink files
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="eyebrow mb-1.5 block" htmlFor="new-dir">Save to</label>
              <Input
                id="new-dir"
                list="new-dir-history"
                value={options.dir ?? ''}
                onChange={(e) => setOption('dir', e.target.value)}
                placeholder={globalOptions?.dir ?? 'Default download directory'}
                className="tabular text-[13px]"
              />
              <datalist id="new-dir-history">
                {dirHistory.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="eyebrow mb-1.5 block" htmlFor="new-out">File name</label>
              <Input
                id="new-out"
                value={options.out ?? ''}
                onChange={(e) => setOption('out', e.target.value)}
                placeholder="Auto"
                disabled={total > 1}
                className="text-[13px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="eyebrow mb-1.5 block" htmlFor="new-split">Connections</label>
                <Input
                  id="new-split"
                  inputMode="numeric"
                  value={options.split ?? ''}
                  onChange={(e) => setOption('split', e.target.value.replace(/\D/g, ''))}
                  placeholder={globalOptions?.split ?? '5'}
                  className="tabular text-[13px]"
                />
              </div>
              <div>
                <label className="eyebrow mb-1.5 block" htmlFor="new-limit">Speed limit</label>
                <Input
                  id="new-limit"
                  value={options['max-download-limit'] ?? ''}
                  onChange={(e) => setOption('max-download-limit', e.target.value)}
                  placeholder="e.g. 2M"
                  className="tabular text-[13px]"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium"
            >
              <span className="flex items-center gap-2">
                Advanced options
                {Object.keys(options).filter((k) => !QUICK_KEYS.includes(k)).length > 0 && (
                  <span className="tabular rounded-full bg-accent-soft px-1.5 text-[11px] text-accent">
                    {Object.keys(options).filter((k) => !QUICK_KEYS.includes(k)).length}
                  </span>
                )}
              </span>
              <ChevronDown className={cn('size-4 text-fg-faint transition-transform', showAdvanced && 'rotate-180')} />
            </button>
            {showAdvanced && (
              <div className="divide-y divide-line border-t border-line px-4">
                {advancedKeys.map((o) => (
                  <OptionField
                    key={o.key}
                    def={optionDef(o.key)}
                    value={options[o.key] ?? ''}
                    dirty={options[o.key] !== undefined}
                    onCommit={(v) => setOption(o.key, v)}
                  />
                ))}
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter className="justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
            <Checkbox checked={paused} onCheckedChange={(c) => setPaused(c === true)} />
            Add paused
          </label>
          <div className="flex items-center gap-2">
            <span className="mr-1 hidden items-center gap-1 text-xs text-fg-faint sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
            </span>
            <Button variant="ghost" onClick={closeNewTask}>
              Cancel
            </Button>
            <Button variant="primary" disabled={total === 0} loading={submitting} onClick={submit}>
              <Download />
              {total > 1 ? `Download ${total}` : 'Download'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
