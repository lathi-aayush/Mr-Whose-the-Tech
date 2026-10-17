import { useCallback, useEffect, useState } from 'react'
import { InboxIcon, MailIcon, PackageOpenIcon, SendIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ListingCard, ListingCardSkeleton } from '@/components/ListingCard'
import { ErrorState, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { FieldError } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { OFFER_LABELS, timeAgo } from '@/lib/constants'

const TABS = [
  { id: 'listings', label: 'My listings', path: '/me/listings', key: 'listings' },
  { id: 'received', label: 'Requests received', path: '/me/received', key: 'inquiries' },
  { id: 'sent', label: 'Requests sent', path: '/me/inquiries', key: 'inquiries' },
]

export default function Dashboard() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((t) => t.id === params.get('tab')) ?? TABS[0]

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">My stuff</h1>
      <Tabs value={tab.id} onValueChange={(id) => setParams({ tab: id }, { replace: true })} className="gap-6">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          {TABS.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
        </TabsList>
        {/* Radix unmounts inactive panels, so each Section fetches when its tab opens. */}
        {TABS.map((t) => (
          <TabsContent key={t.id} value={t.id}>
            <Section tab={t} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

function Section({ tab }) {
  const [state, setState] = useState({ loading: true, error: null, items: [] })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await api(tab.path)
      setState({ loading: false, error: null, items: data[tab.key] })
    } catch (e) {
      setState({ loading: false, error: e.message, items: [] })
    }
  }, [tab])

  useEffect(() => {
    load()
  }, [load])

  const isGrid = tab.id === 'listings'
  if (state.error) return <ErrorState message={state.error} onRetry={load} className="min-h-64" />
  if (state.loading && state.items.length === 0) {
    return isGrid ? (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4" aria-busy="true" aria-label="Loading">
        {Array.from({ length: 4 }, (_, i) => <ListingCardSkeleton key={i} />)}
      </div>
    ) : (
      <ul className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
        {Array.from({ length: 3 }, (_, i) => <InquiryRowSkeleton key={i} />)}
      </ul>
    )
  }
  if (state.items.length === 0) return <EmptyTab tab={tab.id} />

  if (isGrid) {
    return (
      <div className="fade-in grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {state.items.map((l) => <ListingCard key={l.ROWID} listing={l} />)}
      </div>
    )
  }
  return (
    <ul className="fade-in flex flex-col gap-3">
      {state.items.map((i) => <InquiryRow key={i.ROWID} inquiry={i} asSeller={tab.id === 'received'} onChanged={load} />)}
    </ul>
  )
}

function InquiryRow({ inquiry, asSeller, onChanged }) {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  async function respond(action) {
    setBusy(action)
    setError(null)
    try {
      await api(`/inquiries/${inquiry.ROWID}`, { method: 'PATCH', body: { action } })
      toast.success(action === 'accept' ? 'Accepted. Item reserved for this buyer.' : 'Request declined')
      await onChanged()
    } catch (e) {
      setError(e.message)
      setBusy(null)
    }
  }

  const offer = OFFER_LABELS[inquiry.offer_type] ?? inquiry.offer_type
  const contact = asSeller ? inquiry.buyer_email : inquiry.seller_email
  return (
    <li>
      <Card>
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={inquiry.status} />
            <Link to={`/listings/${inquiry.listing_id}`} className="min-w-0 truncate font-semibold underline-offset-4 hover:underline" title={inquiry.listing_title}>
              {inquiry.listing_title}
            </Link>
            <span className="ml-auto text-xs text-muted-foreground">{timeAgo(inquiry.CREATEDTIME)}</span>
          </div>
          <p className="text-muted-foreground">{asSeller ? `${inquiry.buyer_name} · ${offer}` : offer}</p>
          <p className="whitespace-pre-line">{inquiry.message}</p>

          {asSeller && inquiry.status === 'Pending' && (
            <div className="mt-1 flex flex-wrap gap-2">
              <Button disabled={!!busy} onClick={() => respond('accept')}>
                {busy === 'accept' && <Spinner data-icon="inline-start" />}
                {busy === 'accept' ? 'Accepting…' : 'Accept & reserve'}
              </Button>
              <Button variant="outline" disabled={!!busy} onClick={() => respond('decline')}>
                {busy === 'decline' && <Spinner data-icon="inline-start" />}
                {busy === 'decline' ? 'Declining…' : 'Decline'}
              </Button>
            </div>
          )}
          {inquiry.status === 'Accepted' && contact && (
            <p className="mt-1 flex flex-wrap items-center gap-1.5">
              <MailIcon className="size-4 text-brand-700" aria-hidden="true" />
              {asSeller ? 'Contact the buyer:' : 'Accepted! Contact the seller:'}
              <a href={`mailto:${contact}`} className="font-semibold text-brand-700 underline underline-offset-4">{contact}</a>
            </p>
          )}
          {error && <FieldError>{error}</FieldError>}
        </CardContent>
      </Card>
    </li>
  )
}

// Same Card padding and line heights as InquiryRow.
function InquiryRowSkeleton() {
  return (
    <li>
      <Card>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="ml-auto h-4 w-10" />
          </div>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-full" />
        </CardContent>
      </Card>
    </li>
  )
}

const EMPTY = {
  listings: { icon: PackageOpenIcon, title: "You haven't listed anything yet", body: 'Got books or lab gear you no longer need?', cta: { to: '/sell', label: 'List an item' } },
  received: { icon: InboxIcon, title: 'No requests yet', body: 'When someone is interested in your items, their requests show up here.' },
  sent: { icon: SendIcon, title: "You haven't sent any requests", body: 'Find something you need and send the seller a request.', cta: { to: '/', label: 'Browse listings' } },
}

function EmptyTab({ tab }) {
  const { icon: Icon, title, body, cta } = EMPTY[tab]
  return (
    <Empty className="fade-in min-h-64 border border-dashed bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Icon /></EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{body}</EmptyDescription>
      </EmptyHeader>
      {cta && (
        <EmptyContent>
          <Button asChild><Link to={cta.to}>{cta.label}</Link></Button>
        </EmptyContent>
      )}
    </Empty>
  )
}
