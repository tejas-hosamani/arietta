import { useEffect, useState, type ReactNode } from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Menu, Plus, Unplug, FileDown } from 'lucide-react'
import { useLocation } from 'wouter'
import { Sidebar, Logo } from './sidebar'
import { useGlobalStat } from '@/hooks/aria2'
import { useAria2 } from '@/lib/aria2/client-context'
import { rpcUrl } from '@/lib/aria2/rpc'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { formatSpeed } from '@/lib/format'
import { Button } from '@/components/ui/button'

function useSpeedSampling() {
  const { data, dataUpdatedAt } = useGlobalStat()
  const pushSpeed = useUi((s) => s.pushSpeed)
  const resetSpeed = useUi((s) => s.resetSpeed)
  const { client } = useAria2()
  useEffect(() => resetSpeed(), [client, resetSpeed])
  useEffect(() => {
    if (data) pushSpeed({ down: Number(data.downloadSpeed), up: Number(data.uploadSpeed) })
  }, [data, dataUpdatedAt, pushSpeed])
}

function useDocumentTitle() {
  const { data } = useGlobalStat()
  const template = useSettings((s) => s.titleTemplate)
  useEffect(() => {
    if (!data || !template) {
      document.title = 'Arietta'
      return
    }
    document.title = template
      .replace(/\$\{downspeed\}/g, formatSpeed(data.downloadSpeed))
      .replace(/\$\{upspeed\}/g, formatSpeed(data.uploadSpeed))
      .replace(/\$\{active\}/g, data.numActive)
      .replace(/\$\{waiting\}/g, data.numWaiting)
      .replace(/\$\{stopped\}/g, data.numStopped)
      .replace(/\$\{title\}/g, 'Arietta')
  }, [data, template])
}

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

function useGlobalShortcuts() {
  const openNewTask = useUi((s) => s.openNewTask)
  const newTaskOpen = useUi((s) => s.newTaskOpen)
  const [, navigate] = useLocation()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || newTaskOpen) return
      if (document.querySelector('[role="dialog"]')) return
      const routes: Record<string, string> = { '1': '/tasks/active', '2': '/tasks/waiting', '3': '/tasks/stopped', '4': '/tasks/all' }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        openNewTask()
      } else if (routes[e.key]) {
        navigate(routes[e.key])
      }
    }
    // Pasting a link or magnet anywhere opens the new-task dialog with it.
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e as unknown as KeyboardEvent) || newTaskOpen) return
      const text = e.clipboardData?.getData('text')?.trim()
      if (text && /^(https?|ftp|sftp|magnet):/i.test(text)) openNewTask({ links: text })
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste)
    }
  }, [openNewTask, newTaskOpen, navigate])
}

/** Dropping .torrent / .metalink files or links anywhere opens the new-task dialog. */
function useDropZone() {
  const openNewTask = useUi((s) => s.openNewTask)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    let depth = 0
    const hasPayload = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].some((t) => t === 'Files' || t === 'text/uri-list' || t === 'text/plain')
    const onEnter = (e: DragEvent) => {
      if (!hasPayload(e)) return
      depth++
      setDragging(true)
    }
    const onLeave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onOver = (e: DragEvent) => {
      if (hasPayload(e)) e.preventDefault()
    }
    const onDrop = (e: DragEvent) => {
      depth = 0
      setDragging(false)
      if (!e.dataTransfer) return
      const files = [...e.dataTransfer.files].filter((f) => /\.(torrent|meta4|metalink)$/i.test(f.name))
      const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
      if (files.length || text) {
        e.preventDefault()
        openNewTask({ files, links: files.length ? undefined : text })
      }
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [openNewTask])
  return dragging
}

function DisconnectedBanner() {
  const { state, client } = useAria2()
  const { error } = useGlobalStat()
  const [, navigate] = useLocation()
  if (state !== 'disconnected' && !error) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-danger/30 bg-danger-soft px-4 py-2.5 text-sm sm:px-6">
      <Unplug className="size-4 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <span className="font-medium text-danger">Can't reach aria2</span>
        <span className="text-fg-muted"> at </span>
        <span className="tabular break-all text-fg-muted">{rpcUrl(client.profile)}</span>
        {error && <span className="text-fg-muted"> · {error.message}</span>}
      </div>
      <Button size="sm" variant="outline" onClick={() => navigate('/settings/rpc')}>
        Connection settings
      </Button>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  useSpeedSampling()
  useDocumentTitle()
  useGlobalShortcuts()
  const dragging = useDropZone()
  const { navOpen, setNavOpen, openNewTask } = useUi()

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface-2/40 lg:block">
        <Sidebar />
      </aside>

      <DialogPrimitive.Root open={navOpen} onOpenChange={setNavOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] animate-[enter_200ms_ease-out] border-r border-line bg-bg lg:hidden">
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Main navigation</DialogPrimitive.Description>
            <Sidebar />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setNavOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <Logo className="flex-1" />
          <Button variant="primary" size="icon" onClick={() => openNewTask()} aria-label="New download">
            <Plus />
          </Button>
        </header>
        <DisconnectedBanner />
        <main className="relative min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-[60] grid animate-in place-items-center rounded-3xl border-2 border-dashed border-accent bg-bg/85 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-accent text-accent-fg">
              <FileDown className="size-7" />
            </div>
            <div className="text-lg font-semibold tracking-tight">Drop to download</div>
            <div className="text-sm text-fg-muted">Torrent, Metalink files or links</div>
          </div>
        </div>
      )}
    </div>
  )
}
