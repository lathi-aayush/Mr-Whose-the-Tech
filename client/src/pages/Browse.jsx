import { useCallback, useEffect, useMemo, useState } from 'react'
import { PackageOpenIcon, SearchXIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { ListingCard, ListingCardSkeleton } from '@/components/ListingCard'
import { ErrorState, IconButton } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { CATEGORIES, CONDITIONS, LISTING_TYPES, SORTS, STATUSES, parseCatalystTime } from '@/lib/constants'
import { cn } from '@/lib/utils'

const DEFAULT_STATUS = ['Available', 'Reserved']
const FACETS = [
  { key: 'category', label: 'Category', field: 'category', options: CATEGORIES.map((c) => ({ value: c, label: c })) },
  { key: 'condition', label: 'Condition', field: 'item_condition', options: CONDITIONS.map((c) => ({ value: c, label: c })) },
  { key: 'type', label: 'Exchange type', field: 'listing_type', options: LISTING_TYPES },
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
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const { listings } = await api('/listings?status=all')
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
      {browsing && <Hero />}

      <div className="lg:grid lg:grid-cols-[248px_1fr] lg:gap-8">
        <aside aria-label="Filters" className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100svh-7rem)] overflow-y-auto pr-2">
            <div className="mb-1 flex h-8 items-center justify-between">
              <h2 className="text-base font-semibold">Filters</h2>
              {chips.length > 0 && <Button variant="link" size="sm" onClick={clearAll} className="px-0 text-brand-700">Clear all</Button>}
            </div>
            {panel('d')}
          </div>
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

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            {state.loading ? (
              <Skeleton className="h-5 w-28" />
            ) : (
              <p className="text-sm leading-5 text-muted-foreground" aria-live="polite">
                <span className="font-semibold text-foreground">{results.length}</span> {results.length === 1 ? 'item' : 'items'}
                {f.q && <> for <span className="font-semibold text-foreground">“{params.get('q')}”</span></>}
              </p>
            )}
            <SortSelect value={f.sort} onChange={setSort} className="hidden w-52 lg:flex" />
          </div>

          {chips.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <Badge key={`${c.key}-${c.value ?? ''}`} variant="available" asChild className="h-8 cursor-pointer px-3 text-sm hover:bg-brand-100">
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
            <ErrorState message={state.error} onRetry={load} className="min-h-72" />
          ) : state.loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4" aria-busy="true" aria-label="Loading listings">
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
            <div className="fade-in grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
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

function Hero() {
  return (
    <section className="relative mb-6 overflow-hidden rounded-2xl bg-ink-900 px-5 py-7 text-white sm:px-8 sm:py-9 lg:mb-8">
      <div className="relative z-10 max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Give your stuff a <span className="text-brand-500">second semester</span>.
        </h1>
        <p className="mt-2 text-sm text-white/75 sm:text-base">Buy, swap or pick up free books, calculators and lab gear from students on your campus.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="lg" asChild><Link to="/sell">List an item</Link></Button>
          <Button size="lg" variant="outline" asChild className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
            <a href="#results">Browse items</a>
          </Button>
        </div>
      </div>
      <img src="/logo-512.png" alt="" aria-hidden="true" className="pointer-events-none absolute -bottom-10 -right-6 hidden size-56 rounded-3xl opacity-90 sm:block" />
    </section>
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
        <div key={facet.key}>
          <FieldSet className="gap-1 py-4">
            <FieldLegend variant="label" className="mb-1">{facet.label}</FieldLegend>
            {facet.options.map((o) => {
              const id = `${idPrefix}-${facet.key}-${o.value}`
              const checked = f[facet.key].includes(o.value)
              const n = counts[facet.key][o.value]
              return (
                <Field key={o.value} orientation="horizontal" className={cn('min-h-11 items-center rounded-md px-1.5 hover:bg-muted lg:min-h-9', n === 0 && !checked && 'opacity-55')}>
                  <Checkbox id={id} checked={checked} onCheckedChange={() => toggle(facet.key, o.value)} />
                  <FieldLabel htmlFor={id} className="flex-1 cursor-pointer font-normal">{o.label}</FieldLabel>
                  {loading ? <Skeleton className="h-3 w-4" /> : <span className="text-xs tabular-nums text-muted-foreground">{n}</span>}
                </Field>
              )
            })}
          </FieldSet>
          <Separator />
        </div>
      ))}
      <FieldSet className="gap-2 py-4">
        <FieldLegend variant="label" className="mb-0">Price (₹)</FieldLegend>
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
