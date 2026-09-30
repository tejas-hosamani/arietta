import { DropdownMenu as Menu } from 'radix-ui'
import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger
export const DropdownMenuGroup = Menu.Group
export const DropdownMenuRadioGroup = Menu.RadioGroup

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-44 animate-in overflow-hidden rounded-xl border border-line bg-surface p-1 text-sm shadow-panel',
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  )
}

const itemClass =
  'relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-fg outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:text-fg-muted'

export function DropdownMenuItem({
  className,
  danger,
  ...props
}: React.ComponentProps<typeof Menu.Item> & { danger?: boolean }) {
  return (
    <Menu.Item
      className={cn(itemClass, danger && 'text-danger data-[highlighted]:bg-danger-soft [&_svg]:text-danger', className)}
      {...props}
    />
  )
}

export function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem className={cn(itemClass, 'pr-7', className)} {...props}>
      {children}
      <Menu.ItemIndicator className="absolute right-2">
        <Check className="!text-accent" />
      </Menu.ItemIndicator>
    </Menu.RadioItem>
  )
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof Menu.Label>) {
  return <Menu.Label className={cn('eyebrow px-2 pb-1 pt-2', className)} {...props} />
}

export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn('-mx-1 my-1 h-px bg-line', className)} {...props} />
}
