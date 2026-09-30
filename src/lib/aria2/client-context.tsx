import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Aria2Client, type Aria2Event, type ConnectionState } from './rpc'
import { useActiveProfile, useSettings } from '@/store/settings'
import type { Aria2Task } from './types'
import { taskName } from './task'

interface ClientContextValue {
  client: Aria2Client
  state: ConnectionState
}

const ClientContext = createContext<ClientContextValue | null>(null)

const eventMessages: Partial<Record<Aria2Event, { title: string; kind: 'success' | 'error' | 'info' }>> = {
  onDownloadComplete: { title: 'Download complete', kind: 'success' },
  onBtDownloadComplete: { title: 'Download complete, now seeding', kind: 'success' },
  onDownloadError: { title: 'Download failed', kind: 'error' },
}

export function Aria2ClientProvider({ children }: { children: ReactNode }) {
  const profile = useActiveProfile()
  const profileKey = JSON.stringify(profile)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const client = useMemo(() => new Aria2Client(profile), [profileKey])
  const [state, setState] = useState<ConnectionState>('idle')
  const queryClient = useQueryClient()
  const browserNotifications = useSettings((s) => s.browserNotifications)
  const notifyRef = useRef(browserNotifications)
  notifyRef.current = browserNotifications

  // Queries that stopped polling on an RPC error (e.g. wrong secret) must retry against an edited profile.
  const previousClient = useRef(client)
  useEffect(() => {
    if (previousClient.current === client) return
    previousClient.current = client
    queryClient.invalidateQueries({ queryKey: [client.profile.id] })
  }, [client, queryClient])

  useEffect(() => {
    client.retain()
    setState(client.state)
    const offState = client.onState(setState)
    const offEvent = client.onEvent(async (event, gid) => {
      queryClient.invalidateQueries({ queryKey: [client.profile.id] })
      const msg = eventMessages[event]
      if (!msg) return
      let name = gid
      try {
        const task = await client.call<Aria2Task>('aria2.tellStatus', gid, ['gid', 'files', 'bittorrent'])
        name = taskName(task)
      } catch {
        /* keep gid as name */
      }
      toast[msg.kind](msg.title, { description: name })
      if (notifyRef.current && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(msg.title, { body: name, tag: gid })
      }
    })
    // Establish the WebSocket eagerly so push events flow right away.
    if (client.isWebSocket) client.call('aria2.getVersion').catch(() => undefined)
    return () => {
      offState()
      offEvent()
      client.release()
    }
  }, [client, queryClient])

  const value = useMemo(() => ({ client, state }), [client, state])
  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>
}

export function useAria2() {
  const ctx = useContext(ClientContext)
  if (!ctx) throw new Error('useAria2 must be used inside Aria2ClientProvider')
  return ctx
}
