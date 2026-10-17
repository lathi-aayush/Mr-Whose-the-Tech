import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from 'cn'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatPrice, timeAgo, typeLabel } from '@/lib/constants'
import { AttrIcon, CategoryArt, EXCHANGE_META, StatusBadge } from './common'

const PRICE_TONE = { sell: 'text-foreground', swap: 'text-grape-700', free: 'text-brand-700' }

// "Ananya Sharma" -> "Ananya S."; keeps the seller line one row on narrow cards.
const shortName = (name = '') => {
  const [first, ...rest] = name.trim().split(/\s+/)
  return rest.length ? `${first} ${rest.at(-1)[0]}.` : first || 'Student'
}

// Image with type tag, title, price + condition, seller line. Fixed heights keep every card equal.
export function ListingCard({ listing }) {
  const [imgFailed, setImgFailed] = useState(false)
  const cover = listing.image_urls?.[0]
  const gone = listing.status === 'Completed'
  const exchange = EXCHANGE_META[listing.listing_type]

  return (
    <Card className="fade-in group relative gap-0 overflow-hidden rounded-2xl p-2 transition hover:-translate-y-0.5 hover:shadow-lg has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
      <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-muted ring-1 ring-black/5 ring-inset">
        {cover && !imgFailed ? (
          <img
            src={cover}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
            className={cn('size-full object-cover transition duration-300 group-hover:scale-[1.03]', gone && 'grayscale')}
          />
        ) : (
          <CategoryArt category={listing.category} className="size-full" />
        )}
        <span className={cn('absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold shadow-sm', exchange?.tone)}>
          <AttrIcon inline meta={exchange} />
          {typeLabel(listing.listing_type)}
        </span>
        {listing.status !== 'Available' && <StatusBadge status={listing.status} className="absolute top-2 right-2 z-10" />}
      </div>
      <div className="flex flex-col gap-1 px-1.5 pt-2.5 pb-1">
        <h3 className="truncate text-sm leading-6 font-semibold" title={listing.title}>
          {/* Stretched link: the whole card is clickable, the badge tooltip still works. */}
          <Link to={`/listings/${listing.ROWID}`} className="outline-none after:absolute after:inset-0">{listing.title}</Link>
        </h3>
        <div className="flex h-7 items-baseline gap-2">
          {/* Price never truncates (max ₹1,00,000); the condition gives way on narrow 2-column phones. */}
          <p className={cn('shrink-0 text-base leading-7 font-bold tabular-nums sm:text-lg', PRICE_TONE[listing.listing_type])}>{formatPrice(listing)}</p>
          <span className="min-w-0 truncate text-xs text-muted-foreground sm:text-sm" title={listing.item_condition}>{listing.item_condition}</span>
        </div>
        <div className="mt-1 flex h-6 items-center gap-2 text-xs text-muted-foreground">
          <Avatar className="size-6">
            <AvatarFallback className="bg-grape-500 text-[11px] font-semibold text-white">{shortName(listing.seller_name)[0]}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 truncate font-medium text-foreground">{shortName(listing.seller_name)}</span>
          <span aria-hidden="true">•</span>
          <span className="shrink-0">{timeAgo(listing.CREATEDTIME)}</span>
        </div>
      </div>
    </Card>
  )
}

// Same geometry as ListingCard so nothing shifts when data arrives.
export function ListingCardSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden rounded-2xl p-2">
      <Skeleton className="aspect-[16/10] rounded-xl" />
      <div className="flex flex-col gap-1 px-1.5 pt-2.5 pb-1">
        <div className="flex h-6 items-center"><Skeleton className="h-4 w-4/5" /></div>
        <div className="flex h-7 items-center"><Skeleton className="h-5 w-24" /></div>
        <div className="mt-1 flex h-6 items-center gap-2">
          <Skeleton className="size-6 rounded-full" />
          <Skeleton className="h-3.5 w-28" />
        </div>
      </div>
    </Card>
  )
}
