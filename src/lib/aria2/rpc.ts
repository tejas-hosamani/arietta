import type { RpcProfile } from '@/store/settings'

export type Aria2Event =
  | 'onDownloadStart'
  | 'onDownloadPause'
  | 'onDownloadStop'
  | 'onDownloadComplete'
  | 'onDownloadError'
  | 'onBtDownloadComplete'

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected'

export class Aria2Error extends Error {
  code: number | undefined
  constructor(message: string, code?: number) {
    super(message)
    this.name = 'Aria2Error'
    this.code = code
  }
}

interface JsonRpcResponse {
  id: string
  jsonrpc: '2.0'
  result?: unknown
  error?: { code: number; message: string }
  method?: string
  params?: unknown[]
}

export interface MulticallItem {
  method: string
  params?: unknown[]
}

type EventListener = (event: Aria2Event, gid: string) => void
type StateListener = (state: ConnectionState) => void

const REQUEST_TIMEOUT = 20_000

let idCounter = 0
const nextId = () => `arietta-${Date.now().toString(36)}-${(idCounter++).toString(36)}`

export function rpcUrl(profile: RpcProfile): string {
  const path = profile.path.replace(/^\/+/, '')
  return `${profile.protocol}://${profile.host}:${profile.port}/${path}`
}

function parseHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key) headers[key] = value
  }
  return headers
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/**
 * aria2 JSON-RPC client supporting HTTP (POST/GET) and WebSocket transports.
 * The secret token is injected automatically, including inside system.multicall.
 */
