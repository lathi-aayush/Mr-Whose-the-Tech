import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ListingCard, ListingCardSkeleton } from '../components/ListingCard'
import { ErrorState, IconButton, inputClass } from '../components/ui'
import { api } from '../lib/api'
import { CATEGORIES, CONDITIONS, LISTING_TYPES, SORTS } from '../lib/constants'

const FILTER_KEYS = ['q', 'category', 'condition', 'type', 'status', 'sort']

export default function Browse() {
  const [params, setParams] = useSearchParams()
  const [state, setState] = useState({ loading: true, error: null, listings: [] })
  const [q, setQ] = useState(params.get('q') ?? '')
  const searchRef = useRef(null)
  const queryString = FILTER_KEYS.filter((k) => params.get(k)).map((k) => `${k}=${encodeURIComponent(params.get(k))}`).join('&')

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const { listings } = await api(`/listings${queryString ? `?${queryString}` : ''}`)
      setState({ loading: false, error: null, listings })
    } catch (e) {
      setState({ loading: false, error: e.message, listings: [] })
    }
  }, [queryString])

  useEffect(() => {
    load()
  }, [load])

  // Debounce typing so every keystroke doesn't hit the API.
  useEffect(() => {
    const t = setTimeout(() => setParam('q', q.trim()), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  // "/" focuses search, like most marketplaces.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function setParam(key, value) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }

  const select = (key, label, options) => (
    <label className="block min-w-0">
      <span className="sr-only">{label}</span>
      <select value={params.get(key) ?? ''} onChange={(e) => setParam(key, e.target.value)} className={inputClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )

  const hasFilters = FILTER_KEYS.some((k) => params.get(k))

  return (
    <div>
      <section className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">Give your stuff a second semester.</h1>
        <p className="mt-1 text-stone-600">Books, calculators, lab gear and more from students on your campus.</p>
      </section>

      <div className="mb-6 space-y-3">
        <div className="relative">
          <input
            ref={searchRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search listings (press / to focus)"
            aria-label="Search listings"
            className={`${inputClass} py-3 pl-10`}
          />
          <svg className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {select('category', 'Category', [{ value: '', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))])}
          {select('condition', 'Condition', [{ value: '', label: 'Any condition' }, ...CONDITIONS.map((c) => ({ value: c, label: c }))])}
          {select('type', 'Listing type', [{ value: '', label: 'Sale, swap or free' }, ...LISTING_TYPES])}
          {select('status', 'Status', [
            { value: '', label: 'Available & reserved' },
            { value: 'Available', label: 'Available only' },
            { value: 'Reserved', label: 'Reserved only' },
            { value: 'Completed', label: 'Completed' },
          ])}
          {select('sort', 'Sort', SORTS)}
          {hasFilters && (
            <div className="flex items-center">
              <IconButton label="Clear all filters" onClick={() => { setQ(''); setParams({}, { replace: true }) }}>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </IconButton>
            </div>
          )}
        </div>
      </div>

      {state.error ? (
        <ErrorState message={state.error} onRetry={load} className="min-h-64" />
      ) : state.loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4" aria-busy="true" aria-label="Loading listings">
          {Array.from({ length: 8 }, (_, i) => <ListingCardSkeleton key={i} />)}
        </div>
      ) : state.listings.length === 0 ? (
        <div className="fade-in flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center">
          <p className="font-medium text-stone-800">{hasFilters ? 'Nothing matches those filters.' : 'No listings yet.'}</p>
          <p className="mt-1 text-sm text-stone-500">{hasFilters ? 'Try a broader search.' : 'Be the first to list something you no longer need.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {state.listings.map((l) => <ListingCard key={l.ROWID} listing={l} />)}
        </div>
      )}
    </div>
  )
}
