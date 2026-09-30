import { Archive, AppWindow, File, FileText, Film, Image, Magnet, Music } from 'lucide-react'
import type { FileKind } from '@/lib/aria2/task'
import { cn } from '@/lib/cn'

const icons = {
  video: Film,
  audio: Music,
  picture: Image,
  document: FileText,
  application: AppWindow,
  archive: Archive,
  torrent: Magnet,
  other: File,
}

export function KindIcon({ kind, className }: { kind: FileKind | 'torrent'; className?: string }) {
  const Icon = icons[kind]
  return (
    <div
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-[10px] border border-line bg-surface-2 text-fg-muted [&_svg]:size-[17px]',
        className,
      )}
    >
      <Icon strokeWidth={1.75} />
    </div>
  )
}
