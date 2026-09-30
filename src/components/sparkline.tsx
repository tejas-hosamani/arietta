import { useId } from 'react'

/** Dual-series area sparkline for download (accent) and upload (cyan) speed. */
export function SpeedSparkline({
  data,
  height = 56,
  className,
}: {
  data: { down: number; up: number }[]
  height?: number
  className?: string
}) {
  const id = useId()
  const width = 200
  const points = data.length < 2 ? [...Array(2 - data.length).fill({ down: 0, up: 0 }), ...data] : data
  const max = Math.max(1, ...points.map((p) => Math.max(p.down, p.up))) * 1.15
  const step = width / (points.length - 1)
  const path = (key: 'down' | 'up') =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(height - (p[key] / max) * height).toFixed(1)}`).join(' ')
  const area = (key: 'down' | 'up') => `${path(key)} L${width},${height} L0,${height} Z`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-d`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-u`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--up)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--up)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area('up')} fill={`url(#${id}-u)`} />
      <path d={path('up')} fill="none" stroke="var(--up)" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
      <path d={area('down')} fill={`url(#${id}-d)`} />
      <path d={path('down')} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
