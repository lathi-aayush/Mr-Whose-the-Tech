import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowLeftIcon, MessageCircleIcon, MessagesSquareIcon, SearchIcon } from 'lucide-react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { cn } from 'cn'
import { toast } from 'sonner'
import { ErrorState, IconButton, StatusBadge } from '@/components/common'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { onWake } from '@/lib/activity'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { OFFER_LABELS, parseCatalystTime, timeAgo, timeAgoMs } from '@/lib/constants'
import { ChatPanel, SwapOffer } from '@/pages/Chat'

// No timer here: the list reloads (2 Data Store fetches) only when Layout's shared notifications poll
// reports something new, when you return to the tab, or when the open chat sends/receives.
// ponytail: declines and other silent status changes show up on the next focus. Upgrade path: Signals.
// Only Accepted requests can chat; the other groups show the request itself.
const GROUPS = [
  { status: 'Accepted', label: 'Accepted' },
  { status: 'Pending', label: 'Pending' },
  { status: 'Declined', label: 'Declined' },
]

// Mirrors validateContactShare in functions/api/lib/rules.js; the server is the source of truth.
const PHONE_RE = /^\+?\d{10,15}$/
const cleanPhone = (p) => p.replace(/[\s\-()]/g, '')

// What the row's green badge shows: a message count, "New" for something that needs a first look
// (a pending request for the seller, an acceptance the buyer hasn't opened), or nothing.
// `seenAt` is when this client opened the chat; it hides the badge before the server's read mark arrives.
function unreadBadge(i, seenAt = 0) {
  const asSeller = i.role === 'seller'
  if (asSeller && i.status === 'Pending') return 'New'
  if (i.status !== 'Accepted') return null
  const lastAt = Number(i.last_message_at) || 0
  const me = asSeller ? i.seller_id : i.buyer_id
  const readAt = Math.max(Number(asSeller ? i.seller_read_at : i.buyer_read_at) || 0, seenAt)
  if (lastAt > readAt && String(i.last_sender_id) !== String(me)) {
    return Number(asSeller ? i.seller_unread : i.buyer_unread) || 1
  }
  return !asSeller && !readAt ? 'New' : null
}

const activity = (i) => Number(i.last_message_at) || parseCatalystTime(i.CREATEDTIME)
const initialOf = (name) => name?.[0]?.toUpperCase() ?? '?'

