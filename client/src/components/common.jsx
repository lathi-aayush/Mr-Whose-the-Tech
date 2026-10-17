import { BedDoubleIcon, BookOpenIcon, CalculatorIcon, FlaskConicalIcon, PackageIcon, PencilLineIcon, RotateCwIcon, TriangleAlertIcon } from 'lucide-react'
import { cn } from 'cn'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// Icon-only actions always get a tooltip (hover + focus, Esc closes; Radix wires aria-describedby).
export function IconButton({ label, shortcut, children, variant = 'ghost', size = 'icon', ...props }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant={variant} size={size} aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && <kbd className="rounded bg-background/20 px-1 font-mono text-[10px]">{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  )
}

const STATUS_VARIANT = {
  Available: 'available',
  Reserved: 'reserved',
  Completed: 'completed',
  Pending: 'pending',
  Accepted: 'available',
  Declined: 'declined',
}
const STATUS_HELP = {
  Available: 'Open for requests',
  Reserved: 'Seller accepted a request; handover pending',
  Completed: 'Exchange done; no longer available',
  Pending: 'Waiting for the seller to respond',
  Accepted: 'Seller accepted; contact details unlocked',
  Declined: 'Seller declined or the item went to someone else',
}

export function StatusBadge({ status, className }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge tabIndex={0} variant={STATUS_VARIANT[status] ?? 'secondary'} className={className}>{status}</Badge>
      </TooltipTrigger>
      <TooltipContent>{STATUS_HELP[status] ?? status}</TooltipContent>
    </Tooltip>
  )
}

export function ErrorState({ message, onRetry, className }) {
  return (
    <Empty role="alert" className={cn('border border-destructive/25 bg-card', className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-destructive/10 text-destructive">
          <TriangleAlertIcon />
        </EmptyMedia>
        <EmptyTitle>Something went wrong</EmptyTitle>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      {onRetry && (
        <EmptyContent>
          <Button variant="outline" onClick={onRetry}>
            <RotateCwIcon data-icon="inline-start" />
            Try again
          </Button>
        </EmptyContent>
      )}
    </Empty>
  )
}

const CATEGORY_ICON = {
  Books: BookOpenIcon,
  'Calculators & Electronics': CalculatorIcon,
  'Lab Supplies': FlaskConicalIcon,
  Stationery: PencilLineIcon,
  'Hostel Essentials': BedDoubleIcon,
  Other: PackageIcon,
}

// Placeholder when a listing has no photo or the image fails.
export function CategoryArt({ category, className }) {
  const Icon = CATEGORY_ICON[category] ?? PackageIcon
  return (
    <div className={cn('flex items-center justify-center bg-gradient-to-br from-brand-50 to-secondary', className)}>
      <Icon className="size-12 text-brand-700/50" strokeWidth={1.5} aria-hidden="true" />
    </div>
  )
}
