import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ListingCard, ListingCardSkeleton } from '../components/ListingCard'
import { ErrorState, Skeleton, StatusBadge, primaryButton, secondaryButton } from '../components/ui'
import { api } from '../lib/api'
import { OFFER_LABELS, timeAgo } from '../lib/constants'

const TABS = [
  { id: 'listings', label: 'My listings', path: '/me/listings', key: 'listings' },
  { id: 'received', label: 'Requests received', path: '/me/received', key: 'inquiries' },
  { id: 'sent', label: 'Requests sent', path: '/me/inquiries', key: 'inquiries' },
]

export default function Dashboard() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((t) => t.id === params.get('tab')) ?? TABS[0]

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">My stuff</h1>
      <div role="tablist" aria-label="Dashboard sections" className="mt-4 flex gap-1 overflow-x-auto border-b border-stone-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab.id}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${
              t.id === tab.id ? 'border-brand-500 text-ink-900' : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        <Section key={tab.id} tab={tab} />
      </div>
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
  if (state.loading) {
    return isGrid ? (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4" aria-busy="true" aria-label="Loading">
        {Array.from({ length: 4 }, (_, i) => <ListingCardSkeleton key={i} />)}
      </div>
    ) : (
      <ul className="space-y-3" aria-busy="true" aria-label="Loading">
        {Array.from({ length: 3 }, (_, i) => <InquiryRowSkeleton key={i} />)}
      </ul>
    )
  }
  if (state.items.length === 0) return <Empty tab={tab.id} />

  if (isGrid) {
    return (
      <div className="fade-in grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {state.items.map((l) => <ListingCard key={l.ROWID} listing={l} />)}
      </div>
    )
  }
  return (
    <ul className="fade-in space-y-3">
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
      await onChanged()
    } catch (e) {
      setError(e.message)
      setBusy(null)
    }
  }

  const who = asSeller ? inquiry.buyer_name : null
  return (
    <li className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={inquiry.status} />
        <Link to={`/listings/${inquiry.listing_id}`} className="font-semibold text-ink-900 hover:underline">{inquiry.listing_title}</Link>
        <span className="ml-auto text-xs text-stone-500">{timeAgo(inquiry.CREATEDTIME)}</span>
      </div>
      <p className="mt-1 text-sm text-stone-500">
        {asSeller ? `${who} · ${OFFER_LABELS[inquiry.offer_type] ?? inquiry.offer_type}` : OFFER_LABELS[inquiry.offer_type] ?? inquiry.offer_type}
      </p>
      <p className="mt-2 whitespace-pre-line text-sm text-stone-800">{inquiry.message}</p>

      {asSeller && inquiry.status === 'Pending' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={() => respond('accept')} className={primaryButton}>
            {busy === 'accept' ? 'Accepting…' : 'Accept & reserve'}
          </button>
          <button type="button" disabled={!!busy} onClick={() => respond('decline')} className={secondaryButton}>
            {busy === 'decline' ? 'Declining…' : 'Decline'}
          </button>
        </div>
      )}
      {asSeller && inquiry.status === 'Accepted' && (
        <p className="mt-3 text-sm text-stone-700">
          Contact the buyer: <a href={`mailto:${inquiry.buyer_email}`} className="font-semibold text-brand-700 underline">{inquiry.buyer_email}</a>
        </p>
      )}
      {!asSeller && inquiry.status === 'Accepted' && inquiry.seller_email && (
        <p className="mt-3 text-sm text-stone-700">
          Accepted! Contact the seller: <a href={`mailto:${inquiry.seller_email}`} className="font-semibold text-brand-700 underline">{inquiry.seller_email}</a>
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
    </li>
  )
}

function InquiryRowSkeleton() {
  return (
    <li className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-40" />
      </div>
      <Skeleton className="mt-2 h-4 w-32" />
      <Skeleton className="mt-3 h-10 w-full" />
    </li>
  )
}

const EMPTY = {
  listings: { title: "You haven't listed anything yet.", body: 'Got books or lab gear you no longer need?', cta: { to: '/sell', label: 'List an item' } },
  received: { title: 'No requests yet.', body: 'When someone is interested in your items, their requests show up here.' },
  sent: { title: "You haven't sent any requests.", body: 'Find something you need and send the seller a request.', cta: { to: '/', label: 'Browse listings' } },
}

function Empty({ tab }) {
  const e = EMPTY[tab]
  return (
    <div className="fade-in flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center">
      <p className="font-medium text-stone-800">{e.title}</p>
      <p className="mt-1 text-sm text-stone-500">{e.body}</p>
      {e.cta && <Link to={e.cta.to} className={`${primaryButton} mt-4`}>{e.cta.label}</Link>}
    </div>
  )
}
