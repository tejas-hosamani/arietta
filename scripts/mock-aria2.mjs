#!/usr/bin/env node
// A fake aria2 JSON-RPC server for UI development and screenshots.
// Serves HTTP and WebSocket on the same port, simulates progressing downloads and sends push events.
// Usage: npm run mock [-- --port 6800] [--secret SECRET]   (MOCK_SECRET env var also sets the secret)
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { WebSocketServer } from 'ws'

const portArg = process.argv.indexOf('--port')
const PORT = portArg > -1 ? Number(process.argv[portArg + 1]) : 6800
const secretArg = process.argv.indexOf('--secret')
const SECRET = secretArg > -1 ? process.argv[secretArg + 1] : process.env.MOCK_SECRET || ''
const TICK_MS = 500
const MB = 1024 * 1024
const GB = 1024 * MB

const data = JSON.parse(readFileSync(new URL('../src/lib/aria2/data.json', import.meta.url), 'utf8'))

// ---------------------------------------------------------------------------------------------------------------------
// Deterministic randomness so screenshots look the same on every run.

let seed = 20260930
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const jitter = (value, spread = 0.15) => value * (1 - spread + rand() * spread * 2)

let gidCounter = 0x2b3c4d5e6f708190n
const newGid = () => (gidCounter += 0x1f3a5c7b9d1e2f3n).toString(16).padStart(16, '0').slice(-16)

// ---------------------------------------------------------------------------------------------------------------------
// Task model

const DIR = '/downloads'
const TRACKERS = [
  ['udp://tracker.opentrackr.org:1337/announce'],
  ['udp://open.stealth.si:80/announce', 'udp://tracker.torrent.eu.org:451/announce'],
  ['https://tracker.example.org/announce'],
]
const CLIENTS = ['-qB5010-', '-TR4060-', '-DE2110-', '-UT3600-', '-lt20A0-', '-BI3600-', '-A2-1-37-0-', '-KT5B00-', '-RT0980-']

function makePeers(count) {
  return Array.from({ length: count }, (_, i) => ({
    ip: `${pick([185, 94, 176, 213, 81, 62, 37, 151, 89])}.${Math.floor(rand() * 255)}.${Math.floor(rand() * 255)}.${Math.floor(rand() * 254) + 1}`,
    port: String(Math.floor(rand() * 50000) + 10000),
    client: pick(CLIENTS),
    ratio: i < count * 0.35 ? 1 : rand(),
    down: rand() < 0.7 ? rand() : 0,
    up: rand() < 0.4 ? rand() : 0,
    choking: rand() < 0.5,
  }))
}

/**
 * @param {object} t
 * @param {string} t.name display / file name
 * @param {'active'|'waiting'|'paused'|'complete'|'error'} t.status
 * @param {number} t.size total bytes
 * @param {number} [t.progress] 0..1
 * @param {number} [t.speed] target bytes/s while active
 * @param {'http'|'bt'} [t.kind]
 * @param {(string|[string, number])[]} [t.files] relative paths for multi-file torrents, optionally with a size weight
 */
