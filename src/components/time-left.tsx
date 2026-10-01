import { useAria2 } from '@/lib/aria2/client-context'
import { useRemaining } from '@/lib/aria2/countdown'
import { formatDuration } from '@/lib/format'

/** Steady countdown for an active download, re-rendering itself every second. */
export function TimeLeft({ gid, suffix }: { gid: string; suffix: string }) {
  const { client } = useAria2()
  const seconds = useRemaining(client.profile.id, gid)
  return <>{seconds === undefined ? 'Stalled' : `${formatDuration(seconds)} ${suffix}`}</>
}
