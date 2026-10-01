import { useState, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { copyText } from '@/lib/clipboard'
import { cn } from '@/lib/cn'

/** Click to copy. The icon shows on hover where there is hover, and always on touch screens. */
export function CopyValue({ value, children, truncate }: { value: string; children?: ReactNode; truncate?: boolean }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="group inline-flex max-w-full cursor-pointer items-center gap-1.5 text-left"
      title={truncate ? value : undefined}
      onClick={async () => {
        if (await copyText(value)) {
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        } else {
          toast.error('Could not copy. Select and copy it manually:', { description: value })
        }
      }}
    >
      <span className={cn('min-w-0', truncate ? 'truncate' : 'break-all')}>{children ?? value}</span>
      {copied ? (
        <Check className="size-3 shrink-0 text-ok" />
      ) : (
        <Copy className="size-3 shrink-0 text-fg-faint [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-visible:opacity-100" />
      )}
    </button>
  )
}