function makeTask(t) {
  const kind = t.kind ?? 'http'
  const size = Math.floor(t.size)
  const pieceLength = size > 2 * GB ? 4 * MB : size > 256 * MB ? 1 * MB : 256 * 1024
  const numPieces = Math.ceil(size / pieceLength)
  const order = Array.from({ length: numPieces }, (_, i) => i)
  // Mostly sequential with some scatter, which is what real piece maps tend to look like.
  for (let i = order.length - 1; i > 0; i--) {
    if (rand() < 0.35) {
      const j = Math.max(0, i - Math.floor(rand() * 40))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
  }
  // A file entry is a path, or [path, weight] to control its share of the total size.
  const entries = (t.files ?? [t.name]).map((f) => (Array.isArray(f) ? f : [f, 0.3 + rand()]))
  const relFiles = entries.map(([rel]) => rel)
  const weights = entries.map(([, w]) => w)
  const wsum = weights.reduce((a, b) => a + b, 0)
  let assigned = 0
  const files = relFiles.map((rel, i) => {
    const length = i === relFiles.length - 1 ? size - assigned : Math.floor((size * weights[i]) / wsum)
    assigned += length
    return { index: String(i + 1), rel, length, selected: t.deselect?.includes(i) ? false : true }
  })
  const task = {
    gid: newGid(),
    kind,
    name: t.name,
    status: t.status,
    size,
    done: Math.floor(size * (t.progress ?? 0)),
    uploaded: t.uploaded ?? 0,
    speed: t.speed ?? 4 * MB,
    upSpeedTarget: kind === 'bt' ? (t.upSpeed ?? 180 * 1024) : 0,
    downloadSpeed: 0,
    uploadSpeed: 0,
    pieceLength,
    numPieces,
    order,
    files,
    uris: kind === 'http' ? (t.uris ?? [`https://mirror.example.com/pub/${t.name}`]) : [],
    peers: kind === 'bt' ? makePeers(t.peers ?? 14) : [],
    seeder: false,
    infoHash: kind === 'bt' ? Array.from({ length: 40 }, () => Math.floor(rand() * 16).toString(16)).join('') : undefined,
    errorCode: t.errorCode,
    errorMessage: t.errorMessage,
    comment: t.comment,
    options: { dir: DIR, split: '5', 'max-connection-per-server': kind === 'http' ? '4' : '1', 'max-download-limit': '0' },
  }
  if (task.status === 'complete') task.done = size
  if (kind === 'bt' && task.done >= size && task.status === 'active') task.seeder = true
  return task
}

const tasks = [
  makeTask({
    name: 'ubuntu-24.04.3-desktop-amd64.iso',
    kind: 'bt',
    status: 'active',
    size: 6.1 * GB,
    progress: 0.63,
    speed: 11.4 * MB,
    upSpeed: 820 * 1024,
    uploaded: 1.9 * GB,
    peers: 22,
    comment: 'Ubuntu CD releases.ubuntu.com',
  }),
  makeTask({
    name: 'Blender Open Movies',
    kind: 'bt',
    status: 'active',
    size: 14.2 * GB,
    progress: 0.27,
    speed: 6.8 * MB,
    upSpeed: 310 * 1024,
    uploaded: 640 * MB,
    peers: 17,
    files: [
      ['Blender Open Movies/Big Buck Bunny/big_buck_bunny_1080p.mkv', 0.9],
      ['Blender Open Movies/Big Buck Bunny/poster.png', 0.0004],
      ['Blender Open Movies/Sintel/sintel-2048-surround.mp4', 0.6],
      ['Blender Open Movies/Sintel/subtitles/sintel_en.srt', 0.00001],
      ['Blender Open Movies/Sintel/subtitles/sintel_de.srt', 0.00001],
      ['Blender Open Movies/Tears of Steel/tears_of_steel_1080p.mov', 0.8],
      ['Blender Open Movies/Spring/spring_4k.mp4', 1.4],
      ['Blender Open Movies/Charge/charge_2160p.mkv', 0.5],
      ['Blender Open Movies/README.txt', 0.000001],
    ],
    deselect: [6],
  }),
  makeTask({
    name: 'debian-13.1.0-amd64-DVD-1.iso',
    status: 'active',
    size: 3.9 * GB,
    progress: 0.41,
    speed: 18.2 * MB,
    uris: [
      'https://cdimage.debian.org/debian-cd/current/amd64/iso-dvd/debian-13.1.0-amd64-DVD-1.iso',
      'https://mirrors.kernel.org/debian-cd/current/amd64/iso-dvd/debian-13.1.0-amd64-DVD-1.iso',
    ],
  }),
  makeTask({ name: 'wikipedia_en_all_maxi_2026-09.zim', kind: 'bt', status: 'active', size: 109 * GB, progress: 1, upSpeed: 1.6 * MB, uploaded: 212 * GB, peers: 9 }),
  makeTask({ name: 'archlinux-2026.09.01-x86_64.iso', status: 'waiting', size: 1.3 * GB, speed: 9 * MB }),
  makeTask({ name: 'Fedora-Workstation-Live-43-1.6.x86_64.iso', status: 'waiting', size: 2.4 * GB, speed: 7 * MB }),
  makeTask({ name: 'Xcode_26.1.xip', status: 'paused', size: 3.2 * GB, progress: 0.58 }),
  makeTask({ name: 'LibreOffice_25.8.2_MacOS_aarch64.dmg', status: 'complete', size: 312 * MB }),
  makeTask({ name: 'The Changelog 612 - Local-first software.mp3', status: 'complete', size: 94 * MB }),
  makeTask({ name: 'photos-backup-2026-q3.tar.zst', status: 'complete', size: 7.4 * GB }),
  makeTask({
    name: 'router-firmware-v4.2.1.bin',
    status: 'error',
    size: 28 * MB,
    progress: 0,
    errorCode: '3',
    errorMessage: 'Resource not found',
    uris: ['https://downloads.example.net/firmware/router-firmware-v4.2.1.bin'],
  }),
]

const globalOptions = {}
for (const [key, def] of Object.entries(data.allOptions)) {
  if (def.defaultValue !== undefined) globalOptions[key] = String(def.defaultValue)
}
Object.assign(globalOptions, {
  dir: DIR,
  'max-concurrent-downloads': '4',
  'max-overall-download-limit': '0',
  'max-overall-upload-limit': '2M',
  'enable-rpc': 'true',
  'rpc-listen-port': String(PORT),
  'seed-ratio': '2.0',
  continue: 'true',
})

// ---------------------------------------------------------------------------------------------------------------------
// Serialization in aria2's wire format (all numbers are strings)

function bitfield(task, ratio = task.done / task.size) {
  const bits = new Uint8Array(task.numPieces)
  const have = Math.floor(ratio * task.numPieces)
  for (let i = 0; i < have; i++) bits[task.order[i]] = 1
  let hex = ''
  for (let i = 0; i < task.numPieces; i += 4) {
    hex += ((bits[i] << 3) | ((bits[i + 1] ?? 0) << 2) | ((bits[i + 2] ?? 0) << 1) | (bits[i + 3] ?? 0)).toString(16)
  }
  return hex
}

function fileStatus(task) {
  const ratio = task.done / task.size
  return task.files.map((f) => ({
    index: f.index,
    path: `${DIR}/${f.rel}`,
    length: String(f.length),
    completedLength: String(f.selected ? Math.floor(f.length * ratio) : 0),
    selected: String(f.selected),
    uris: task.uris.map((uri, i) => ({ uri, status: i === 0 && task.status === 'active' ? 'used' : 'waiting' })),
  }))
}

function status(task) {
  const out = {
    gid: task.gid,
    status: task.status,
    totalLength: String(task.size),
    completedLength: String(task.done),
    uploadLength: String(Math.floor(task.uploaded)),
    downloadSpeed: String(Math.floor(task.downloadSpeed)),
    uploadSpeed: String(Math.floor(task.uploadSpeed)),
    connections: String(task.status === 'active' ? (task.kind === 'bt' ? task.peers.length : task.uris.length * 4) : 0),
    pieceLength: String(task.pieceLength),
    numPieces: String(task.numPieces),
    bitfield: bitfield(task),
    dir: DIR,
    files: fileStatus(task),
  }
  if (task.kind === 'bt') {
    out.infoHash = task.infoHash
    out.numSeeders = String(task.status === 'active' ? task.peers.filter((p) => p.ratio === 1).length : 0)
    out.seeder = String(task.seeder)
    out.bittorrent = {
      announceList: TRACKERS,
      comment: task.comment,
      creationDate: 1756684800,
      mode: task.files.length > 1 ? 'multi' : 'single',
      info: { name: task.name },
    }
  }
  if (task.errorCode) {
    out.errorCode = task.errorCode
    out.errorMessage = task.errorMessage
  }
  return out
}

function pick_keys(obj, keys) {
  if (!Array.isArray(keys) || !keys.length) return obj
  return Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]))
}