export default function Chats() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, error: null, items: [] })
  // ROWID -> when this client last had the chat open. The server marks a chat read when it opens;
  // this clears the badge immediately, and only hides messages older than that moment.
  const [opened, setOpened] = useState(() => new Map())
  const [q, setQ] = useState('')

  // Both lists in one: requests I received (I'm selling) and requests I sent (I'm buying).
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const [received, sent] = await Promise.all([api('/me/received'), api('/me/inquiries')])
      const items = [
        ...received.inquiries.map((i) => ({ ...i, role: 'seller' })),
        ...sent.inquiries.map((i) => ({ ...i, role: 'buyer' })),
      ]
      setState({ loading: false, error: null, items })
    } catch (e) {
      // A failed background refresh keeps what's on screen; only the first load shows the error.
      if (!silent) setState({ loading: false, error: e.message, items: [] })
    }
  }, [])

  useEffect(() => {
    load()
    return onWake(() => load({ silent: true }))
  }, [load])

  const notifications = useOutletContext() ?? []
  const noteKey = notifications.map((n) => `${n.kind}-${n.inquiry_id}-${n.at ?? ''}`).join('|')
  const firstKey = useRef(true)
  useEffect(() => {
    if (firstKey.current) return void (firstKey.current = false) // the mount load above already has this
    load({ silent: true })
  }, [noteKey, load])
  const reload = useCallback(() => load({ silent: true }), [load])

  const selected = state.items.find((i) => String(i.ROWID) === id) ?? null
  // Re-stamped on every refresh while open, so a message arriving in the open chat never shows as unread.
  useEffect(() => {
    if (selected?.status === 'Accepted') setOpened((m) => new Map(m).set(selected.ROWID, Date.now()))
  }, [selected])

  const back = useCallback(() => navigate('/chats'), [navigate])

  // Below lg only one pane shows at a time, so Esc acts as "back" there.
  useEffect(() => {
    if (!selected) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented && window.matchMedia('(max-width: 1023px)').matches) back()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected, back])

  const needle = q.trim().toLowerCase()
  const grouped = useMemo(() => {
    const hit = (i) => !needle || `${i.listing_title} ${i.role === 'seller' ? i.buyer_name : 'seller'} ${i.last_message_preview ?? ''}`.toLowerCase().includes(needle)
    return GROUPS.map((g) => ({ ...g, items: state.items.filter((i) => i.status === g.status && hit(i)).sort((a, b) => activity(b) - activity(a)) })).filter((g) => g.items.length)
  }, [state.items, needle])

  if (state.error) return <ErrorState message={state.error} onRetry={() => load()} className="min-h-64" />
  if (state.loading && state.items.length === 0) return <ChatsSkeleton />
  if (state.items.length === 0) {
    return (
      <Empty className="fade-in min-h-64 border border-dashed bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon"><MessagesSquareIcon /></EmptyMedia>
          <EmptyTitle>No chats yet</EmptyTitle>
          <EmptyDescription>Send a request on an item you need, or wait for requests on yours. Accepted requests open a chat here.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild><Link to="/">Browse listings</Link></Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="fade-in grid h-[calc(100svh-9rem)] min-h-[30rem] overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid-cols-[22rem_minmax(0,1fr)]">
      <nav className={cn('min-h-0 flex-col overflow-y-auto border-r', selected ? 'hidden lg:flex' : 'flex')} aria-label="Chats">
        <div className="flex flex-col gap-2.5 border-b p-4">
          <h1 className="text-lg leading-7 font-semibold tracking-tight">Chats <span className="text-sm font-normal text-muted-foreground">({state.items.length})</span></h1>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" aria-label="Search chats" className="h-9 pl-8" />
          </div>
        </div>
        {grouped.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No chats match “{q.trim()}”.</p>}
        {grouped.map((g) => (
          <section key={g.status} aria-label={g.label}>
            <h2 className="sticky top-0 z-10 bg-muted/70 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
              {g.label} ({g.items.length})
            </h2>
            <ul>
              {g.items.map((i) => (
                <ChatRow
                  key={i.ROWID}
                  inquiry={i}
                  active={selected?.ROWID === i.ROWID}
                  badge={unreadBadge(i, opened.get(i.ROWID))}
                />
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <section className={cn('min-h-0 min-w-0', selected ? 'block' : 'hidden lg:block')} aria-label="Selected chat">
        {!selected ? (
          <Empty className="h-full border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon"><MessageCircleIcon /></EmptyMedia>
              <EmptyTitle>{id ? 'Chat not found' : 'Pick a chat'}</EmptyTitle>
              <EmptyDescription>{id ? 'It may belong to another account.' : 'You can chat once the seller accepts a request.'}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : selected.status === 'Accepted' ? (
          <ChatPanel key={selected.ROWID} id={selected.ROWID} onBack={back} onActivity={reload} />
        ) : (
          <RequestDetail key={selected.ROWID} inquiry={selected} onBack={back} onChanged={() => load({ silent: true })} />
        )}
      </section>
    </div>
  )
}

function ChatRow({ inquiry, active, badge }) {
  const asSeller = inquiry.role === 'seller'
  const offer = OFFER_LABELS[inquiry.offer_type] ?? inquiry.offer_type
  const who = asSeller ? inquiry.buyer_name : 'Seller'
  const me = asSeller ? inquiry.seller_id : inquiry.buyer_id
  const hasMessages = inquiry.status === 'Accepted' && inquiry.last_message_preview
  const mine = String(inquiry.last_sender_id) === String(me)
  const unread = badge !== null
  const badgeHelp = typeof badge === 'number' ? `${badge} unread message${badge === 1 ? '' : 's'}` : asSeller ? 'Waiting for your answer' : 'Seller accepted your request'
  return (
    <li className="border-b">
      <Link
        to={`/chats/${inquiry.ROWID}`}
        aria-current={active ? 'true' : undefined}
        className="flex gap-3 p-4 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted aria-[current=true]:bg-brand-50/70 aria-[current=true]:shadow-[inset_3px_0_0_var(--color-brand-500)]"
      >
        <Avatar size="lg">
          <AvatarFallback className="bg-ink-900 font-semibold text-white">{initialOf(who)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className={cn('min-w-0 flex-1 truncate', unread ? 'font-bold' : 'font-semibold')} title={inquiry.listing_title}>{inquiry.listing_title}</span>
            <span className={cn('shrink-0 text-[11px]', unread ? 'font-semibold text-emerald-600' : 'text-muted-foreground')}>
              {inquiry.last_message_at ? timeAgoMs(Number(inquiry.last_message_at)) : timeAgo(inquiry.CREATEDTIME)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Last message like a messaging app; before any message, who and what was asked. */}
            <span className={cn('min-w-0 flex-1 truncate text-sm', unread ? 'font-medium text-foreground' : 'text-muted-foreground')}>
              {hasMessages ? `${mine ? 'You: ' : ''}${inquiry.last_message_preview}` : `${who} · ${offer}`}
            </span>
            {unread && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    role="img"
                    aria-label={badgeHelp}
                    className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-xs font-semibold text-white"
                  >
                    {badge}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{badgeHelp}</TooltipContent>
              </Tooltip>
            )}
          </div>
          {!hasMessages && inquiry.swap_item && <span className="truncate text-sm text-muted-foreground" title={inquiry.swap_item}>Offers: {inquiry.swap_item}</span>}
          <div className="mt-1 flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge tabIndex={0} variant="outline">{asSeller ? 'Selling' : 'Buying'}</Badge>
              </TooltipTrigger>
              <TooltipContent>{asSeller ? 'Someone asked for your item' : 'You asked for this item'}</TooltipContent>
            </Tooltip>
            <StatusBadge status={inquiry.status} />
          </div>
        </div>
      </Link>
    </li>
  )
}

// Seller picks what the buyer sees before anything is reserved: email only, or a typed phone number.
function AcceptDialog({ inquiry, open, onOpenChange, onDone }) {
  const { user } = useAuth()
  const uid = useId()
  const [share, setShare] = useState('email')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (share === 'phone' && !PHONE_RE.test(cleanPhone(phone))) {
      setError('Enter a valid phone number (10–15 digits, optional +)')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api(`/inquiries/${inquiry.ROWID}`, { method: 'PATCH', body: { action: 'accept', share, phone } })
      toast.success('Accepted. Item reserved and chat unlocked.')
      onOpenChange(false)
      await onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Share your contact with {inquiry.buyer_name}</DialogTitle>
            <DialogDescription>The buyer only sees what you pick. You can always talk in the on-site chat.</DialogDescription>
          </DialogHeader>

          <RadioGroup value={share} onValueChange={(v) => { setShare(v); setError(null) }}>
            <FieldLabel htmlFor={`${uid}-opt-email`}>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Email ID</FieldTitle>
                  <FieldDescription className="break-all">{user?.email}</FieldDescription>
                </FieldContent>
                <RadioGroupItem value="email" id={`${uid}-opt-email`} />
              </Field>
            </FieldLabel>
            <FieldLabel htmlFor={`${uid}-opt-phone`}>
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Give phone number</FieldTitle>
                  <FieldDescription>Your email stays hidden.</FieldDescription>
                </FieldContent>
                <RadioGroupItem value="phone" id={`${uid}-opt-phone`} />
              </Field>
            </FieldLabel>
          </RadioGroup>

          {share === 'phone' && (
            <Field data-invalid={!!error || undefined}>
              <Label htmlFor={`${uid}-phone-input`}>Phone number</Label>
              <Input
                id={`${uid}-phone-input`}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                autoFocus
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-invalid={!!error}
              />
            </Field>
          )}
          {error && <FieldError>{error}</FieldError>}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? 'Accepting…' : 'Okay'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Right pane for requests with no chat: the request itself, plus accept/decline for the seller.
function RequestDetail({ inquiry, onBack, onChanged }) {
  const asSeller = inquiry.role === 'seller'
  const [busy, setBusy] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState(null)

  async function decline() {
    setBusy(true)
    setError(null)
    try {
      await api(`/inquiries/${inquiry.ROWID}`, { method: 'PATCH', body: { action: 'decline' } })
      toast.success('Request declined')
      await onChanged()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const offer = OFFER_LABELS[inquiry.offer_type] ?? inquiry.offer_type
  const swap = inquiry.swap_item ? { item: inquiry.swap_item, image_urls: inquiry.swap_image_urls } : null
  const waiting = inquiry.status === 'Pending'
  return (
    <div className="fade-in flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b p-3">
        <IconButton label="Back to chats" shortcut="Esc" size="icon-sm" onClick={onBack} className="lg:hidden">
          <ArrowLeftIcon />
        </IconButton>
        <Link to={`/listings/${inquiry.listing_id}`} className="min-w-0 flex-1 truncate font-semibold underline-offset-4 hover:underline" title={inquiry.listing_title}>
          {inquiry.listing_title}
        </Link>
        <StatusBadge status={inquiry.status} />
      </header>
      {swap && <SwapOffer swap={swap} />}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        <p className="text-sm text-muted-foreground">
          {asSeller ? `${inquiry.buyer_name} · ${offer}` : offer} · {timeAgo(inquiry.CREATEDTIME)}
        </p>
        <p className="max-w-[85%] self-start rounded-2xl rounded-tl-sm bg-muted px-3 py-2 whitespace-pre-line">{inquiry.message}</p>

        {asSeller && waiting && (
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => setAccepting(true)}>Accept & reserve</Button>
            <Button variant="outline" disabled={busy} onClick={decline}>
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? 'Declining…' : 'Decline'}
            </Button>
            <AcceptDialog inquiry={inquiry} open={accepting} onOpenChange={setAccepting} onDone={onChanged} />
          </div>
        )}
        {!asSeller && waiting && <p className="text-sm text-muted-foreground">Waiting for the seller. The chat unlocks when they accept.</p>}
        {inquiry.status === 'Declined' && <p className="text-sm text-muted-foreground">This request was declined or the item went to someone else. No chat is available.</p>}
        {error && <FieldError>{error}</FieldError>}
      </div>
    </div>
  )
}

// Same grid, header and row heights as the loaded page.
function ChatsSkeleton() {
  return (
    <div className="grid h-[calc(100svh-9rem)] min-h-[30rem] overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid-cols-[22rem_minmax(0,1fr)]" aria-busy="true" aria-label="Loading chats">
      <div className="flex flex-col overflow-hidden border-r">
        <div className="flex flex-col gap-2.5 border-b p-4">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
        <Skeleton className="h-7 rounded-none" />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex gap-3 border-b p-4">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-1">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="mt-0.5 h-5 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </div>
      <div className="hidden lg:block" />
    </div>
  )
}
