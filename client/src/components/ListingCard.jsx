import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from 'cn'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatPrice, timeAgo } from '@/lib/constants'
import { AttrIcon, CONDITION_META, CategoryArt, StatusBadge } from './common'

// Price-first card, the order OLX and Marketplace users scan in.
export function ListingCard({ listing }) {
  const [imgFailed, setImgFailed] = useState(false)
  const cover = listing.image_urls?.[0]
  const gone = listing.status === 'Completed'

  return (
    <Card className="fade-in group relative gap-0 overflow-hidden py-0 transition hover:-translate-y-0.5 hover:shadow-lg has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
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
        {listing.status !== 'Available' && <StatusBadge status={listing.status} className="absolute left-2 top-2 z-10" />}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <p className={cn('text-lg font-bold leading-tight', listing.listing_type !== 'sell' && 'text-brand-700')}>{formatPrice(listing)}</p>
        <h3 className="mt-1 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground" title={listing.title}>
          {/* Stretched link: the whole card is clickable, the badge tooltip still works. */}
          <Link to={`/listings/${listing.ROWID}`} className="outline-none after:absolute after:inset-0">{listing.title}</Link>
        </h3>
        <p className="mt-auto flex items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1">
            <AttrIcon inline meta={CONDITION_META[listing.item_condition]} />
            <span className="truncate">{listing.item_condition}</span>
          </span>
          <span className="shrink-0">{timeAgo(listing.CREATEDTIME)}</span>
        </p>
      </div>
    </Card>
  )
}

// Same geometry as ListingCard so nothing shifts when data arrives.
export function ListingCardSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="flex flex-1 flex-col p-3">
        <Skeleton className="h-[22px] w-16" />
        <Skeleton className="mt-1 h-4 w-full" />
        <Skeleton className="mt-1 h-4 w-2/3" />
        <div className="mt-auto flex justify-between pt-2">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-10" />
        </div>
      </div>
    </Card>
  )
}