// ---------------------------------------------------------------------------------------------------------------------
// Simulation

const sockets = new Set()
function notify(method, gid) {
  const msg = JSON.stringify({ jsonrpc: '2.0', method: `aria2.${method}`, params: [{ gid }] })
  for (const ws of sockets) if (ws.readyState === 1) ws.send(msg)
}

const byStatus = (s) => tasks.filter((t) => t.status === s)

function startQueued() {
  const max = Number(globalOptions['max-concurrent-downloads']) || 5
  const running = byStatus('active').filter((t) => !t.seeder).length
  for (const t of byStatus('waiting').slice(0, Math.max(0, max - running))) {
    t.status = 'active'
    notify('onDownloadStart', t.gid)
  }
}

setInterval(() => {
  const dt = TICK_MS / 1000
  for (const t of tasks) {
    if (t.status !== 'active') {
      t.downloadSpeed = 0
      t.uploadSpeed = 0
      continue
    }
    if (t.kind === 'bt') {
      t.uploadSpeed = jitter(t.upSpeedTarget, 0.3)
      t.uploaded += t.uploadSpeed * dt
    }
    if (t.seeder) {
      t.downloadSpeed = 0
      continue
    }
    t.downloadSpeed = jitter(t.speed, 0.2)
    t.done = Math.min(t.size, t.done + t.downloadSpeed * dt)
    if (t.done >= t.size) {
      t.downloadSpeed = 0
      if (t.kind === 'bt') {
        t.seeder = true
        notify('onBtDownloadComplete', t.gid)
      } else {
        t.status = 'complete'
        notify('onDownloadComplete', t.gid)
        startQueued()
      }
    }
  }
}, TICK_MS)