export class Aria2Client {
  readonly profile: RpcProfile
  private ws: WebSocket | null = null
  private wsOpening: Promise<WebSocket> | null = null
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: number }>()
  private eventListeners = new Set<EventListener>()
  private stateListeners = new Set<StateListener>()
  private rejectOpening: ((e: unknown) => void) | null = null
  private reconnectTimer: number | null = null
  private releaseTimer: number | null = null
  private closed = false
  private _state: ConnectionState = 'idle'

  constructor(profile: RpcProfile) {
    this.profile = profile
  }

  get isWebSocket() {
    return this.profile.protocol === 'ws' || this.profile.protocol === 'wss'
  }

  get state() {
    return this._state
  }

  private setState(state: ConnectionState) {
    if (this._state === state) return
    this._state = state
    for (const l of this.stateListeners) l(state)
  }

  /** Only a fresh client shows "connecting"; a failed one stays "disconnected" until a request succeeds. */
  private markConnecting() {
    if (this._state === 'idle') this.setState('connecting')
  }

  onEvent(listener: EventListener) {
    this.eventListeners.add(listener)
    return () => void this.eventListeners.delete(listener)
  }

  onState(listener: StateListener) {
    this.stateListeners.add(listener)
    return () => void this.stateListeners.delete(listener)
  }

  private withToken(params: unknown[] = []): unknown[] {
    return this.profile.secret ? [`token:${this.profile.secret}`, ...params] : params
  }

  async call<T = unknown>(method: string, ...params: unknown[]): Promise<T> {
    this.closed = false
    const fullParams = method.startsWith('system.') && method !== 'system.multicall' ? params : this.withToken(params)
    const request = { jsonrpc: '2.0', id: nextId(), method, params: fullParams }
    return this.isWebSocket ? this.sendWs<T>(request) : this.sendHttp<T>(request)
  }

  /** Runs several calls in one round trip. Each result is unwrapped; failed calls become Aria2Error instances. */
  async multicall(items: MulticallItem[]): Promise<unknown[]> {
    const calls = items.map((i) => ({ methodName: i.method, params: this.withToken(i.params) }))
    const results = await this.call<unknown[]>('system.multicall', calls)
    return results.map((r) => {
      if (Array.isArray(r)) return r[0]
      const err = r as { code?: number; faultCode?: number; message?: string; faultString?: string }
      return new Aria2Error(err.message ?? err.faultString ?? 'Unknown error', err.code ?? err.faultCode)
    })
  }

  private async sendHttp<T>(request: { id: string; method: string; params: unknown[] }): Promise<T> {
    const url = rpcUrl(this.profile)
    const headers = parseHeaders(this.profile.headers)
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
    this.markConnecting()
    try {
      let res: Response
      if (this.profile.httpMethod === 'GET') {
        const qs = new URLSearchParams({
          method: request.method,
          id: request.id,
          params: toBase64(JSON.stringify(request.params)),
        })
        res = await fetch(`${url}?${qs}`, { headers, signal: controller.signal })
      } else {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ jsonrpc: '2.0', ...request }),
          signal: controller.signal,
        })
      }
      const body = (await res.json().catch(() => null)) as JsonRpcResponse | null
      if (!body) throw new Aria2Error(`HTTP ${res.status} ${res.statusText}`.trim())
      this.setState('connected')
      if (body.error) throw new Aria2Error(body.error.message, body.error.code)
      return body.result as T
    } catch (e) {
      if (e instanceof Aria2Error) throw e
      this.setState('disconnected')
      if ((e as Error).name === 'AbortError') throw new Aria2Error('Request timed out')
      throw new Aria2Error('Cannot connect to aria2')
    } finally {
      window.clearTimeout(timer)
    }
  }

  private openWs(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve(this.ws)
    if (this.wsOpening) return this.wsOpening
    this.markConnecting()
    this.wsOpening = new Promise<WebSocket>((resolve, reject) => {
      this.rejectOpening = reject
      let ws: WebSocket
      try {
        ws = new WebSocket(rpcUrl(this.profile))
      } catch {
        this.wsOpening = null
        this.setState('disconnected')
        reject(new Aria2Error('Cannot initialize WebSocket'))
        return
      }
      this.ws = ws
      // Handlers ignore sockets that were superseded (e.g. closed, then reopened).
      const current = () => this.ws === ws
      ws.onopen = () => {
        if (!current()) return
        this.wsOpening = null
        this.rejectOpening = null
        this.setState('connected')
        resolve(ws)
      }
      ws.onmessage = (msg) => {
        if (current()) this.handleWsMessage(msg.data)
      }
      ws.onerror = () => {
        if (current() && ws.readyState !== WebSocket.OPEN) {
          this.wsOpening = null
          reject(new Aria2Error('Cannot connect to aria2'))
        }
      }
      ws.onclose = () => {
        if (!current()) return
        this.ws = null
        this.wsOpening = null
        this.setState('disconnected')
        this.rejectPending('Connection closed')
        reject(new Aria2Error('Cannot connect to aria2'))
        this.scheduleReconnect()
      }
    })
    return this.wsOpening
  }

  private rejectPending(message: string) {
    for (const [id, p] of this.pending) {
      window.clearTimeout(p.timer)
      p.reject(new Aria2Error(message))
      this.pending.delete(id)
    }
  }

  private scheduleReconnect() {
    if (this.closed || this.reconnectTimer !== null) return
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      if (!this.closed) this.openWs().catch(() => undefined)
    }, 5000)
  }

  private handleWsMessage(data: string) {
    let msg: JsonRpcResponse
    try {
      msg = JSON.parse(data)
    } catch {
      return
    }
    if (msg.method && !msg.id) {
      const event = msg.method.replace(/^aria2\./, '') as Aria2Event
      const gid = (msg.params?.[0] as { gid?: string } | undefined)?.gid
      if (gid) for (const l of this.eventListeners) l(event, gid)
      return
    }
    const p = this.pending.get(msg.id)
    if (!p) return
    this.pending.delete(msg.id)
    window.clearTimeout(p.timer)
    if (msg.error) p.reject(new Aria2Error(msg.error.message, msg.error.code))
    else p.resolve(msg.result)
  }

  private async sendWs<T>(request: { id: string; method: string; params: unknown[] }): Promise<T> {
    const ws = await this.openWs()
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(request.id)
        reject(new Aria2Error('Request timed out'))
      }, REQUEST_TIMEOUT)
      this.pending.set(request.id, { resolve: resolve as (v: unknown) => void, reject, timer })
      ws.send(JSON.stringify({ jsonrpc: '2.0', ...request }))
    })
  }

  /** Marks the client as in use, cancelling a pending release(). */
  retain() {
    if (this.releaseTimer !== null) window.clearTimeout(this.releaseTimer)
    this.releaseTimer = null
  }

  /**
   * Closes the client on the next tick unless retain() is called first. This lets React StrictMode's
   * unmount/remount cycle keep the same connection instead of tearing it down mid-handshake.
   */
  release() {
    this.retain()
    this.releaseTimer = window.setTimeout(() => {
      this.releaseTimer = null
      this.close()
    }, 0)
  }

  /** Disconnects and stops reconnecting. A later call() reconnects on demand. */
  close() {
    this.closed = true
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    const ws = this.ws
    this.ws = null
    this.wsOpening = null
    // Callers awaiting a socket that is being torn down must not hang forever.
    this.rejectOpening?.(new Aria2Error('Connection closed'))
    this.rejectOpening = null
    this.rejectPending('Connection closed')
    ws?.close()
  }
}
