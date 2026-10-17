import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarClockIcon, CheckIcon, CircleCheckIcon, InfoIcon } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AttrIcon, CATEGORY_META, CONDITION_META, CategoryArt, EXCHANGE_META, ErrorState, StatusBadge } from '@/components/common'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatPrice, timeAgo, typeLabel } from '@/lib/constants'
import { cn } from '@/lib/utils'

// Owner-side moves only. Available -> Reserved happens by accepting an inquiry.
const OWNER_ACTIONS = {
  Available: [{ to: 'Completed', label: 'Mark as completed' }],
  Reserved: [
    { to: 'Completed', label: 'Handover done: mark completed' },
    { to: 'Available', label: 'Deal fell through: make available' },
  ],
  Completed: [],
}
const OFFER_CHOICES = { sell: 'Buy it', swap: 'Swap for something', free: 'Take it for free' }

export default function ListingDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: null, data: null })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      setState({ loading: false, error: null, data: await api(`/listings/${id}`) })
    } catch (e) {
      setState({ loading: false, error: e.message, data: null })
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load, user])

  if (state.loading && !state.data) return <DetailSkeleton />
  if (state.error) return <ErrorState message={state.error} onRetry={load} className="min-h-96" />

  const { listing, isOwner } = state.data
  const similar = `/?category=${encodeURIComponent(listing.category)}`

  return (
    <div className="fade-in">
      <Breadcrumb className="mb-4">
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="shrink-0">
            <BreadcrumbLink asChild><Link to="/">All items</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="shrink-0">
            <BreadcrumbLink asChild><Link to={similar}>{listing.category}</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate" title={listing.title}>{listing.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-10">
        <div className="flex min-w-0 flex-col gap-6">
          <Gallery images={listing.image_urls ?? []} listing={listing} />

          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              {listing.description ? (
                <p className="whitespace-pre-line text-base leading-relaxed">{listing.description}</p>
              ) : (
                <p className="text-muted-foreground">No description. Ask the seller in your request.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={listing.status} />
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <AttrIcon inline meta={CONDITION_META[listing.item_condition]} />
                    {listing.item_condition}
                    <span aria-hidden="true">·</span>
                    <AttrIcon inline meta={EXCHANGE_META[listing.listing_type]} />
                    {typeLabel(listing.listing_type)}
                  </span>
                </div>
                <h1 className="text-xl font-semibold leading-snug sm:text-2xl">{listing.title}</h1>
                <p className={cn('text-3xl font-bold', listing.listing_type !== 'sell' && 'text-brand-700')}>{formatPrice(listing)}</p>
              </div>

              <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                <Avatar size="lg">
                  <AvatarFallback className="bg-grape-500 font-semibold text-white">{listing.seller_name?.[0]?.toUpperCase() ?? '?'}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-semibold" title={listing.seller_name}>{listing.seller_name}</p>
                  <p className="text-xs text-muted-foreground">Campus member · contact shared once you're accepted</p>
                </div>
              </div>

              {isOwner ? (
                <OwnerPanel listing={listing} onChanged={load} />
              ) : !user ? (
                <div className="flex flex-col gap-2">
                  <Button size="lg" asChild className="w-full">
                    <Link to={`/login?next=/listings/${listing.ROWID}`}>Sign in to send a request</Link>
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">Free account, takes a minute.</p>
                </div>
              ) : listing.status === 'Available' ? (
                <InquiryForm listing={listing} />
              ) : (
                <Alert>
                  <InfoIcon />
                  <AlertTitle>Not taking requests</AlertTitle>
                  <AlertDescription>
                    <p>
                      This item is {listing.status.toLowerCase()}.{' '}
                      <Link to={similar} className="font-semibold text-brand-700 underline-offset-4 hover:underline">See similar items</Link>
                    </p>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <ul className="flex flex-col gap-1.5 px-1 text-xs text-muted-foreground">
            <li className="flex gap-1.5"><CheckIcon className="size-3.5 shrink-0 text-brand-700" aria-hidden="true" />Meet in a public spot on campus, like the library or canteen.</li>
            <li className="flex gap-1.5"><CheckIcon className="size-3.5 shrink-0 text-brand-700" aria-hidden="true" />Check the item before you pay or swap.</li>
          </ul>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Detail term="Condition" value={listing.item_condition} meta={CONDITION_META[listing.item_condition]} hint={CONDITION_META[listing.item_condition]?.hint} />
                <Detail term="Exchange" value={typeLabel(listing.listing_type)} meta={EXCHANGE_META[listing.listing_type]} hint={EXCHANGE_META[listing.listing_type]?.hint} />
                <Detail term="Category" value={listing.category} meta={CATEGORY_META[listing.category]} />
                <Detail term="Listed" value={timeAgo(listing.CREATEDTIME)} meta={LISTED_META} />
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}

const LISTED_META = { icon: CalendarClockIcon, tone: 'bg-muted text-muted-foreground' }

function Detail({ term, value, meta, hint }) {
  return (
    <div className="flex items-start gap-3">
      <AttrIcon meta={meta} />
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{term}</dt>
        <dd className="font-medium leading-5">{value}</dd>
        {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
      </div>
    </div>
  )
}

// Swipe on phones (scroll-snap), thumbnails on desktop.
function Gallery({ images, listing }) {
  const [active, setActive] = useState(0)
  const trackRef = useRef(null)

  function show(i) {
    setActive(i)
    const track = trackRef.current
    if (track) track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' })
  }

  if (images.length === 0) {
    return <CategoryArt category={listing.category} className="aspect-[4/3] w-full rounded-xl ring-1 ring-foreground/10" />
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div
          ref={trackRef}
          onScroll={(e) => setActive(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          className="flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
        >
          {images.map((src, i) => (
            <img key={src} src={src} alt={`${listing.title}, photo ${i + 1} of ${images.length}`} className="size-full shrink-0 snap-center object-contain" />
          ))}
        </div>
        {images.length > 1 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-ink-900/75 px-2.5 py-1 text-xs font-medium text-white" aria-hidden="true">
            {active + 1} / {images.length}
          </span>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => show(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-pressed={i === active}
              className={cn(
                'size-16 shrink-0 overflow-hidden rounded-lg border-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:size-20',
                i === active ? 'border-brand-500' : 'border-transparent opacity-70 hover:opacity-100',
              )}
            >
              <img src={src} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function OwnerPanel({ listing, onChanged }) {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  async function change(to) {
    setBusy(to)
    setError(null)
    try {
      await api(`/listings/${listing.ROWID}/status`, { method: 'PATCH', body: { status: to } })
      await onChanged()
      toast.success(`Marked as ${to.toLowerCase()}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const actions = OWNER_ACTIONS[listing.status] ?? []
  return (
    <div className="flex flex-col gap-3">
      <Alert className="border-brand-500/30 bg-brand-50 text-brand-900">
        <InfoIcon />
        <AlertTitle>This is your listing</AlertTitle>
        <AlertDescription className="text-brand-900/90">
          {listing.status === 'Available'
            ? 'Accept a request from My stuff to reserve it for that buyer.'
            : listing.status === 'Reserved'
              ? 'Reserved for the buyer you accepted.'
              : 'This exchange is complete. Thanks for reusing!'}
        </AlertDescription>
      </Alert>
      <div className="flex flex-col gap-2">
        {actions.map((a) => (
          <Button key={a.to} size="lg" variant={a.to === 'Completed' ? 'default' : 'outline'} disabled={!!busy} onClick={() => change(a.to)} className="w-full">
            {busy === a.to && <Spinner data-icon="inline-start" />}
            {busy === a.to ? 'Saving…' : a.label}
          </Button>
        ))}
        <Button size="lg" variant="outline" asChild className="w-full">
          <Link to="/dashboard?tab=received">View requests</Link>
        </Button>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}

function InquiryForm({ listing }) {
  const [message, setMessage] = useState('')
  const [offerType, setOfferType] = useState(listing.listing_type)
  const [status, setStatus] = useState({ busy: false, error: null, sent: false })

  async function submit(e) {
    e.preventDefault()
    setStatus({ busy: true, error: null, sent: false })
    try {
      await api(`/listings/${listing.ROWID}/inquiries`, { method: 'POST', body: { message, offer_type: offerType } })
      setStatus({ busy: false, error: null, sent: true })
      toast.success('Request sent')
    } catch (err) {
      setStatus({ busy: false, error: err.message, sent: false })
    }
  }

  if (status.sent) {
    return (
      <Alert className="fade-in border-brand-500/30 bg-brand-50 text-brand-900">
        <CircleCheckIcon />
        <AlertTitle>Request sent</AlertTitle>
        <AlertDescription className="text-brand-900/90">
          <p>
            You'll get the seller's contact once they accept. Track it in{' '}
            <Link to="/dashboard?tab=sent" className="font-semibold underline underline-offset-4">Requests sent</Link>.
          </p>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup className="gap-4">
        <FieldSet className="gap-2">
          <FieldLegend variant="label" className="mb-0">I'd like to</FieldLegend>
          {/* Single-select ToggleGroup lets the active item be unpressed (value ''); ignore that. */}
          <ToggleGroup type="single" variant="outline" spacing={2} value={offerType} onValueChange={(v) => v && setOfferType(v)} aria-label="I'd like to" className="grid w-full grid-cols-3">
            {Object.entries(OFFER_CHOICES).map(([value, label]) => (
              <ToggleGroupItem key={value} value={value} className="h-auto min-h-11 whitespace-normal px-2 text-center text-xs font-semibold leading-tight sm:text-sm">
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldSet>
        <Field data-invalid={!!status.error || undefined}>
          <FieldLabel htmlFor="inquiry-message">Message to seller</FieldLabel>
          <Textarea
            id="inquiry-message"
            required
            maxLength={500}
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-invalid={!!status.error || undefined}
            placeholder="Hi! Is this still available? I can meet at the library after 4."
          />
          {status.error ? <FieldError>{status.error}</FieldError> : <FieldDescription>Say when and where you can meet.</FieldDescription>}
        </Field>
        <Button type="submit" size="lg" disabled={status.busy || !message.trim()} className="w-full">
          {status.busy && <Spinner data-icon="inline-start" />}
          {status.busy ? 'Sending…' : 'Send request'}
        </Button>
      </FieldGroup>
    </form>
  )
}

// Mirrors the loaded layout: breadcrumb, gallery + description, then aside card, tips, details.
function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading listing">
      <Skeleton className="mb-4 h-5 w-64" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-10">
        <div className="flex flex-col gap-6">
          <Skeleton className="aspect-[4/3] w-full rounded-xl" />
          <Card>
            <CardHeader><Skeleton className="h-[22px] w-24" /></CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-7 w-3/4" />
                <Skeleton className="h-9 w-28" />
              </div>
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </CardContent>
          </Card>
          <div className="flex flex-col gap-1.5 px-1">
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Card>
            <CardHeader><Skeleton className="h-[22px] w-16" /></CardHeader>
            <CardContent>
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <Skeleton className="size-9 rounded-lg" />
                    <div className="flex flex-col gap-1">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-4 w-24" />
                      {i < 2 && <Skeleton className="h-3 w-36" />}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