// ---------------------------------------------------------------------------------------------------------------------
// RPC methods

class RpcError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const find = (gid) => {
  const t = tasks.find((x) => x.gid === gid)
  if (!t) throw new RpcError(1, `GID ${gid} is not found`)
  return t
}

function addTask(name, opts = {}, kind = 'http', uris) {
  const task = makeTask({
    name,
    kind,
    status: opts.pause === 'true' ? 'paused' : 'waiting',
    size: Math.floor((80 + rand() * 1800) * MB),
    speed: jitter(6 * MB, 0.5),
    uris,
    peers: 11,
  })
  tasks.push(task)
  startQueued()
  return task.gid
}

const methods = {
  getVersion: () => ({
    version: '1.37.0',
    enabledFeatures: ['Async DNS', 'BitTorrent', 'Firefox3 Cookie', 'GZip', 'HTTPS', 'Message Digest', 'Metalink', 'XML-RPC', 'SFTP'],
  }),
  getSessionInfo: () => ({ sessionId: 'c9f1e2a47b3d5e6f8091a2b3c4d5e6f708192a3b' }),
  getGlobalStat: () => {
    const active = byStatus('active')
    return {
      downloadSpeed: String(Math.floor(active.reduce((a, t) => a + t.downloadSpeed, 0))),
      uploadSpeed: String(Math.floor(active.reduce((a, t) => a + t.uploadSpeed, 0))),
      numActive: String(active.length),
      numWaiting: String(byStatus('waiting').length + byStatus('paused').length),
      numStopped: String(tasks.filter((t) => ['complete', 'error', 'removed'].includes(t.status)).length),
      numStoppedTotal: String(tasks.filter((t) => ['complete', 'error', 'removed'].includes(t.status)).length),
    }
  },
  tellActive: (keys) => byStatus('active').map((t) => pick_keys(status(t), keys)),
  tellWaiting: (offset, num, keys) =>
    tasks
      .filter((t) => t.status === 'waiting' || t.status === 'paused')
      .slice(offset, offset + num)
      .map((t) => pick_keys(status(t), keys)),
  tellStopped: (offset, num, keys) =>
    tasks
      .filter((t) => ['complete', 'error', 'removed'].includes(t.status))
      .slice(offset, offset + num)
      .map((t) => pick_keys(status(t), keys)),
  tellStatus: (gid, keys) => pick_keys(status(find(gid)), keys),
  getFiles: (gid) => fileStatus(find(gid)),
  getUris: (gid) => find(gid).uris.map((uri) => ({ uri, status: 'used' })),
  getPeers: (gid) => {
    const t = find(gid)
    if (t.status !== 'active') return []
    return t.peers.map((p) => ({
      peerId: encodeURIComponent(p.client + Math.random().toString(36).slice(2, 14)).slice(0, 60),
      ip: p.ip,
      port: p.port,
      bitfield: bitfield(t, p.ratio),
      amChoking: String(p.choking),
      peerChoking: String(p.ratio === 1 ? false : rand() < 0.5),
      downloadSpeed: String(t.seeder ? 0 : Math.floor(jitter((t.downloadSpeed / t.peers.length) * 2 * p.down, 0.3))),
      uploadSpeed: String(Math.floor(jitter((t.uploadSpeed / t.peers.length) * 2 * p.up, 0.3))),
      seeder: String(p.ratio === 1),
    }))
  },
  getServers: (gid) => {
    const t = find(gid)
    if (t.status !== 'active') throw new RpcError(1, `No active download for GID#${gid}`)
    return [
      {
        index: '1',
        servers: t.uris.map((uri, i) => ({
          uri,
          currentUri: uri,
          downloadSpeed: String(Math.floor(t.downloadSpeed * (i === 0 ? 0.62 : 0.38))),
        })),
      },
    ]
  },
  getOption: (gid) => ({ ...globalOptions, ...find(gid).options }),
  changeOption: (gid, opts) => {
    const t = find(gid)
    if (opts['select-file']) {
      const selected = new Set(String(opts['select-file']).split(','))
      for (const f of t.files) f.selected = selected.has(f.index)
    }
    Object.assign(t.options, opts)
    return 'OK'
  },
  getGlobalOption: () => globalOptions,
  changeGlobalOption: (opts) => {
    Object.assign(globalOptions, opts)
    startQueued()
    return 'OK'
  },
  addUri: (uris, opts = {}) => {
    const first = uris[0]
    let name
    let kind = 'http'
    if (first.startsWith('magnet:')) {
      kind = 'bt'
      name = new URLSearchParams(first.slice(first.indexOf('?') + 1)).get('dn') ?? 'magnet-download'
    } else {
      try {
        name = decodeURIComponent(new URL(first).pathname.split('/').filter(Boolean).pop() ?? 'index.html')
      } catch {
        throw new RpcError(1, 'Unrecognized URI or unsupported protocol')
      }
    }
    return addTask(name, opts, kind, kind === 'http' ? uris : undefined)
  },
  addTorrent: (_b64, _uris, opts = {}) => addTask(`torrent-${tasks.length + 1}`, opts, 'bt'),
  addMetalink: (_b64, opts = {}) => [addTask(`metalink-${tasks.length + 1}.bin`, opts)],
  pause: (gid) => methods.forcePause(gid),
  forcePause: (gid) => {
    const t = find(gid)
    if (!['active', 'waiting'].includes(t.status)) throw new RpcError(1, `GID#${gid} cannot be paused now`)
    t.status = 'paused'
    notify('onDownloadPause', gid)
    startQueued()
    return gid
  },
  pauseAll: () => methods.forcePauseAll(),
  forcePauseAll: () => {
    for (const t of tasks) if (t.status === 'active' || t.status === 'waiting') t.status = 'paused'
    return 'OK'
  },
  unpause: (gid) => {
    const t = find(gid)
    if (t.status !== 'paused') throw new RpcError(1, `GID#${gid} cannot be unpaused now`)
    t.status = 'waiting'
    startQueued()
    return gid
  },
  unpauseAll: () => {
    for (const t of tasks) if (t.status === 'paused') t.status = 'waiting'
    startQueued()
    return 'OK'
  },
  remove: (gid) => methods.forceRemove(gid),
  forceRemove: (gid) => {
    const t = find(gid)
    t.status = 'removed'
    notify('onDownloadStop', gid)
    startQueued()
    return gid
  },
  removeDownloadResult: (gid) => {
    const t = find(gid)
    tasks.splice(tasks.indexOf(t), 1)
    return 'OK'
  },
  purgeDownloadResult: () => {
    for (let i = tasks.length - 1; i >= 0; i--) if (['complete', 'error', 'removed'].includes(tasks[i].status)) tasks.splice(i, 1)
    return 'OK'
  },
  changePosition: (gid, pos, how) => {
    const t = find(gid)
    const queue = tasks.filter((x) => x.status === 'waiting' || x.status === 'paused')
    const from = queue.indexOf(t)
    if (from < 0) throw new RpcError(1, `GID#${gid} not found in the waiting queue`)
    const to = Math.max(0, Math.min(queue.length - 1, how === 'POS_SET' ? pos : how === 'POS_END' ? queue.length - 1 + pos : from + pos))
    queue.splice(from, 1)
    queue.splice(to, 0, t)
    // Rewrite the waiting slice of the task array in the new order.
    const others = tasks.filter((x) => !queue.includes(x))
    tasks.length = 0
    tasks.push(...others, ...queue)
    return to
  },
  saveSession: () => 'OK',
  shutdown: () => 'OK',
  forceShutdown: () => 'OK',
}

