import { useSyncExternalStore } from 'react'
import type { Aria2Task } from './types'

/*
 * Steady "time remaining" for active downloads.
 *
 * The raw estimate (remaining bytes / current speed) jumps around with every speed sample. Instead:
 * - the estimate uses a time-based moving average of the speed, which removes most of the noise, and
 * - the number on screen counts down on its own, one second per second. A new estimate only replaces it
 *   when the two are clearly apart. Showing too much time is tolerated more than showing too little,
 *   since finishing early is fine and finishing late is not.
 */

/** Smoothing time constant for the speed average. */
const SPEED_TAU_S = 10
/** Speed has to stay at zero this long before the task counts as stalled. */
const STALL_AFTER_MS = 5000
/** The average needs a few samples to settle, so the countdown follows it freely at first. */
const WARMUP_MS = 5000

/** How far below the countdown the estimate can drop before the countdown jumps down to it. */
export const downThreshold = (shown: number) => Math.max(Math.min(120, shown * 0.5), shown * 0.1)
/** How far above the countdown the estimate can rise before the countdown jumps up to it. */
export const upThreshold = (shown: number) => Math.max(Math.min(60, shown * 0.25), shown * 0.1)

interface State {
  /** When the speed average (re)started. List and detail poll separately, the time weighting absorbs repeats. */
  startedAt: number
  sampleAt: number
  speed: number
  zeroSince: number | null
  /** The countdown showed `shown` seconds at time `shownAt`. */
  shown: number | null
  shownAt: number
}

const states = new Map<string, State>()

/** Seconds left on the countdown at `now`, or undefined while there is no estimate (stalled, just started). */
function current(s: State, now: number): number | undefined {
  if (s.shown === null) return undefined
  return Math.max(0, s.shown - (now - s.shownAt) / 1000)
}

function observe(key: string, task: Aria2Task, now: number) {
  const done = Number(task.completedLength)
  const total = Number(task.totalLength)
  const speed = Number(task.downloadSpeed)
  if (task.status !== 'active' || !total || done >= total) {
    states.delete(key)
    return
  }

  let s = states.get(key)
  if (!s) {
    s = { startedAt: now, sampleAt: now, speed, zeroSince: null, shown: null, shownAt: now }
    states.set(key, s)
  } else {
    const dt = Math.max(0, (now - s.sampleAt) / 1000)
    if (s.speed === 0 && speed > 0) {
      // After a stall the average restarts from the live speed instead of climbing up from zero.
      s.speed = speed
      s.startedAt = now
    } else {
      s.speed += (speed - s.speed) * (1 - Math.exp(-dt / SPEED_TAU_S))
    }
    s.sampleAt = now
  }

  if (speed === 0) {
    s.zeroSince ??= now
    if (now - s.zeroSince >= STALL_AFTER_MS) {
      // Start fresh once it moves again instead of averaging in the dead time.
      s.speed = 0
      s.shown = null
    }
    // A short drop to zero is common (BitTorrent especially). Keep counting rather than jumping up.
    return
  }
  s.zeroSince = null
  if (s.speed <= 0) return

  const estimate = (total - done) / s.speed
  const shown = current(s, now)
  const jump =
    shown === undefined ||
    shown <= 0 ||
    now - s.startedAt < WARMUP_MS ||
    (estimate < shown && shown - estimate > downThreshold(shown)) ||
    (estimate > shown && estimate - shown > upThreshold(shown))
  if (jump) {
    s.shown = estimate
    s.shownAt = now
  }
}

/** Feeds freshly fetched tasks into the countdowns. `scope` separates servers, since gids are per server. */
export function observeTasks(scope: string, tasks: Aria2Task[], now = Date.now()) {
  for (const t of tasks) observe(`${scope}:${t.gid}`, t, now)
}

/** Countdown value right now, without subscribing to the ticker (for sorting). */
export function remainingNow(scope: string, gid: string): number | undefined {
  const s = states.get(`${scope}:${gid}`)
  return s ? current(s, Date.now()) : undefined
}

// One shared 1s ticker, running only while something displays a countdown.
const tickListeners = new Set<() => void>()
let tickTimer: ReturnType<typeof setInterval> | undefined
let tickNow = Date.now()

function subscribeTick(listener: () => void) {
  tickListeners.add(listener)
  if (!tickTimer) {
    tickTimer = setInterval(() => {
      tickNow = Date.now()
      for (const l of tickListeners) l()
    }, 1000)
  }
  return () => {
    tickListeners.delete(listener)
    if (tickListeners.size === 0) {
      clearInterval(tickTimer)
      tickTimer = undefined
    }
  }
}

/** Seconds remaining for a task, re-rendering every second. Undefined means no estimate yet or stalled. */
export function useRemaining(scope: string, gid: string): number | undefined {
  const now = useSyncExternalStore(subscribeTick, () => tickNow)
  const s = states.get(`${scope}:${gid}`)
  return s ? current(s, Math.max(now, s.sampleAt)) : undefined
}
