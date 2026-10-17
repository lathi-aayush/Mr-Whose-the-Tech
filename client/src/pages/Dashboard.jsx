import { useCallback, useEffect, useId, useState } from 'react'
import { InboxIcon, MailIcon, MessageCircleIcon, PackageOpenIcon, PhoneIcon, SendIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ListingCard, ListingCardSkeleton } from '@/components/ListingCard'
import { ErrorState, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { OFFER_LABELS, timeAgo } from '@/lib/constants'

// Mirrors validateContactShare in functions/api/lib/rules.js; the server is the source of truth.
const PHONE_RE = /^\+?\d{10,15}$/
const cleanPhone = (p) => p.replace(/[\s\-()]/g, '')

// Mirrors unreadNotifications in rules.js so the row dot matches the header bell.
function isUnread(i, asSeller) {
  if (i.status !== 'Accepted') return false
  const readAt = Number(asSeller ? i.seller_read_at : i.buyer_read_at) || 0
  const me = asSeller ? i.seller_id : i.buyer_id
  if ((Number(i.last_message_at) || 0) > readAt && String(i.last_sender_id) !== String(me)) return true
  return !asSeller && !readAt
}

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

function InquiryRow({ inquiry, asSeller, onChanged }) {
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
      setBusy(false)
    }
  }

  const offer = OFFER_LABELS[inquiry.offer_type] ?? inquiry.offer_type
  // Buyer sees only what the seller chose to share; the server sends nothing else.
  const contact = asSeller ? { type: 'email', value: inquiry.buyer_email } : inquiry.seller_contact
  const ContactIcon = contact?.type === 'phone' ? PhoneIcon : MailIcon
  const unread = isUnread(inquiry, asSeller)
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
              <Button disabled={busy} onClick={() => setAccepting(true)}>Accept & reserve</Button>
              <Button variant="outline" disabled={busy} onClick={decline}>
                {busy && <Spinner data-icon="inline-start" />}
                {busy ? 'Declining…' : 'Decline'}
              </Button>
              <AcceptDialog inquiry={inquiry} open={accepting} onOpenChange={setAccepting} onDone={onChanged} />
            </div>
          )}
          {inquiry.status === 'Accepted' && contact?.value && (
            <p className="mt-1 flex flex-wrap items-center gap-1.5">
              <ContactIcon className="size-4 text-brand-700" aria-hidden="true" />
              {asSeller ? 'Contact the buyer:' : 'Accepted! Contact the seller:'}
              <a href={`${contact.type === 'phone' ? 'tel' : 'mailto'}:${contact.value}`} className="font-semibold text-brand-700 underline underline-offset-4">{contact.value}</a>
            </p>
          )}
          {asSeller && inquiry.status === 'Accepted' && (
            <p className="text-xs text-muted-foreground">
              You shared your {inquiry.shared_contact === 'phone' ? `phone number (${inquiry.seller_phone})` : 'email'} with this buyer.
            </p>
          )}
          {inquiry.status === 'Accepted' && (
            <div className="mt-1 flex items-center gap-2">
              <Button asChild>
                <Link to={`/chat/${inquiry.ROWID}`}>
                  <MessageCircleIcon data-icon="inline-start" />
                  Open chat
                </Link>
              </Button>
              {unread && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} role="img" aria-label="Unread" className="size-2.5 rounded-full bg-destructive" />
                  </TooltipTrigger>
                  <TooltipContent>{asSeller ? 'New message' : 'Seller accepted or sent a new message'}</TooltipContent>
                </Tooltip>
              )}
            </div>
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
