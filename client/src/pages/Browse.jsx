import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRightIcon, ChevronDownIcon, CirclePlusIcon, HeartIcon, LeafIcon, PackageOpenIcon, PiggyBankIcon, SearchXIcon, SlidersHorizontalIcon,
  UsersIcon, XIcon,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { ListingCard, ListingCardSkeleton } from '@/components/ListingCard'
import { AttrIcon, CATEGORY_META, CONDITION_META, EXCHANGE_META, ErrorState, IconButton } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { getCachedListings, setCachedListings } from '@/lib/listingsCache'
import { CATEGORIES, CONDITIONS, LISTING_TYPES, SORTS, STATUSES, parseCatalystTime } from '@/lib/constants'
import { cn } from '@/lib/utils'

const DEFAULT_STATUS = ['Available', 'Reserved']
// Shared by results and skeleton so their geometry can't drift. auto-fill keeps a 220px floor, so a
// few results don't stretch into giant cards.
const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] sm:gap-4'
const FACETS = [
  { key: 'category', label: 'Category', field: 'category', meta: CATEGORY_META, options: CATEGORIES.map((c) => ({ value: c, label: c })) },
  { key: 'condition', label: 'Condition', field: 'item_condition', meta: CONDITION_META, options: CONDITIONS.map((c) => ({ value: c, label: c })) },
  { key: 'type', label: 'Exchange type', field: 'listing_type', meta: EXCHANGE_META, options: LISTING_TYPES },
  { key: 'status', label: 'Availability', field: 'status', options: STATUSES.map((s) => ({ value: s, label: s === 'Completed' ? 'Completed (gone)' : s })) },
]
const labelFor = (key, value) => FACETS.find((f) => f.key === key)?.options.find((o) => o.value === value)?.label ?? value

function readFilters(params) {
  const list = (k) => (params.get(k) ?? '').split(',').filter(Boolean)
  const num = (k) => {
    const v = params.get(k)
    return v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v)
  }
  return {
    q: (params.get('q') ?? '').trim().toLowerCase(),
    category: list('category'),
    condition: list('condition'),
    type: list('type'),
    status: params.has('status') ? list('status') : DEFAULT_STATUS,
    min: num('min'),
    max: num('max'),
    sort: SORTS.some((s) => s.value === params.get('sort')) ? params.get('sort') : 'newest',
  }
}

// skip: the facet being counted, so its own selection doesn't zero out its sibling options.
function matches(l, f, skip) {
  for (const facet of FACETS) {
    if (facet.key === skip) continue
    const selected = f[facet.key]
    if (selected.length && !selected.includes(l[facet.field])) return false
  }
  if (f.min !== null || f.max !== null) {
    if (l.listing_type === 'swap') return false
    const price = l.listing_type === 'free' ? 0 : Number(l.price)
    if (f.min !== null && price < f.min) return false
    if (f.max !== null && price > f.max) return false
  }
  if (f.q) {
    const haystack = `${l.title} ${l.description} ${l.category}`.toLowerCase()
    if (!f.q.split(/\s+/).every((t) => haystack.includes(t))) return false
  }
  return true
}

const priceOf = (l) => (l.listing_type === 'sell' ? Number(l.price) : 0)
const byNewest = (a, b) => parseCatalystTime(b.CREATEDTIME) - parseCatalystTime(a.CREATEDTIME) || String(b.ROWID).localeCompare(String(a.ROWID))
const COMPARE = {
  newest: byNewest,
  oldest: (a, b) => -byNewest(a, b),
  price_asc: (a, b) => priceOf(a) - priceOf(b) || byNewest(a, b),
  price_desc: (a, b) => priceOf(b) - priceOf(a) || byNewest(a, b),
}

