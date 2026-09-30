export type TaskStatus = 'active' | 'waiting' | 'paused' | 'error' | 'complete' | 'removed'

export interface Aria2Uri {
  uri: string
  status: 'used' | 'waiting'
}

export interface Aria2File {
  index: string
  path: string
  length: string
  completedLength: string
  selected: 'true' | 'false'
  uris: Aria2Uri[]
}

export interface Aria2BitTorrent {
  announceList?: string[][]
  comment?: string
  creationDate?: number
  mode?: 'single' | 'multi'
  info?: { name: string }
}

export interface Aria2Task {
  gid: string
  status: TaskStatus
  totalLength: string
  completedLength: string
  uploadLength: string
  bitfield?: string
  downloadSpeed: string
  uploadSpeed: string
  infoHash?: string
  numSeeders?: string
  seeder?: 'true' | 'false'
  pieceLength?: string
  numPieces?: string
  connections: string
  errorCode?: string
  errorMessage?: string
  followedBy?: string[]
  following?: string
  belongsTo?: string
  dir: string
  files: Aria2File[]
  bittorrent?: Aria2BitTorrent
  verifiedLength?: string
  verifyIntegrityPending?: 'true'
}

export interface Aria2Peer {
  peerId: string
  ip: string
  port: string
  bitfield: string
  amChoking: 'true' | 'false'
  peerChoking: 'true' | 'false'
  downloadSpeed: string
  uploadSpeed: string
  seeder: 'true' | 'false'
}

export interface Aria2Server {
  index: string
  servers: { uri: string; currentUri: string; downloadSpeed: string }[]
}

export interface Aria2GlobalStat {
  downloadSpeed: string
  uploadSpeed: string
  numActive: string
  numWaiting: string
  numStopped: string
  numStoppedTotal: string
}

export interface Aria2Version {
  version: string
  enabledFeatures: string[]
}

export type Aria2Options = Record<string, string>

export type TaskListKind = 'active' | 'waiting' | 'stopped'
