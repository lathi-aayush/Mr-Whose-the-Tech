import { Fragment, useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowLeftIcon, CheckCheckIcon, FlagIcon, LockIcon, MailIcon, PhoneIcon, SendHorizontalIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from 'cn'
import { toast } from 'sonner'
import { CategoryArt, ErrorState, IconButton, StatusBadge } from '@/components/common'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel, FieldTitle } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { canPoll, onWake } from '@/lib/activity'
import { api } from '@/lib/api'
import { formatPrice } from '@/lib/constants'

// ponytail: polling, not websockets. Advanced I/O functions are stateless request/response, and every
// poll is 2 Data Store fetches against a 10,000/month free quota. So: 5s after any activity, doubling
// to 30s while quiet, nothing while the tab is hidden or idle.
// Upgrade path: Catalyst Signals or an AppSail websocket (would also bring back online/typing).
const POLL_MIN_MS = 5000
const POLL_MAX_MS = 30000

function dayLabel(ms) {
  const d = new Date(Number(ms))
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (d.toDateString() === now.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

const clock = (ms) => new Date(Number(ms)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

// Fills its parent's height: header, scrolling messages, composer. The parent decides the size.
export function ChatPanel({ id, onBack, onActivity }) {
  const [state, setState] = useState({ loading: true, error: null, meta: null })
  const [peer, setPeer] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const [reporting, setReporting] = useState(false)
  const lastRef = useRef(0)
  const listRef = useRef(null)
  const delayRef = useRef(POLL_MIN_MS)
  const wakeRef = useRef(() => {})
  // Latest callback without restarting the poll effect when the parent re-renders.
  const activityRef = useRef(onActivity)
  activityRef.current = onActivity

  // Dedupe by ROWID: a sent message can arrive from both the POST response and the next poll.
  const merge = useCallback((incoming) => {
    if (!incoming.length) return
    lastRef.current = Math.max(lastRef.current, ...incoming.map((m) => Number(m.sent_at)))
    setMessages((cur) => {
      const seen = new Set(cur.map((m) => String(m.ROWID)))
      const fresh = incoming.filter((m) => !seen.has(String(m.ROWID)))
      return fresh.length ? [...cur, ...fresh].sort((a, b) => Number(a.sent_at) - Number(b.sent_at)) : cur
    })
  }, [])

  // Only re-render when the peer's read mark moves, so idle polls cost nothing.
  const applyPeer = useCallback((next) => {
    setPeer((p) => (p && p.readAt === next.readAt ? p : next))
  }, [])

  const load = useCallback(async () => {
    lastRef.current = 0
    setMessages([])
    setPeer(null)
    setState({ loading: true, error: null, meta: null })
    try {
      const { messages: msgs, peer: p, ...meta } = await api(`/inquiries/${id}/messages`)
      merge(msgs)
      applyPeer(p)
      setState({ loading: false, error: null, meta })
    } catch (e) {
      setState({ loading: false, error: e.message, meta: null })
    }
  }, [id, merge, applyPeer])

  useEffect(() => {
    load()
  }, [load])

  const ready = !!state.meta
  useEffect(() => {
    if (!ready) return
    let stop = false
    let busy = false
    let timer
    const schedule = () => {
      clearTimeout(timer)
      if (!stop) timer = setTimeout(tick, delayRef.current)
    }
    async function tick() {
      if (busy) return
      if (canPoll()) {
        busy = true
        try {
          // Ticks return only canSend/status/peer/messages; the header meta came with the first load.
          const { messages: msgs, peer: p, canSend, status } = await api(`/inquiries/${id}/messages?after=${lastRef.current}`)
          if (stop) return
          merge(msgs)
          applyPeer(p)
          setState((s) => (s.meta.canSend === canSend && s.meta.status === status ? s : { ...s, meta: { ...s.meta, canSend, status } }))
          if (msgs.length) activityRef.current?.()
          delayRef.current = msgs.length ? POLL_MIN_MS : Math.min(delayRef.current * 2, POLL_MAX_MS)
        } catch {
          // Transient network error: the next tick retries.
        } finally {
          busy = false
        }
      }
      schedule()
    }
    // After sending, expect a reply soon: go back to the fast interval without polling right now.
    wakeRef.current = () => {
      delayRef.current = POLL_MIN_MS
      schedule()
    }
    const off = onWake(() => {
      delayRef.current = POLL_MIN_MS
      clearTimeout(timer)
      tick()
    })
    schedule()
    return () => {
      stop = true
      clearTimeout(timer)
      off()
    }
  }, [id, ready, merge, applyPeer])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, ready])

  async function send() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setSendError(null)
    try {
      const { message } = await api(`/inquiries/${id}/messages`, { method: 'POST', body: { body: text } })
      merge([message])
      setDraft('')
      wakeRef.current()
      activityRef.current?.()
    } catch (e) {
      setSendError(e.message)
    } finally {
      setSending(false)
    }
  }

  if (state.error) return <ErrorState message={state.error} onRetry={load} className="h-full border-0" />
  if (!state.meta) return <ChatSkeleton />

  const { meta } = state
  const cover = meta.listing?.image_urls?.[0]
  const ContactIcon = meta.contact?.type === 'phone' ? PhoneIcon : MailIcon
  const lastMine = messages.findLast((m) => String(m.sender_id) === String(meta.me))

  return (
    <div className="fade-in flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b px-4 py-3">
        {onBack && (
          <IconButton label="Back to requests" shortcut="Esc" size="icon-sm" onClick={onBack} className="lg:hidden">
            <ArrowLeftIcon />
          </IconButton>
        )}
        <Avatar className="size-11">
          <AvatarFallback className="bg-ink-900 text-base font-semibold text-white">{meta.counterpart?.[0]?.toUpperCase() ?? '?'}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-base leading-tight font-semibold">{meta.counterpart}</span>
          <span className="text-xs text-muted-foreground">{meta.role === 'buyer' ? 'Seller' : 'Buyer'}</span>
        </div>
        {meta.canSend && (
          <IconButton label="Report user" size="icon-sm" onClick={() => setReporting(true)}>
            <FlagIcon />
          </IconButton>
        )}
      </header>

      {/* The item stays pinned above the conversation: photo, price, status, and the contact the seller chose to share. */}
      <div className="flex items-center gap-3 border-b bg-card px-4 py-3">
        <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10">
          {cover ? <img src={cover} alt="" className="size-full object-cover" /> : <CategoryArt category={meta.listing?.category} className="size-full" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {meta.listing ? (
            <Link to={`/listings/${meta.listing.ROWID}`} className="truncate font-semibold underline-offset-4 hover:underline" title={meta.listing.title}>
              {meta.listing.title}
            </Link>
          ) : (
            <span className="font-semibold">Listing removed</span>
          )}
          <div className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
            {meta.listing?.listing_type && <span className="font-semibold text-foreground">{formatPrice(meta.listing)}</span>}
            {meta.contact?.value && (
              <span className="flex min-w-0 items-center gap-1">
                <ContactIcon className="size-3.5 shrink-0" aria-hidden="true" />
                <a href={`${meta.contact.type === 'phone' ? 'tel' : 'mailto'}:${meta.contact.value}`} className="truncate underline underline-offset-4">{meta.contact.value}</a>
              </span>
            )}
          </div>
        </div>
        <StatusBadge status={meta.status} />
      </div>

      {meta.swap && <SwapOffer swap={meta.swap} />}

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto bg-muted/40 px-4 py-4" role="log" aria-live="polite" aria-label="Messages">
        {messages.length === 0 && (
          <p className="m-auto max-w-64 text-center text-sm text-muted-foreground">
            {meta.canSend ? `Say hi to ${meta.counterpart} and arrange the handover.` : 'No messages.'}
          </p>
        )}
        {messages.map((m, i) => {
          const mine = String(m.sender_id) === String(meta.me)
          const seen = m === lastMine && !!peer?.readAt && peer.readAt >= Number(m.sent_at)
          const day = dayLabel(m.sent_at)
          const newDay = i === 0 || day !== dayLabel(messages[i - 1].sent_at)
          const newSender = i > 0 && !newDay && messages[i - 1].sender_id !== m.sender_id
          return (
            <Fragment key={m.ROWID}>
              {newDay && (
                <div className="my-2 flex justify-center">
                  <span className="rounded-full bg-background px-3 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-foreground/10">{day}</span>
                </div>
              )}
              <div className={cn('flex max-w-[78%] flex-col gap-0.5', mine ? 'items-end self-end' : 'items-start self-start', newSender && 'mt-2')}>
                <p className={cn('rounded-2xl px-3.5 py-2 break-words whitespace-pre-wrap shadow-xs', mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-card ring-1 ring-foreground/10')}>
                  {m.body}
                </p>
                <span className="px-1 text-[11px] text-muted-foreground">
                  {clock(m.sent_at)}
                  {seen && <> · <CheckCheckIcon className="inline size-3.5 text-brand-700" aria-hidden="true" /> Seen</>}
                </span>
              </div>
            </Fragment>
          )
        })}
      </div>

      {meta.canSend ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          className="shrink-0 border-t bg-card p-3"
        >
          <div className="flex items-end gap-2 rounded-2xl border bg-background p-1.5 pl-4 transition focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              rows={1}
              maxLength={1000}
              placeholder="Write a message…"
              aria-label="Message"
              className="max-h-32 min-h-10 flex-1 resize-none rounded-none border-0 bg-transparent px-0 py-2 shadow-none focus-visible:border-0 focus-visible:ring-0"
            />
            <IconButton label="Send message" shortcut="Enter" variant="default" size="icon" type="submit" disabled={sending || !draft.trim()} className="rounded-xl">
              {sending ? <Spinner /> : <SendHorizontalIcon />}
            </IconButton>
          </div>
          {sendError && <p role="alert" className="mt-2 text-sm text-destructive">{sendError}</p>}
        </form>
      ) : (
        <div className="shrink-0 border-t bg-card p-3">
          <Alert>
            <LockIcon />
            <AlertDescription>Chat closed: this request is no longer active.</AlertDescription>
          </Alert>
        </div>
      )}

      <ReportDialog
        id={id}
        name={meta.counterpart}
        open={reporting}
        onOpenChange={setReporting}
        onDone={() => {
          load()
          activityRef.current?.()
        }}
      />
    </div>
  )
}

// Reporting closes the chat server-side (request becomes Declined), so the panel reloads into its read-only state.
const REPORT_REASONS = ['Harassment or abusive language', 'Spam or scam', 'Inappropriate content', 'No-show or unreliable', 'Other']

function ReportDialog({ id, name, open, onOpenChange, onDone }) {
  const uid = useId()
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (!reason) return setError('Pick a reason')
    setBusy(true)
    setError(null)
    try {
      await api(`/inquiries/${id}/report`, { method: 'POST', body: { reason, details } })
      toast.success('Report sent. Chat closed.')
      onOpenChange(false)
      onDone()
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
            <DialogTitle>Report {name}</DialogTitle>
            <DialogDescription>An admin reviews the report with the last messages. Reporting closes this chat for both of you.</DialogDescription>
          </DialogHeader>

          <RadioGroup value={reason} onValueChange={(v) => { setReason(v); setError(null) }} aria-label="Reason">
            {REPORT_REASONS.map((r, i) => (
              <FieldLabel key={r} htmlFor={`${uid}-r${i}`}>
                <Field orientation="horizontal">
                  <FieldTitle>{r}</FieldTitle>
                  <RadioGroupItem value={r} id={`${uid}-r${i}`} />
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>

          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Details (optional)"
            aria-label="Details"
          />
          {error && <FieldError>{error}</FieldError>}

          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={busy || !reason}>
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? 'Reporting…' : 'Report and close chat'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// What the buyer offers in exchange, pinned above the messages.
export function SwapOffer({ swap, className }) {
  return (
    <div className={cn('flex flex-col gap-2 border-b bg-brand-50/60 px-3 py-2 text-sm', className)}>
      <p>
        <span className="font-semibold">Offers in swap:</span> {swap.item}
      </p>
      {swap.image_urls?.length > 0 && (
        <ul className="flex gap-2">
          {swap.image_urls.map((url, i) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer" className="block size-14 overflow-hidden rounded-md ring-1 ring-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50">
                <img src={url} alt={`Swap item photo ${i + 1}`} className="size-full object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Same header, product card, message area and composer heights as the loaded panel.
function ChatSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy="true" aria-label="Loading chat">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Skeleton className="size-11 rounded-full" />
        <div className="flex flex-1 flex-col gap-1">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-14" />
        </div>
      </div>
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Skeleton className="size-12 rounded-lg" />
        <div className="flex flex-1 flex-col gap-1">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-5 w-32" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden bg-muted/40 p-4">
        <Skeleton className="h-10 w-2/3 self-start rounded-2xl" />
        <Skeleton className="h-10 w-1/2 self-end rounded-2xl" />
        <Skeleton className="h-10 w-3/5 self-start rounded-2xl" />
        <Skeleton className="h-10 w-2/5 self-end rounded-2xl" />
      </div>
      <div className="shrink-0 border-t p-3">
        <Skeleton className="h-[54px] w-full rounded-2xl" />
      </div>
    </div>
  )
}