export default function Browse() {
  const [params, setParams] = useSearchParams()
  const [state, setState] = useState({ loading: true, error: null, listings: [] })
  const [sheetOpen, setSheetOpen] = useState(false)

  // ponytail: one fetch, then filter in the browser so every click is instant. Fine up to the
  // server's 900-row scan; past that, move facets back to the API.
  const load = useCallback(async (force = false) => {
    const cached = force ? null : getCachedListings()
    if (cached) return setState({ loading: false, error: null, listings: cached })
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const { listings } = await api('/listings?status=all')
      setCachedListings(listings)
      setState({ loading: false, error: null, listings })
    } catch (e) {
      setState({ loading: false, error: e.message, listings: [] })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const f = useMemo(() => readFilters(params), [params])
  const results = useMemo(() => state.listings.filter((l) => matches(l, f)).sort(COMPARE[f.sort]), [state.listings, f])
  const counts = useMemo(() => {
    const out = {}
    for (const facet of FACETS) {
      const pool = state.listings.filter((l) => matches(l, f, facet.key))
      out[facet.key] = Object.fromEntries(facet.options.map((o) => [o.value, pool.filter((l) => l[facet.field] === o.value).length]))
    }
    return out
  }, [state.listings, f])

  function update(mutate) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      mutate(next)
      return next
    }, { replace: true })
  }

  const toggle = (key, value) =>
    update((p) => {
      const current = f[key]
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
      p.set(key, next.join(','))
      if (!next.length && key !== 'status') p.delete(key)
    })
  const setValue = (key, value) => update((p) => (value === '' || value === null ? p.delete(key) : p.set(key, value)))
  const setSort = (v) => setValue('sort', v === 'newest' ? '' : v)
  const clearAll = () => update((p) => ['category', 'condition', 'type', 'status', 'min', 'max'].forEach((k) => p.delete(k)))

  const chips = [
    ...['category', 'condition', 'type'].flatMap((key) => f[key].map((value) => ({ key, value, label: labelFor(key, value) }))),
    ...(params.has('status') ? f.status.map((value) => ({ key: 'status', value, label: value })) : []),
    ...(f.min !== null || f.max !== null
      ? [{ key: 'price', label: `₹${f.min ?? 0} – ${f.max !== null ? `₹${f.max}` : 'any'}` }]
      : []),
  ]
  const removeChip = (c) =>
    c.key === 'price' ? update((p) => { p.delete('min'); p.delete('max') }) : toggle(c.key, c.value)
  const browsing = !f.q && chips.length === 0
  const itemsLabel = `${results.length} ${results.length === 1 ? 'item' : 'items'}`

  const panel = (idPrefix) => <FilterPanel idPrefix={idPrefix} f={f} counts={counts} toggle={toggle} setValue={setValue} loading={state.loading} />

  return (
    <div>
      {/* Stays while filtering so clicking a category doesn't yank the page up; hidden for searches. */}
      {!f.q && <Hero listings={state.listings} />}

      <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-6">
        {/* Not sticky: the full facet list is taller than the viewport, and an inner scrollbar looked cramped. */}
        <aside aria-label="Filters" className="hidden self-start rounded-2xl border bg-card px-4 pt-3 pb-1 shadow-xs lg:block">
          <div className="flex h-10 items-center justify-between border-b pb-2">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <SlidersHorizontalIcon className="size-4" aria-hidden="true" />
              Filters
            </h2>
            {chips.length > 0 && <Button variant="link" size="sm" onClick={clearAll} className="px-0 text-brand-700">Clear all</Button>}
          </div>
          {panel('d')}
        </aside>

        <section id="results" aria-label="Results" className="min-w-0 scroll-mt-4">
          {/* Mobile: filters and sort sit on top, Amazon/Flipkart app style. */}
          <div className="sticky top-0 z-30 -mx-4 mb-3 flex items-center gap-2 border-b bg-background/95 px-4 py-2.5 backdrop-blur lg:hidden">
            <Button variant="outline" className="flex-1 bg-card" onClick={() => setSheetOpen(true)}>
              <SlidersHorizontalIcon data-icon="inline-start" />
              Filters
              {chips.length > 0 && <Badge>{chips.length}</Badge>}
            </Button>
            <SortSelect value={f.sort} onChange={setSort} className="flex-1" />
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-baseline gap-3">
              <h2 className="truncate text-lg font-bold tracking-tight">
                {f.q ? <>Results for “{params.get('q')}”</> : 'Find your next essential'}
              </h2>
              {state.loading ? (
                <Skeleton className="h-4 w-14" />
              ) : (
                <p className="shrink-0 text-sm text-muted-foreground" aria-live="polite">{itemsLabel}</p>
              )}
            </div>
            <SortSelect value={f.sort} onChange={setSort} className="hidden w-48 lg:flex" />
          </div>

          <CategoryPills selected={f.category} toggle={toggle} clear={() => setValue('category', null)} />

          {/* Category lives in the pills above; chips only for the other filters. */}
          {chips.some((c) => c.key !== 'category') && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {chips.filter((c) => c.key !== 'category').map((c) => (
                <Badge key={`${c.key}-${c.value ?? ''}`} variant="outline" asChild className="h-7 cursor-pointer bg-card px-2.5 text-xs hover:bg-muted">
                  <button type="button" onClick={() => removeChip(c)} aria-label={`Remove filter: ${c.label}`}>
                    {c.label}
                    <XIcon data-icon="inline-end" />
                  </button>
                </Badge>
              ))}
              <Button variant="ghost" size="sm" onClick={clearAll}>Clear all</Button>
            </div>
          )}

          {state.error ? (
            <ErrorState message={state.error} onRetry={() => load(true)} className="min-h-72" />
          ) : state.loading ? (
            <div className={GRID} aria-busy="true" aria-label="Loading listings">
              {Array.from({ length: 8 }, (_, i) => <ListingCardSkeleton key={i} />)}
            </div>
          ) : results.length === 0 ? (
            <Empty className="fade-in min-h-72 border bg-card">
              <EmptyHeader>
                <EmptyMedia variant="icon">{state.listings.length ? <SearchXIcon /> : <PackageOpenIcon />}</EmptyMedia>
                <EmptyTitle>{state.listings.length ? 'No items match your search' : 'Nothing listed yet'}</EmptyTitle>
                <EmptyDescription>
                  {state.listings.length ? 'Try fewer filters or a different word.' : 'Be the first to give something a second semester.'}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {state.listings.length && !browsing ? (
                  <Button variant="outline" onClick={() => setParams({}, { replace: true })}>Clear search and filters</Button>
                ) : (
                  <Button asChild><Link to="/sell">List an item</Link></Button>
                )}
              </EmptyContent>
            </Empty>
          ) : (
            <div className={cn('fade-in', GRID)}>
              {results.map((l) => <ListingCard key={l.ROWID} listing={l} />)}
            </div>
          )}
        </section>
      </div>

      <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
        <DrawerContent className="lg:hidden">
          <DrawerHeader className="flex-row items-center justify-between border-b py-2">
            <DrawerTitle className="text-base">Filters</DrawerTitle>
            <div className="flex items-center gap-1">
              {chips.length > 0 && <Button variant="link" size="sm" onClick={clearAll} className="text-brand-700">Clear all</Button>}
              <DrawerClose asChild>
                <IconButton label="Close filters" shortcut="Esc"><XIcon /></IconButton>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4">{panel('m')}</div>
          <DrawerFooter className="border-t pb-[max(1rem,env(safe-area-inset-bottom))]">
            <DrawerClose asChild>
              <Button size="lg" className="w-full">Show {itemsLabel}</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

