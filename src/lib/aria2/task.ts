import type { Aria2File, Aria2Task, TaskStatus } from './types'
import data from './data.json'

export type DisplayStatus = TaskStatus | 'seeding' | 'verifying' | 'waiting-verify'

export function taskName(task: Pick<Aria2Task, 'bittorrent' | 'files' | 'gid'>): string {
  if (task.bittorrent?.info?.name) return task.bittorrent.info.name
  const file = task.files?.[0]
  if (file?.path) {
    return task.files.length > 1 ? `${basename(file.path)} (+${task.files.length - 1})` : basename(file.path)
  }
  const uri = file?.uris?.[0]?.uri
  if (uri) {
    if (uri.startsWith('magnet:')) {
      const dn = new URLSearchParams(uri.slice(uri.indexOf('?') + 1)).get('dn')
      return dn ? `[METADATA] ${dn}` : '[METADATA] Magnet link'
    }
    try {
      const u = new URL(uri)
      return decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || u.host)
    } catch {
      return uri
    }
  }
  return task.gid
}

export function basename(path: string): string {
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || path
}

export function isBitTorrent(task: Pick<Aria2Task, 'bittorrent' | 'infoHash'>) {
  return !!task.bittorrent || !!task.infoHash
}

export function isMetadataTask(task: Aria2Task) {
  return isBitTorrent(task) && !task.bittorrent?.info?.name
}

export function displayStatus(task: Aria2Task): DisplayStatus {
  if (task.status === 'active') {
    if (task.verifyIntegrityPending === 'true') return 'waiting-verify'
    if (task.verifiedLength) return 'verifying'
    if (task.seeder === 'true' && isBitTorrent(task)) return 'seeding'
  }
  return task.status
}

export const statusLabels: Record<DisplayStatus, string> = {
  active: 'Downloading',
  waiting: 'Queued',
  paused: 'Paused',
  error: 'Error',
  complete: 'Completed',
  removed: 'Removed',
  seeding: 'Seeding',
  verifying: 'Verifying',
  'waiting-verify': 'Pending verify',
}

export function progress(task: Pick<Aria2Task, 'completedLength' | 'totalLength'>): number {
  const total = Number(task.totalLength)
  if (!total) return 0
  return Number(task.completedLength) / total
}

export function canPause(task: Aria2Task) {
  return task.status === 'active' || task.status === 'waiting'
}
export function canResume(task: Aria2Task) {
  return task.status === 'paused'
}
export function isStopped(task: Aria2Task) {
  return task.status === 'complete' || task.status === 'error' || task.status === 'removed'
}
export function canRetry(task: Aria2Task) {
  if (!(task.status === 'error' || task.status === 'removed')) return false
  if (isBitTorrent(task)) return false
  return task.files?.some((f) => f.uris?.length > 0) ?? false
}

const errorMessages = data.errorMessages as Record<string, string>
export function errorDescription(task: Aria2Task): string | undefined {
  if (task.status !== 'error') return undefined
  const code = task.errorCode ?? '1'
  const key = (data.errors as Record<string, { descriptionKey: string }>)[code]?.descriptionKey?.replace(/^error\./, '')
  return (key && errorMessages[key]) || task.errorMessage || `Error ${code}`
}

export type FileKind = 'video' | 'audio' | 'picture' | 'document' | 'application' | 'archive' | 'other'

const extensionKind = new Map<string, FileKind>()
for (const [kind, def] of Object.entries(data.fileTypes as Record<string, { extensions: string[] }>)) {
  for (const ext of def.extensions) extensionKind.set(ext.toLowerCase(), kind as FileKind)
}

export function fileKind(name: string): FileKind {
  const dot = name.lastIndexOf('.')
  if (dot === -1) return 'other'
  return extensionKind.get(name.slice(dot).toLowerCase()) ?? 'other'
}

export function taskKind(task: Aria2Task): FileKind | 'torrent' {
  if (task.files?.length === 1 && task.files[0].path) return fileKind(task.files[0].path)
  if (isBitTorrent(task)) return 'torrent'
  return 'other'
}

