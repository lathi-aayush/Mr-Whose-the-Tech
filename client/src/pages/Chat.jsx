import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeftIcon, LockIcon, MailIcon, PhoneIcon, SendHorizontalIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from 'cn'
import { CategoryArt, ErrorState, IconButton, StatusBadge } from '@/components/common'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { timeAgoMs } from '@/lib/constants'

// ponytail: polling, not websockets. Advanced I/O functions are stateless request/response.
// Upgrade path: Catalyst Signals or an AppSail websocket if 3s latency stops being enough.
const POLL_MS = 3000
const TYPING_PING_MS = 2500

const clock = (ms) => new Date(Number(ms)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

// Fills its parent's height: header, scrolling messages, composer. The parent decides the size.
export function ChatPanel({ id, onBack }) {
  const [state, setState] = useState({ loading: true, error: null, meta: null })
  const [peer, setPeer] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const lastRef = useRef(0)
  const typingSentRef = useRef(0)
  const listRef = useRef(null)

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

  // Only re-render when presence actually changes, so idle polls cost nothing.
  const applyPeer = useCallback((next) => {
    setPeer((p) => (p && p.online === next.online && p.typing === next.typing && p.seenAt === next.seenAt ? p : next))
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
    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        const { messages: msgs, peer: p, ...meta } = await api(`/inquiries/${id}/messages?after=${lastRef.current}`)
        if (stop) return
        merge(msgs)
        applyPeer(p)
        // Only touch meta when the chat opens/closes.
        setState((s) => (s.meta && s.meta.canSend === meta.canSend ? s : { ...s, meta }))
      } catch {
        // Transient network error: the next tick retries.
      }
    }
    const timer = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      stop = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [id, ready, merge, applyPeer])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, ready, peer?.typing])

  function onDraftChange(value) {
    setDraft(value)
    const now = Date.now()
    if (value.trim() && now - typingSentRef.current > TYPING_PING_MS) {
      typingSentRef.current = now
      api(`/inquiries/${id}/typing`, { method: 'POST', body: {} }).catch(() => {}) // best-effort signal
    }
  }

  async function send() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setSendError(null)
    try {
      const { message } = await api(`/inquiries/${id}/messages`, { method: 'POST', body: { body: text } })
      merge([message])
      setDraft('')
      typingSentRef.current = 0
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

  return (
    <div className="fade-in flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b p-3">
        {onBack && (
          <IconButton label="Back to requests" shortcut="Esc" size="icon-sm" onClick={onBack} className="lg:hidden">
            <ArrowLeftIcon />
          </IconButton>
        )}
        <Avatar size="lg">
          <AvatarFallback className="bg-ink-900 font-semibold text-white">{meta.counterpart?.[0]?.toUpperCase() ?? '?'}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{meta.counterpart}</span>
          <PresenceLine peer={peer} />
        </div>
        <div className="hidden size-10 shrink-0 overflow-hidden rounded-md bg-muted sm:block">
          {cover ? <img src={cover} alt="" className="size-full object-cover" /> : <CategoryArt category={meta.listing?.category} className="size-full" />}
        </div>
        <StatusBadge status={meta.status} />
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/40 px-3 py-2 text-sm">
        {meta.listing ? (
          <Link to={`/listings/${meta.listing.ROWID}`} className="min-w-0 truncate font-medium underline-offset-4 hover:underline" title={meta.listing.title}>
            {meta.listing.title}
          </Link>
        ) : (
          <span className="font-medium">Listing removed</span>
        )}
        {meta.contact?.value && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <ContactIcon className="size-3.5" aria-hidden="true" />
            <a href={`${meta.contact.type === 'phone' ? 'tel' : 'mailto'}:${meta.contact.value}`} className="underline underline-offset-4">{meta.contact.value}</a>
          </span>
        )}
      </div>

      {meta.swap && <SwapOffer swap={meta.swap} />}

      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="Messages">
        {messages.length === 0 && (
          <p className="m-auto text-center text-sm text-muted-foreground">
            {meta.canSend ? `Say hi to ${meta.counterpart} and arrange the handover.` : 'No messages.'}
          </p>
        )}
        {messages.map((m) => {
          const mine = String(m.sender_id) === String(meta.me)
          return (
            <div key={m.ROWID} className={cn('flex max-w-[80%] flex-col gap-0.5', mine ? 'items-end self-end' : 'items-start self-start')}>
              <p className={cn('rounded-2xl px-3 py-2 break-words whitespace-pre-wrap', mine ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted')}>
                {m.body}
              </p>
              <span className="px-1 text-xs text-muted-foreground">{mine ? 'You' : m.sender_name} · {clock(m.sent_at)}</span>
            </div>
          )
        })}
      </div>

      {/* Fixed height so the composer doesn't jump when "typing…" appears. */}
      <div className="h-6 shrink-0 px-4 text-xs text-muted-foreground" aria-live="polite">
        {peer?.typing && meta.canSend && <TypingDots name={meta.counterpart} />}
      </div>

      {meta.canSend ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          className="flex shrink-0 flex-col gap-2 border-t p-3"
        >
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              rows={2}
              maxLength={1000}
              placeholder="Write a message…"
              aria-label="Message"
              className="min-h-14 flex-1 resize-none"
            />
            <IconButton label="Send message" shortcut="Enter" variant="default" size="icon-lg" type="submit" disabled={sending || !draft.trim()}>
              {sending ? <Spinner /> : <SendHorizontalIcon />}
            </IconButton>
          </div>
          {sendError && <p role="alert" className="text-sm text-destructive">{sendError}</p>}
        </form>
      ) : (
        <div className="shrink-0 border-t p-3">
          <Alert>
            <LockIcon />
            <AlertDescription>Chat closed: this request is no longer active.</AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  )
}

function PresenceLine({ peer }) {
  const online = !!peer?.online
  const label = online ? 'Online' : peer?.seenAt ? `Last seen ${timeAgoMs(peer.seenAt)}` : 'Offline'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn('size-2 rounded-full', online ? 'bg-emerald-500' : 'bg-muted-foreground/40')} aria-hidden="true" />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>{online ? 'Has this chat open right now' : 'Not in this chat right now'}</TooltipContent>
    </Tooltip>
  )
}

function TypingDots({ name }) {
  return (
    <span className="fade-in flex items-center gap-1.5">
      <span className="flex gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 150}ms` }} />
        ))}
      </span>
      {name} is typing…
    </span>
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

// Same header, list and composer heights as the loaded panel.
function ChatSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-busy="true" aria-label="Loading chat">
      <div className="flex items-center gap-3 border-b p-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex flex-1 flex-col gap-1">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-4">
        <Skeleton className="h-10 w-2/3 self-start rounded-2xl" />
        <Skeleton className="h-10 w-1/2 self-end rounded-2xl" />
        <Skeleton className="h-10 w-3/5 self-start rounded-2xl" />
        <Skeleton className="h-10 w-2/5 self-end rounded-2xl" />
      </div>
      <div className="h-6 shrink-0" />
      <div className="flex shrink-0 items-end gap-2 border-t p-3">
        <Skeleton className="h-14 flex-1 rounded-lg" />
        <Skeleton className="size-11 rounded-lg" />
      </div>
    </div>
  )
}
