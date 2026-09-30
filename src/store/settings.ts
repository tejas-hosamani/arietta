import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type RpcProtocol = 'http' | 'https' | 'ws' | 'wss'

export interface RpcProfile {
  id: string
  alias: string
  protocol: RpcProtocol
  host: string
  port: string
  path: string
  secret: string
  httpMethod: 'POST' | 'GET'
  headers: string
}

export type Theme = 'system' | 'light' | 'dark'
export type SortKey = 'default' | 'name' | 'size' | 'progress' | 'remaining' | 'downloadSpeed' | 'uploadSpeed'

export interface Settings {
  theme: Theme
  profiles: RpcProfile[]
  activeProfileId: string
  refreshInterval: number
  globalStatInterval: number
  confirmRemoval: boolean
  removeOldTaskAfterRetrying: boolean
  afterCreatingTask: 'list' | 'stay'
  sort: { key: SortKey; desc: boolean }
  titleTemplate: string
  browserNotifications: boolean
  density: 'comfortable' | 'compact'
  dirHistory: string[]
}

interface SettingsActions {
  set: (patch: Partial<Settings>) => void
  upsertProfile: (profile: RpcProfile) => void
  removeProfile: (id: string) => void
  setActiveProfile: (id: string) => void
  pushDirHistory: (dir: string) => void
}

export const newProfileId = () => Math.random().toString(36).slice(2, 10)

function defaultProfile(): RpcProfile {
  const loc = typeof window !== 'undefined' ? window.location : undefined
  const isHttpHost = loc && (loc.protocol === 'http:' || loc.protocol === 'https:')
  const secure = loc?.protocol === 'https:'
  return {
    id: 'default',
    alias: '',
    protocol: secure ? 'wss' : 'ws',
    host: (isHttpHost && loc.hostname) || 'localhost',
    port: '6800',
    path: 'jsonrpc',
    secret: '',
    httpMethod: 'POST',
    headers: '',
  }
}

const initial = defaultProfile()

export const useSettings = create<Settings & SettingsActions>()(
  persist(
    (set, get) => ({
      theme: 'system',
      profiles: [initial],
      activeProfileId: initial.id,
      refreshInterval: 1000,
      globalStatInterval: 1000,
      confirmRemoval: true,
      removeOldTaskAfterRetrying: false,
      afterCreatingTask: 'list',
      sort: { key: 'default', desc: false },
      titleTemplate: '↓ ${downspeed} ↑ ${upspeed} · Arietta',
      browserNotifications: false,
      density: 'comfortable',
      dirHistory: [],

      set: (patch) => set(patch),
      upsertProfile: (profile) => {
        const profiles = get().profiles
        const idx = profiles.findIndex((p) => p.id === profile.id)
        set({ profiles: idx === -1 ? [...profiles, profile] : profiles.map((p) => (p.id === profile.id ? profile : p)) })
      },
      removeProfile: (id) => {
        const profiles = get().profiles.filter((p) => p.id !== id)
        if (profiles.length === 0) return
        set({
          profiles,
          activeProfileId: get().activeProfileId === id ? profiles[0].id : get().activeProfileId,
        })
      },
      setActiveProfile: (id) => set({ activeProfileId: id }),
      pushDirHistory: (dir) => {
        const trimmed = dir.trim()
        if (!trimmed) return
        set({ dirHistory: [trimmed, ...get().dirHistory.filter((d) => d !== trimmed)].slice(0, 10) })
      },
    }),
    { name: 'arietta:settings', version: 1 },
  ),
)

export function useActiveProfile(): RpcProfile {
  return useSettings((s) => s.profiles.find((p) => p.id === s.activeProfileId) ?? s.profiles[0])
}

export function profileLabel(p: RpcProfile) {
  return p.alias || `${p.host}:${p.port}`
}
