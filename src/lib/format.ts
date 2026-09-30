const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

export function formatBytes(value: number | string | undefined, digits = 1): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const exp = Math.min(Math.floor(Math.log(n) / Math.log(1024)), UNITS.length - 1)
  const v = n / 1024 ** exp
  return `${exp === 0 ? v.toFixed(0) : v.toFixed(v >= 100 ? 0 : digits)} ${UNITS[exp]}`
}

export function formatSpeed(value: number | string | undefined): string {
  return `${formatBytes(value)}/s`
}

/** Splits a byte count into number and unit, for typography that styles them differently. */
export function bytesParts(value: number | string | undefined): [string, string] {
  const [num, unit] = formatBytes(value).split(' ')
  return [num, unit]
}

export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '∞'
  const s = Math.floor(seconds)
  if (s < 60) return `${s}s`
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${sec.toString().padStart(2, '0')}s`
}

export function formatPercent(ratio: number, digits = 1): string {
  if (!Number.isFinite(ratio)) return '0%'
  const pct = Math.max(0, Math.min(100, ratio * 100))
  return `${pct >= 100 ? 100 : pct.toFixed(digits)}%`
}

export function formatDate(epochSeconds: number | undefined): string {
  if (!epochSeconds) return '-'
  return new Date(epochSeconds * 1000).toLocaleString()
}

/** Parses aria2 size strings like "10M", "512K" or plain byte counts into bytes. */
export function parseSize(value: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*([KkMmGg]?)$/.exec(value.trim())
  if (!m) return NaN
  const mult = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 }[m[2].toLowerCase() as '' | 'k' | 'm' | 'g']
  return Math.round(Number(m[1]) * mult)
}
