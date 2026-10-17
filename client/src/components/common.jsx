import {
  ArrowLeftRightIcon, BadgeCheckIcon, BedDoubleIcon, BookOpenIcon, CalculatorIcon, FlaskConicalIcon, GiftIcon, IndianRupeeIcon,
  PackageIcon, PencilLineIcon, RotateCwIcon, SparklesIcon, ThumbsUpIcon, TriangleAlertIcon,
} from 'lucide-react'
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
  Accepted: 'Seller accepted; chat and contact details unlocked',
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

// Full class strings (not built from parts) so Tailwind's scanner keeps them. Icons sit at -700 on -50
// for 3:1+ contrast. Condition runs green to amber as use increases.
export const CONDITION_META = {
  New: { icon: SparklesIcon, tone: 'bg-emerald-50 text-emerald-700', hint: 'Unused, as it came from the shop' },
  'Once used': { icon: BadgeCheckIcon, tone: 'bg-lime-50 text-lime-700', hint: 'Used one time, no visible wear' },
  'Used more than once': { icon: ThumbsUpIcon, tone: 'bg-amber-50 text-amber-700', hint: 'Used regularly, works fully' },
}
export const EXCHANGE_META = {
  sell: { icon: IndianRupeeIcon, tone: 'bg-blue-50 text-ink-900', hint: 'Pay the seller the listed price' },
  swap: { icon: ArrowLeftRightIcon, tone: 'bg-grape-50 text-grape-700', hint: 'Trade something of yours for it' },
  free: { icon: GiftIcon, tone: 'bg-rose-50 text-rose-700', hint: 'Given away at no cost' },
}
export const CATEGORY_META = {
  Books: { icon: BookOpenIcon, tone: 'bg-sky-50 text-sky-700' },
  'Calculators & Electronics': { icon: CalculatorIcon, tone: 'bg-indigo-50 text-indigo-700' },
  'Lab Supplies': { icon: FlaskConicalIcon, tone: 'bg-teal-50 text-teal-700' },
  Stationery: { icon: PencilLineIcon, tone: 'bg-fuchsia-50 text-fuchsia-700' },
  'Hostel Essentials': { icon: BedDoubleIcon, tone: 'bg-cyan-50 text-cyan-700' },
  Other: { icon: PackageIcon, tone: 'bg-slate-100 text-slate-700' },
}
const FALLBACK_META = CATEGORY_META.Other

// Rounded colored tile holding a listing attribute's icon; `inline` drops the tile for dense rows.
export function AttrIcon({ meta = FALLBACK_META, inline = false, className }) {
  const Icon = meta.icon
  if (inline) return <Icon aria-hidden="true" className={cn('size-3.5 shrink-0 bg-transparent', meta.tone, className)} />
  return (
    <span aria-hidden="true" className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-current/15 ring-inset', meta.tone, className)}>
      <Icon className="size-[18px]" />
    </span>
  )
}

// Placeholder when a listing has no photo or the image fails; tinted per category.
export function CategoryArt({ category, className }) {
  const { icon: Icon, tone } = CATEGORY_META[category] ?? FALLBACK_META
  return (
    <div className={cn('flex items-center justify-center bg-gradient-to-br from-white/0 to-white/70', tone, className)}>
      <Icon className="size-12 opacity-45" strokeWidth={1.5} aria-hidden="true" />
    </div>
  )
}