/** Relative file path inside the task's download directory. */
export function relativePath(task: Pick<Aria2Task, 'dir'>, file: Aria2File): string {
  if (!file.path) return file.uris?.[0]?.uri ?? `File ${file.index}`
  const dir = task.dir?.replace(/[/\\]+$/, '')
  if (dir && file.path.startsWith(dir)) return file.path.slice(dir.length).replace(/^[/\\]+/, '')
  return file.path
}

export interface FileNode {
  name: string
  path: string
  children: FileNode[]
  file?: Aria2File
  length: number
  completedLength: number
}

export function buildFileTree(task: Aria2Task): FileNode {
  const root: FileNode = { name: '', path: '', children: [], length: 0, completedLength: 0 }
  for (const file of task.files ?? []) {
    const parts = relativePath(task, file).split(/[/\\]/)
    let node = root
    parts.forEach((part, i) => {
      const isLeaf = i === parts.length - 1
      let child = isLeaf ? undefined : node.children.find((c) => c.name === part && !c.file)
      if (!child) {
        child = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          children: [],
          length: 0,
          completedLength: 0,
          file: isLeaf ? file : undefined,
        }
        node.children.push(child)
      }
      node = child
    })
  }
  const sum = (n: FileNode): void => {
    if (n.file) {
      n.length = Number(n.file.length)
      n.completedLength = Number(n.file.completedLength)
      return
    }
    n.children.forEach(sum)
    n.children.sort((a, b) => Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name, undefined, { numeric: true }))
    n.length = n.children.reduce((a, c) => a + c.length, 0)
    n.completedLength = n.children.reduce((a, c) => a + c.completedLength, 0)
  }
  sum(root)
  return root
}

export function leafFiles(node: FileNode): Aria2File[] {
  return node.file ? [node.file] : node.children.flatMap(leafFiles)
}

/** Decodes an aria2 hex bitfield into per-piece booleans. */
export function decodeBitfield(bitfield: string | undefined, numPieces: number): boolean[] {
  const pieces = Array.from({ length: numPieces }, () => false)
  if (!bitfield) return pieces
  for (let i = 0; i < bitfield.length; i++) {
    const nibble = parseInt(bitfield[i], 16)
    for (let b = 0; b < 4; b++) {
      const idx = i * 4 + b
      if (idx < numPieces) pieces[idx] = (nibble & (8 >> b)) !== 0
    }
  }
  return pieces
}

export function bitfieldRatio(bitfield: string | undefined, numPieces: number): number {
  if (!numPieces) return 0
  return decodeBitfield(bitfield, numPieces).filter(Boolean).length / numPieces
}

/** Best-effort decode of a BitTorrent peer-id into a client name. */
export function peerClient(peerId: string): string {
  let raw: string
  try {
    raw = decodeURIComponent(peerId)
  } catch {
    raw = peerId
  }
  const azureus = /^-([A-Za-z~]{2})([0-9A-Za-z]{4})-/.exec(raw)
  if (azureus) {
    const clients: Record<string, string> = {
      qB: 'qBittorrent', TR: 'Transmission', UT: 'µTorrent', UM: 'µTorrent Mac', DE: 'Deluge', lt: 'libtorrent',
      LT: 'libtorrent', AZ: 'Vuze', BC: 'BitComet', XL: 'Xunlei', SD: 'Thunder', BI: 'BiglyBT', KT: 'KTorrent',
      RT: 'rTorrent', A2: 'aria2', WW: 'WebTorrent', FD: 'Free Download Manager', TX: 'Tixati', BT: 'BitTorrent',
      FW: 'FrostWire', PI: 'PicoTorrent', LW: 'LimeWire',
    }
    const v = azureus[2]
    const version = /^\d+$/.test(v) ? v.split('').join('.').replace(/(\.0)+$/, '') : v
    return `${clients[azureus[1]] ?? azureus[1]} ${version}`
  }
  if (raw.startsWith('A2-')) return `aria2 ${raw.slice(3).split('-').slice(0, 3).join('.')}`
  if (/^M\d/.test(raw)) return `Mainline ${raw.slice(1, 8).replace(/-+$/, '').replace(/-/g, '.')}`
  return 'Unknown'
}
