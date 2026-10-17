import { useCallback, useEffect, useRef, useState } from 'react'
import { LockIcon, MailIcon, PhoneIcon, SendHorizontalIcon } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { cn } from 'cn'
import { CategoryArt, ErrorState, IconButton, StatusBadge } from '@/components/common'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'

// ponytail: polling, not websockets. Advanced I/O functions are stateless request/response.
// Upgrade path: Catalyst Signals or an AppSail websocket if 4s latency stops being enough.
const POLL_MS = 4000
const LIST_HEIGHT = 'h-[min(60svh,34rem)]'

const clock = (ms) => new Date(Number(ms)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export default function Chat() {
  const { id } = useParams()
  const [state, setState] = useState({ loading: true, error: null, meta: null })
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)
  const lastRef = useRef(0)
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

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const { messages: msgs, ...meta } = await api(`/inquiries/${id}/messages`)
      lastRef.current = 0
      setMessages([])
      merge(msgs)
      setState({ loading: false, error: null, meta })
    } catch (e) {
      setState({ loading: false, error: e.message, meta: null })
    }
  }, [id, merge])

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
        const { messages: msgs, ...meta } = await api(`/inquiries/${id}/messages?after=${lastRef.current}`)
        if (stop) return
        merge(msgs)
        // Only touch meta when the chat opens/closes, so idle polls don't re-render.
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
  }, [id, ready, merge])

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
    } catch (e) {
      setSendError(e.message)
    } finally {
      setSending(false)
    }
  }

  if (state.error) return <ErrorState message={state.error} onRetry={load} className="mx-auto min-h-64 max-w-2xl" />
  if (state.loading && !state.meta) return <ChatSkeleton />

  const { meta } = state
  const cover = meta.listing?.image_urls?.[0]
  const ContactIcon = meta.contact?.type === 'phone' ? PhoneIcon : MailIcon

  return (
    <div className="fade-in mx-auto flex max-w-2xl flex-col gap-4">
      <Card>
        <CardContent className="flex items-center gap-3">
          <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
            {cover ? (
              <img src={cover} alt="" className="size-full object-cover" />
            ) : (
              <CategoryArt category={meta.listing?.category} className="size-full" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {meta.listing ? (
              <Link to={`/listings/${meta.listing.ROWID}`} className="truncate font-semibold underline-offset-4 hover:underline" title={meta.listing.title}>
                {meta.listing.title}
              </Link>
            ) : (
              <span className="font-semibold">Listing removed</span>
            )}
            <p className="truncate text-sm text-muted-foreground">
              Chat with {meta.counterpart}
              {meta.contact?.value && (
                <>
                  {' · '}
                  <ContactIcon className="inline size-3.5 align-[-2px]" aria-hidden="true" />{' '}
                  <a href={`${meta.contact.type === 'phone' ? 'tel' : 'mailto'}:${meta.contact.value}`} className="underline underline-offset-4">{meta.contact.value}</a>
                </>
              )}
            </p>
          </div>
          <StatusBadge status={meta.status} />
        </CardContent>
      </Card>

      <Card className="py-0">
        <div ref={listRef} className={cn('flex flex-col gap-2 overflow-y-auto p-4', LIST_HEIGHT)} role="log" aria-live="polite" aria-label="Messages">
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
      </Card>

      {meta.canSend ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
          className="flex flex-col gap-2"
        >
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
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
        <Alert>
          <LockIcon />
          <AlertDescription>Chat closed: this request is no longer active.</AlertDescription>
        </Alert>
      )}
    </div>
  )
}

// Same Card padding, list height and composer size as the loaded page.
function ChatSkeleton() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4" aria-busy="true" aria-label="Loading chat">
      <Card>
        <CardContent className="flex items-center gap-3">
          <Skeleton className="size-14 shrink-0 rounded-lg" />
          <div className="flex flex-1 flex-col gap-1">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-64 max-w-full" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </CardContent>
      </Card>
      <Card className="py-0">
        <div className={cn('flex flex-col gap-2 overflow-hidden p-4', LIST_HEIGHT)}>
          <Skeleton className="h-10 w-2/3 self-start rounded-2xl" />
          <Skeleton className="h-10 w-1/2 self-end rounded-2xl" />
          <Skeleton className="h-10 w-3/5 self-start rounded-2xl" />
          <Skeleton className="h-10 w-2/5 self-end rounded-2xl" />
        </div>
      </Card>
      <div className="flex items-end gap-2">
        <Skeleton className="h-14 flex-1 rounded-lg" />
        <Skeleton className="size-11 rounded-lg" />
      </div>
    </div>
  )
}