// Mirrors real aria2: system.* methods take no token, aria2.* methods need `token:<secret>` first when a secret is set.
function invoke(method, params = []) {
  if (method.startsWith('system.') && params.length > 0 && !Array.isArray(params[0])) {
    throw new RpcError(1, 'The parameter at 0 has wrong type.')
  }
  if (method === 'system.multicall') {
    return params[0].map(({ methodName, params: p }) => {
      try {
        return [invoke(methodName, p)]
      } catch (e) {
        return { code: e.code ?? 1, message: e.message }
      }
    })
  }
  if (method === 'system.listMethods') return Object.keys(methods).map((m) => `aria2.${m}`)
  const name = method.replace(/^aria2\./, '')
  const fn = methods[name]
  if (!fn) throw new RpcError(1, `No such method: ${method}`)
  const hasToken = typeof params[0] === 'string' && params[0].startsWith('token:')
  if (SECRET && params[0] !== `token:${SECRET}`) throw new RpcError(1, 'Unauthorized')
  const args = hasToken ? params.slice(1) : params
  return fn(...args)
}

function handle(body) {
  const { id, method, params } = body
  try {
    return { id, jsonrpc: '2.0', result: invoke(method, params) }
  } catch (e) {
    return { id, jsonrpc: '2.0', error: { code: e.code ?? 1, message: e.message } }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Transport

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const server = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors).end()
    return
  }
  const send = (payload) => {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' }).end(JSON.stringify(payload))
  }
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost')
    const params = url.searchParams.get('params')
    send(
      handle({
        id: url.searchParams.get('id'),
        method: url.searchParams.get('method'),
        params: params ? JSON.parse(Buffer.from(params, 'base64').toString('utf8')) : [],
      }),
    )
    return
  }
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    try {
      const body = JSON.parse(raw)
      send(Array.isArray(body) ? body.map(handle) : handle(body))
    } catch {
      send({ id: null, jsonrpc: '2.0', error: { code: -32700, message: 'Parse error.' } })
    }
  })
})

const wss = new WebSocketServer({ server })
wss.on('connection', (ws) => {
  sockets.add(ws)
  ws.on('close', () => sockets.delete(ws))
  ws.on('message', (raw) => {
    try {
      ws.send(JSON.stringify(handle(JSON.parse(String(raw)))))
    } catch {
      ws.send(JSON.stringify({ id: null, jsonrpc: '2.0', error: { code: -32700, message: 'Parse error.' } }))
    }
  })
})

server.listen(PORT, () => {
  console.log(`Mock aria2 RPC listening on ws://localhost:${PORT}/jsonrpc (HTTP on the same port)`)
  if (SECRET) console.log(`RPC secret required: ${SECRET}`)
})