const HERO_POINTS = [
  { icon: LeafIcon, label: 'Student to student' },
  { icon: PiggyBankIcon, label: 'Save money' },
  { icon: UsersIcon, label: 'More sustainable campus' },
]
// Framed photo slots: position/tilt, then the photo's shape. Mixed shapes read as a pinned collage, not a grid.
const COLLAGE = [
  { frame: 'left-12 top-6 w-28 -rotate-6', shape: 'aspect-[4/5]' },
  { frame: 'left-[148px] top-1 z-10 w-24 rotate-3', shape: 'aspect-[3/4]' },
  { frame: 'right-9 top-9 w-32 rotate-[4deg]', shape: 'aspect-square' },
]

function Hero({ listings }) {
  // Only photos already uploaded to our Stratus bucket, taken from the list Browse already fetched:
  // no extra request, no outside images. One distinct photo per slot; with none, the collage hides.
  const photos = [...new Set(listings.flatMap((l) => (l.image_urls?.[0] && l.status !== 'Completed' ? [l.image_urls[0]] : [])))]
    .slice(0, COLLAGE.length)

  return (
    <section className="relative mb-5 overflow-hidden rounded-2xl bg-ink-900 text-white lg:mb-6">
      {/* Glows, collage and doodles are desktop-only decoration; phones get the plain text block. */}
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 -left-16 hidden size-64 rounded-full bg-brand-500/15 blur-3xl lg:block" />
      <div aria-hidden="true" className="pointer-events-none absolute -top-20 right-1/4 hidden size-72 rounded-full bg-grape-500/25 blur-3xl lg:block" />

      <div className={cn('relative grid items-center gap-6 px-4 py-5 sm:px-8 sm:py-6 lg:min-h-[216px] lg:py-7', photos.length && 'lg:grid-cols-[minmax(0,1fr)_380px]')}>
        <div>
          <p className="hidden items-center gap-1.5 rounded-full sm:inline-flex bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ring-1 ring-white/15 ring-inset">
            <LeafIcon className="size-3 text-brand-500" aria-hidden="true" />
            A greener campus together
          </p>
          <h1 className="text-[22px] leading-tight font-bold tracking-tight sm:mt-3 sm:text-[34px]">
            Pass it on. Find your <span className="text-brand-500 lg:block">next essential.</span>
          </h1>
          <p className="mt-2 text-sm text-white/75 sm:text-base">Buy, swap, or find free student essentials on your campus.</p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button asChild>
              <Link to="/sell"><CirclePlusIcon data-icon="inline-start" />List an item</Link>
            </Button>
            <Button variant="outline" asChild className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <a href="#results">Explore listings<ArrowRightIcon data-icon="inline-end" /></a>
            </Button>
          </div>
          <ul className="mt-4 hidden flex-wrap gap-x-5 gap-y-1 text-xs text-white/80 sm:flex">
            {HERO_POINTS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2">
                <Icon className="size-3.5 text-brand-500" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        {photos.length > 0 && (
          <div aria-hidden="true" className="relative hidden h-48 lg:block">
            {/* Doodles: scribble top-left, curved arrows between frames. */}
            <svg viewBox="0 0 40 30" className="absolute top-0 left-2 w-9 text-grape-500" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M4 6l14 8M10 2l6 12M2 18l14 0" />
            </svg>
            <svg viewBox="0 0 48 32" className="absolute bottom-1 left-[172px] z-20 w-10 text-grape-500" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8c6 14 22 20 36 12M34 14l7 6-9 3" />
            </svg>
            <svg viewBox="0 0 32 48" className="absolute right-1 bottom-2 z-20 w-6 text-grape-500" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M24 4c-12 6-14 22-4 34M14 34l6 6 4-8" />
            </svg>

            {photos.map((src, i) => (
              // White frame: thick border, rounded corners, deep shadow, like a printed photo.
              <div key={src} className={cn('absolute rounded-2xl bg-white p-2 shadow-2xl ring-1 shadow-black/40 ring-black/5', COLLAGE[i].frame)}>
                <img src={src} alt="" loading="lazy" onError={(e) => { e.currentTarget.parentElement.style.display = 'none' }} className={cn('fade-in w-full rounded-xl bg-muted object-cover', COLLAGE[i].shape)} />
              </div>
            ))}

            <div className="absolute bottom-3 left-0 z-20 flex w-[84px] -rotate-6 flex-col items-center gap-1 rounded-lg bg-brand-50 px-2 py-2.5 text-center text-xs leading-snug font-medium text-ink-900 italic shadow-lg">
              Same students, brighter tomorrow
              <HeartIcon className="size-3.5" />
            </div>
            <div className="absolute top-1 right-0 z-20 flex w-[76px] rotate-6 flex-col items-center gap-1 rounded-lg bg-grape-50 px-2 py-2.5 text-center text-[11px] leading-snug font-medium text-grape-700 italic shadow-lg">
              Reuse · Share · Support our campus
              <HeartIcon className="size-3" />
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

// Quick category switch above the grid; same `category` param as the sidebar checkboxes.
function CategoryPills({ selected, toggle, clear }) {
  const pill = 'inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3.5 text-sm font-medium transition outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
  return (
    <div role="group" aria-label="Categories" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      <button type="button" aria-pressed={!selected.length} onClick={clear} className={cn(pill, !selected.length ? 'border-transparent bg-brand-500 text-ink-900' : 'bg-card hover:bg-muted')}>
        All
      </button>
      {CATEGORIES.map((c) => {
        const on = selected.includes(c)
        return (
          <button key={c} type="button" aria-pressed={on} onClick={() => toggle('category', c)} className={cn(pill, on ? 'border-brand-500/40 bg-brand-50 text-brand-900' : 'bg-card hover:bg-muted')}>
            {c}
            {on && <XIcon className="size-3.5" aria-hidden="true" />}
          </button>
        )
      })}
    </div>
  )
}

function SortSelect({ value, onChange, className }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label="Sort by" className={cn('w-full bg-card', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="end">
        <SelectGroup>
          {SORTS.map((s) => <SelectItem key={s.value} value={s.value}>Sort: {s.label}</SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

function FilterPanel({ idPrefix, f, counts, toggle, setValue, loading }) {
  return (
    <div className="flex flex-col">
      {FACETS.map((facet) => (
        // Native <details>: collapsible with keyboard support and no extra state.
        <details key={facet.key} open className="group border-b py-3 last:border-b-0">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-md py-1 text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
            {facet.label}
            <ChevronDownIcon className="size-4 text-muted-foreground transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <FieldSet className="mt-1 gap-0.5">
            <FieldLegend className="sr-only">{facet.label}</FieldLegend>
            {facet.options.map((o) => {
              const id = `${idPrefix}-${facet.key}-${o.value}`
              const checked = f[facet.key].includes(o.value)
              const n = counts[facet.key][o.value]
              return (
                <Field key={o.value} orientation="horizontal" className={cn('min-h-11 items-center rounded-md px-1.5 hover:bg-muted lg:min-h-8', n === 0 && !checked && 'opacity-55')}>
                  <Checkbox id={id} checked={checked} onCheckedChange={() => toggle(facet.key, o.value)} />
                  <FieldLabel htmlFor={id} className="flex-1 cursor-pointer items-center gap-1.5 font-normal">
                    {facet.meta && <AttrIcon inline meta={facet.meta[o.value]} className="size-4" />}
                    {o.label}
                  </FieldLabel>
                  {loading ? <Skeleton className="h-3 w-4" /> : <span className="text-xs tabular-nums text-muted-foreground">{n}</span>}
                </Field>
              )
            })}
          </FieldSet>
        </details>
      ))}
      <FieldSet className="gap-2 border-t py-4">
        <FieldLegend variant="label" className="mb-0 font-semibold">Price (₹)</FieldLegend>
        <div className="flex items-center gap-2">
          <PriceInput label="Minimum price" placeholder="Min" value={f.min} onChange={(v) => setValue('min', v)} />
          <span className="text-muted-foreground">–</span>
          <PriceInput label="Maximum price" placeholder="Max" value={f.max} onChange={(v) => setValue('max', v)} />
        </div>
        <FieldDescription className="text-xs">Free items count as ₹0. Swaps are hidden when a price is set.</FieldDescription>
      </FieldSet>
    </div>
  )
}

function PriceInput({ label, placeholder, value, onChange }) {
  return (
    <Input
      type="number"
      inputMode="numeric"
      min={0}
      aria-label={label}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 bg-card"
    />
  )
}
