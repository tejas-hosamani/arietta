import data from './data.json'

export interface OptionDef {
  key: string
  name: string
  description: string
  type: 'string' | 'integer' | 'float' | 'text' | 'boolean' | 'option'
  suffix?: string
  readonly?: boolean
  defaultValue?: string
  required?: boolean
  separator?: string
  overrideMode?: 'override' | 'append'
  submitFormat?: 'string' | 'array'
  showCount?: boolean
  options?: string[]
  min?: number
  max?: number
  pattern?: string
  since?: string
}

type RawDef = Omit<OptionDef, 'key' | 'name' | 'description'>

const raw = data.allOptions as unknown as Record<string, RawDef>
const labels = data.optionLabels as Record<string, string>
const valueLabels = data.optionValueLabels as Record<string, string>

export function optionDef(key: string): OptionDef {
  const def = raw[key] ?? { type: 'string' }
  return {
    ...def,
    key,
    name: labels[`${key}.name`] ?? key,
    description: labels[`${key}.description`] ?? '',
  }
}

export function optionValueLabel(value: string) {
  return valueLabels[value] ?? value
}

export const globalOptionGroups: { id: string; label: string; keys: string[] }[] = [
  { id: 'basic', label: 'Basic', keys: data.globalGroups.basicOptions },
  { id: 'http-ftp', label: 'HTTP / FTP / SFTP', keys: data.globalGroups.httpFtpSFtpOptions },
  { id: 'http', label: 'HTTP', keys: data.globalGroups.httpOptions },
  { id: 'ftp', label: 'FTP / SFTP', keys: data.globalGroups.ftpSFtpOptions },
  { id: 'bt', label: 'BitTorrent', keys: data.globalGroups.btOptions },
  { id: 'metalink', label: 'Metalink', keys: data.globalGroups.metalinkOptions },
  { id: 'rpc', label: 'RPC', keys: data.globalGroups.rpcOptions },
  { id: 'advanced', label: 'Advanced', keys: data.globalGroups.advancedOptions },
]

interface TaskOptionEntry {
  key: string
  category: 'global' | 'http' | 'bittorrent'
  canShow?: string
  canUpdate?: string
  showHistory?: boolean
}

const taskOptions = data.taskOptions as TaskOptionEntry[]

export type TaskOptionContext = 'new' | 'active' | 'waiting' | 'paused'

export function taskOptionKeys(context: TaskOptionContext, isBitTorrent: boolean) {
  return taskOptions
    .filter((o) => !o.canShow || o.canShow.split('|').includes(context))
    .filter((o) => context === 'new' || isBitTorrent || o.category !== 'bittorrent')
    .map((o) => ({
      key: o.key,
      category: o.category,
      readonly: !!o.canUpdate && !o.canUpdate.split('|').includes(context),
      showHistory: !!o.showHistory,
    }))
}

/** Converts a value from an editor into the form aria2 expects. */
export function serializeOption(def: OptionDef, value: string): string | string[] {
  if (def.type === 'text' && def.separator) {
    const splitter = def.separator === '\n' ? /\r?\n/ : new RegExp(`\\r?\\n|${def.separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    const parts = value
      .split(splitter)
      .map((p) => p.trim())
      .filter(Boolean)
    return def.submitFormat === 'array' ? parts : parts.join(def.separator)
  }
  return value
}

/** Converts an aria2 value into editor text. */
export function deserializeOption(def: OptionDef, value: string | undefined): string {
  if (value === undefined) return ''
  if (def.type === 'text' && def.separator && def.separator !== '\n') return value.split(def.separator).join('\n')
  return value
}

export function validateOption(def: OptionDef, value: string): string | null {
  if (value === '') return def.required ? 'Required' : null
  if (def.type === 'integer' || def.type === 'float') {
    const n = def.type === 'integer' ? Number.parseInt(value, 10) : Number.parseFloat(value)
    if (!/^-?\d+(\.\d+)?$/.test(value) || Number.isNaN(n)) return 'Must be a number'
    if (def.type === 'integer' && !Number.isInteger(Number(value))) return 'Must be an integer'
    if (def.min !== undefined && n < def.min) return `Minimum is ${def.min}`
    if (def.max !== undefined && n > def.max) return `Maximum is ${def.max}`
  }
  if (def.pattern && !new RegExp(def.pattern).test(value)) return 'Invalid format'
  return null
}
