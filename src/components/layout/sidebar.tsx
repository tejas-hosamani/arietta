import { Link, useLocation } from 'wouter'
import {
  ArrowDownToLine,
  ChevronsUpDown,
  CircleCheckBig,
  Gauge,
  Layers,
  ListOrdered,
  Plus,
  Server,
  Settings2,
  SlidersHorizontal,
  Check,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { useGlobalStat } from '@/hooks/aria2'
import { useAria2 } from '@/lib/aria2/client-context'
import { profileLabel, useActiveProfile, useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { formatSpeed } from '@/lib/format'
import { SpeedSparkline } from '@/components/sparkline'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown'

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="grid size-8 place-items-center rounded-[9px] bg-fg text-accent shadow-[inset_0_-2px_0_rgb(0_0_0/0.3)] dark:bg-surface-3">
        <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
          <path d="M16 6v14m0 0-5.5-5.5M16 20l5.5-5.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M9 26h14" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" opacity=".5" />
        </svg>
      </div>
      <div className="leading-none">
        <div className="text-[15px] font-semibold tracking-tight">Arietta</div>
        <div className="eyebrow mt-1 !text-[9px]">aria2 web ui</div>
      </div>
    </div>
  )
}

function NavItem({ href, icon, label, count, active }: { href: string; icon: ReactNode; label: string; count?: number; active: boolean }) {
  const setNavOpen = useUi((s) => s.setNavOpen)
  return (
    <Link
      href={href}
      onClick={() => setNavOpen(false)}
      className={cn(
        'group relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors [&_svg]:size-4',
        active ? 'bg-surface-3/80 font-medium text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      {active && <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-accent" />}
      <span className={cn(active ? 'text-accent' : 'text-fg-faint group-hover:text-fg-muted', 'dark:[&_svg]:stroke-[1.75]')}>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={cn('tabular text-[11px]', active ? 'text-fg' : 'text-fg-faint')}>{count}</span>
      )}
    </Link>
  )
}

function ConnectionDot() {
  const { state } = useAria2()
  const color =
    state === 'connected' ? 'bg-ok' : state === 'connecting' || state === 'idle' ? 'bg-warn animate-pulse' : 'bg-danger'
  return <span className={cn('inline-block size-2 rounded-full', color)} />
}

function ProfileSwitcher() {
  const profile = useActiveProfile()
  const { profiles, setActiveProfile } = useSettings()
  const { state } = useAria2()
  const [, navigate] = useLocation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-line-strong">
        <ConnectionDot />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{profileLabel(profile)}</div>
          <div className="eyebrow !text-[9.5px]">
            {profile.protocol} · {state === 'connected' ? 'online' : state === 'disconnected' ? 'offline' : 'connecting'}
          </div>
        </div>
        <ChevronsUpDown className="size-3.5 text-fg-faint" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        <DropdownMenuLabel>aria2 servers</DropdownMenuLabel>
        {profiles.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => setActiveProfile(p.id)}>
            <Server />
            <span className="flex-1 truncate">{profileLabel(p)}</span>
            {p.id === profile.id && <Check className="!text-accent" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/settings/rpc')}>
          <Settings2 />
          Manage servers
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SpeedPanel() {
  const { data } = useGlobalStat()
  const history = useUi((s) => s.speedHistory)
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-2 divide-x divide-line">
        <div className="px-3 pt-2.5">
          <div className="eyebrow flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-accent" /> down
          </div>
          <div className="tabular mt-0.5 text-[13px] font-medium">{formatSpeed(data?.downloadSpeed)}</div>
        </div>
        <div className="px-3 pt-2.5">
          <div className="eyebrow flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-up" /> up
          </div>
          <div className="tabular mt-0.5 text-[13px] font-medium">{formatSpeed(data?.uploadSpeed)}</div>
        </div>
      </div>
      <SpeedSparkline data={history} className="mt-1 block h-12 w-full" />
    </div>
  )
}

export function Sidebar() {
  const [location] = useLocation()
  const { data: stat } = useGlobalStat()
  const openNewTask = useUi((s) => s.openNewTask)
  const n = (v?: string) => Number(v ?? 0)
  const isTasks = (f: string) => location === `/tasks/${f}` || (f === 'active' && location === '/')

  return (
    <nav className="flex h-full flex-col gap-4 px-3 pb-3 pt-4">
      <div className="px-1.5">
        <Logo />
      </div>
      <ProfileSwitcher />
      <Button variant="primary" className="w-full justify-between" onClick={() => openNewTask()}>
        <span className="flex items-center gap-2">
          <Plus /> New download
        </span>
        <Kbd className="border-accent-fg/20 bg-accent-fg/10 text-accent-fg/70">N</Kbd>
      </Button>

      <div className="flex flex-col gap-0.5">
        <div className="eyebrow px-2.5 pb-1.5">Transfers</div>
        <NavItem href="/tasks/active" icon={<ArrowDownToLine />} label="Downloading" count={n(stat?.numActive)} active={isTasks('active')} />
        <NavItem href="/tasks/waiting" icon={<ListOrdered />} label="Queued" count={n(stat?.numWaiting)} active={isTasks('waiting')} />
        <NavItem href="/tasks/stopped" icon={<CircleCheckBig />} label="Finished" count={n(stat?.numStopped)} active={isTasks('stopped')} />
        <NavItem href="/tasks/all" icon={<Layers />} label="All tasks" active={isTasks('all')} />
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="eyebrow px-2.5 pb-1.5">Configure</div>
        <NavItem href="/aria2" icon={<SlidersHorizontal />} label="aria2 options" active={location.startsWith('/aria2')} />
        <NavItem href="/settings" icon={<Settings2 />} label="Preferences" active={location.startsWith('/settings')} />
        <NavItem href="/status" icon={<Gauge />} label="Server status" active={location === '/status'} />
      </div>

      <div className="mt-auto">
        <SpeedPanel />
      </div>
    </nav>
  )
}
