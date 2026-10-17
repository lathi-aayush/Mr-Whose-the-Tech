import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CategoryArt, ErrorState, Field, Skeleton, StatusBadge, inputClass, primaryButton, secondaryButton } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatPrice, LISTING_TYPES, timeAgo, typeLabel } from '../lib/constants'

// Owner-side moves only. Available -> Reserved happens by accepting an inquiry.
const OWNER_ACTIONS = {
  Available: [{ to: 'Completed', label: 'Mark as completed' }],
  Reserved: [
    { to: 'Completed', label: 'Handover done: mark completed' },
    { to: 'Available', label: 'Deal fell through: make available' },
  ],
  Completed: [],
}

export default function ListingDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const [active, setActive] = useState(0)

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
  const images = listing.image_urls ?? []

  return (
    <div className="fade-in grid gap-8 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <div className="aspect-[4/3] overflow-hidden rounded-xl border border-stone-200 bg-white">
          {images[active] ? (
            <img src={images[active]} alt={`${listing.title}, photo ${active + 1}`} className="h-full w-full object-contain" />
          ) : (
            <CategoryArt category={listing.category} className="h-full w-full" />
          )}
        </div>
        {images.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-pressed={i === active}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg ring-2 ${i === active ? 'ring-brand-600' : 'ring-transparent'}`}
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2">
          <StatusBadge status={listing.status} />
          <span className="text-xs text-stone-500">Listed {timeAgo(listing.CREATEDTIME)}</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-stone-900">{listing.title}</h1>
        <p className="mt-1 text-2xl font-bold text-brand-700">{formatPrice(listing)}</p>
        <dl className="mt-4 grid grid-cols-3 gap-3 rounded-xl border border-stone-200 bg-white p-4 text-sm">
          <div><dt className="text-stone-500">Condition</dt><dd className="font-medium">{listing.item_condition}</dd></div>
          <div><dt className="text-stone-500">Category</dt><dd className="font-medium">{listing.category}</dd></div>
          <div><dt className="text-stone-500">Type</dt><dd className="font-medium">{typeLabel(listing.listing_type)}</dd></div>
        </dl>
        {listing.description && <p className="mt-4 whitespace-pre-line text-stone-700">{listing.description}</p>}
        <p className="mt-4 text-sm text-stone-500">Seller: <span className="font-medium text-stone-800">{listing.seller_name}</span></p>

        <div className="mt-6">
          {isOwner ? (
            <OwnerPanel listing={listing} onChanged={load} />
          ) : !user ? (
            <Link to={`/login?next=/listings/${listing.ROWID}`} className={primaryButton}>Sign in to send an inquiry</Link>
          ) : listing.status === 'Available' ? (
            <InquiryForm listing={listing} />
          ) : (
            <p className="rounded-xl bg-stone-100 p-4 text-sm text-stone-600">This item is {listing.status.toLowerCase()} and isn't taking new inquiries.</p>
          )}
        </div>
      </div>
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
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  const actions = OWNER_ACTIONS[listing.status] ?? []
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-sm font-medium text-stone-800">This is your listing</p>
      <p className="mt-1 text-sm text-stone-500">
        {listing.status === 'Available'
          ? 'Accept an inquiry from your dashboard to reserve it for that buyer.'
          : listing.status === 'Reserved'
            ? 'Reserved for the buyer you accepted.'
            : 'This exchange is complete.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((a) => (
          <button key={a.to} type="button" disabled={!!busy} onClick={() => change(a.to)} className={a.to === 'Completed' ? primaryButton : secondaryButton}>
            {busy === a.to ? 'Saving…' : a.label}
          </button>
        ))}
        <Link to="/dashboard" className={secondaryButton}>View inquiries</Link>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
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
    } catch (err) {
      setStatus({ busy: false, error: err.message, sent: false })
    }
  }

  if (status.sent) {
    return (
      <div className="fade-in rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-900">
        Inquiry sent. You'll see the seller's reply under <Link to="/dashboard" className="font-semibold underline">My stuff</Link>.
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-sm font-medium text-stone-800">Interested? Send the seller a request.</p>
      <Field label="I'd like to">
        <select value={offerType} onChange={(e) => setOfferType(e.target.value)} className={inputClass}>
          {LISTING_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.value === 'sell' ? 'Buy it' : t.value === 'swap' ? 'Swap for something' : 'Take it for free'}</option>
          ))}
        </select>
      </Field>
      <Field label="Message" hint="Say when and where you can meet on campus.">
        <textarea required maxLength={500} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className={inputClass} placeholder="Hi! Is this still available? I can meet at the library after 4." />
      </Field>
      {status.error && <p role="alert" className="text-sm text-rose-700">{status.error}</p>}
      <button type="submit" disabled={status.busy || !message.trim()} className={primaryButton}>
        {status.busy ? 'Sending…' : 'Send inquiry'}
      </button>
    </form>
  )
}

function DetailSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]" aria-busy="true" aria-label="Loading listing">
      <Skeleton className="aspect-[4/3] rounded-xl" />
      <div>
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="mt-2 h-8 w-3/4" />
        <Skeleton className="mt-1 h-8 w-24" />
        <Skeleton className="mt-4 h-20 w-full rounded-xl" />
        <Skeleton className="mt-4 h-16 w-full" />
        <Skeleton className="mt-6 h-40 w-full rounded-xl" />
      </div>
    </div>
  )
}
