import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPrice, timeAgo } from '../lib/constants'
import { CategoryArt, Skeleton, StatusBadge } from './ui'

export function ListingCard({ listing }) {
  const [imgFailed, setImgFailed] = useState(false)
  const cover = listing.image_urls?.[0]

  return (
    <Link
      to={`/listings/${listing.ROWID}`}
      className="fade-in group flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-600"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        {cover && !imgFailed ? (
          <img src={cover} alt={listing.title} loading="lazy" onError={() => setImgFailed(true)} className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
        ) : (
          <CategoryArt category={listing.category} className="h-full w-full" />
        )}
        <div className="absolute left-2 top-2">
          <StatusBadge status={listing.status} />
        </div>
        {listing.spin_url && (
          <span className="absolute right-2 top-2 rounded-full bg-stone-900/80 px-2 py-0.5 text-xs font-medium text-white">360°</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-medium text-stone-900" title={listing.title}>{listing.title}</h3>
          <span className="shrink-0 font-semibold text-brand-700">{formatPrice(listing)}</span>
        </div>
        <p className="text-xs text-stone-500">
          {listing.item_condition} · {listing.category}
        </p>
        <p className="mt-auto pt-2 text-xs text-stone-400">
          {listing.seller_name} · {timeAgo(listing.CREATEDTIME)}
        </p>
      </div>
    </Link>
  )
}

// Same geometry as ListingCard so nothing shifts when data arrives.
export function ListingCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex justify-between gap-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-6 w-12" />
        </div>
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-2 h-4 w-1/3" />
      </div>
    </div>
  )
}
