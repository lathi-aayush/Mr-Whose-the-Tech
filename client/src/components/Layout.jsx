import { useCallback, useEffect, useRef, useState } from 'react'
import { BellIcon, CheckCheckIcon, LogOutIcon, MessageCircleIcon, MessagesSquareIcon, PackageIcon, PlusIcon, SearchIcon, UserRoundIcon } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { canPoll, onWake } from '@/lib/activity'
import { DEMO_OPEN_SIGNUP } from '@/lib/constants'

export function Layout() {
  const { user } = useAuth()
  const notifications = useNotifications(!!user)

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b bg-card lg:sticky lg:top-0 lg:z-40">
        {/* Phones: row 1 logo + actions, row 2 full-width search. Desktop: one row. */}
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-2 gap-y-2.5 px-4 py-2.5 sm:gap-x-3 lg:flex-nowrap lg:gap-x-6">
          <Link to="/" className="mr-auto flex shrink-0 items-center gap-2 rounded-md font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:mr-0" aria-label="Campus Sibling home">
            <img src="/logo-192.png" alt="" width="36" height="36" className="size-9" />
            {/* Wordmark drops on phones so logo + actions fit one row; the link keeps its aria-label. */}
            <span className="hidden text-lg sm:inline">Campus Sibling</span>
          </Link>

          <HeaderSearch />

          {/* ml-auto: search is capped at max-w-2xl, so without it the actions stop short of the right edge. */}
          <nav aria-label="Account" className="flex shrink-0 items-center gap-1 sm:gap-2 lg:ml-auto">
            {user && (
              <>
                <Button variant="ghost" asChild className="hidden sm:inline-flex">
                  <NavLink to="/dashboard" className="aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground">My listings</NavLink>
                </Button>
                {/* Icon-only on phones, so it gets a tooltip there. */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" asChild className="px-2.5 sm:px-3">
                      <NavLink to="/chats" aria-label={notifications.length ? `Chats, ${notifications.length} unread` : 'Chats'} className="aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground">
                        <MessagesSquareIcon data-icon="inline-start" />
                        <span className="hidden sm:inline">Chats</span>
                        {notifications.length > 0 && (
                          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white" aria-hidden="true">
                            {notifications.length > 9 ? '9+' : notifications.length}
                          </span>
                        )}
                      </NavLink>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="sm:hidden">Chats</TooltipContent>
                </Tooltip>
              </>
            )}
            <Button asChild>
              <Link to="/sell">
                <PlusIcon data-icon="inline-start" />
                Sell
              </Link>
            </Button>
            {user === undefined ? (
              <Skeleton className="size-9 rounded-full" />
            ) : user ? (
              <>
                <NotificationsMenu items={notifications} />
                <AccountMenu user={user} />
              </>
            ) : (
              <Button variant="outline" asChild>
                <Link to="/login">Sign in</Link>
              </Button>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 lg:py-8">
        <Outlet context={notifications} />
      </main>

      <footer className="border-t bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p><span className="font-semibold text-foreground">Campus Sibling</span> · Reuse before you buy.</p>
          {DEMO_OPEN_SIGNUP && <p>Demo build: sign-up open to any email (production: one campus only).</p>}
        </div>
      </footer>
    </div>
  )
}

// One search box for the whole site, like every marketplace header. Typing on Browse filters live.
function HeaderSearch() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const onBrowse = location.pathname === '/'
  const urlQ = onBrowse ? params.get('q') ?? '' : ''
  const [q, setQ] = useState(urlQ)
  const inputRef = useRef(null)

  // Follow back/forward and chip removal, but don't clobber a trailing space mid-typing.
  useEffect(() => {
    setQ((cur) => (cur.trim() === urlQ ? cur : urlQ))
  }, [urlQ])

  useEffect(() => {
    if (!onBrowse || q.trim() === urlQ) return
    const t = setTimeout(() => go(q, true), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function go(value, replace) {
    const next = onBrowse ? new URLSearchParams(params) : new URLSearchParams()
    if (value.trim()) next.set('q', value.trim())
    else next.delete('q')
    navigate({ pathname: '/', search: next.toString() }, { replace })
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        go(q, onBrowse)
        inputRef.current?.blur()
      }}
      className="order-last w-full lg:order-none lg:max-w-2xl lg:flex-1"
    >
      <InputGroup className="h-11 bg-muted/60 has-[input:focus]:bg-card">
        <InputGroupAddon><SearchIcon /></InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search books, calculators, lab coats…"
          aria-label="Search listings"
          aria-keyshortcuts="/"
          className="text-[15px]"
        />
        <InputGroupAddon align="inline-end" className="hidden lg:flex">
          <kbd className="border bg-card px-1.5 font-mono text-xs" aria-hidden="true">/</kbd>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}

// Each poll is 2 Data Store fetches against a 10,000/month free quota: 30s while active, nothing while
// the tab is hidden or idle, and never twice within 5s. Chats reloads its list off this poll's result.
const NOTIFY_POLL_MS = 30000
const NOTIFY_MIN_GAP_MS = 5000

// ponytail: polling, not push. Upgrade path: Catalyst Signals.
const TOAST_TEXT = {
  accepted: (n) => `Seller accepted your request for ${n.listing_title}`,
  request: (n) => `New request for ${n.listing_title}`,
  message: (n) => `${n.listing_title}: ${n.preview || 'New message'}`,
}

// Shared by the Chats link badge, the bell and the tab title, so one poll serves all three.
function useNotifications(enabled) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [items, setItems] = useState([])
  // null until the first fetch, so reloading the page doesn't toast old items again.
  const seen = useRef(null)
  // Read inside refresh() so changing page doesn't recreate it and restart the poll.
  const pathRef = useRef(pathname)
  pathRef.current = pathname
  const lastRef = useRef(0)

  // force: route changes ask even inside the gap so opening a chat clears its badge promptly.
  const refresh = useCallback(async (force = false) => {
    if (!enabled || !canPoll()) return
    if (!force && Date.now() - lastRef.current < NOTIFY_MIN_GAP_MS) return
    lastRef.current = Date.now()
    try {
      const data = await api('/me/notifications')
      setItems(data.items)
      // Keyed by `at` for messages, so each new message toasts once; the others once per request.
      const keys = data.items.map((n) => ({ key: `${n.kind}-${n.inquiry_id}-${n.kind === 'message' ? n.at : ''}`, n }))
      if (seen.current) {
        for (const { key, n } of keys.filter((k) => !seen.current.has(k.key))) {
          // The chat you're looking at already shows it; the server marks it read within seconds.
          if (pathRef.current === `/chats/${n.inquiry_id}`) continue
          toast(TOAST_TEXT[n.kind](n), {
            action: { label: 'Open', onClick: () => navigate(`/chats/${n.inquiry_id}`) },
          })
        }
      }
      seen.current = new Set(keys.map((k) => k.key))
    } catch {
      // Bell is a convenience; keep the last known list and retry next tick.
    }
  }, [enabled, navigate])

  // "(2) Campus Sibling" in the tab, like a messaging app.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s/, '')
    document.title = items.length ? `(${items.length}) ${base}` : base
    return () => {
      document.title = base
    }
  }, [items.length])

  useEffect(() => {
    const timer = setInterval(() => refresh(), NOTIFY_POLL_MS)
    const off = onWake(() => refresh())
    return () => {
      clearInterval(timer)
      off()
    }
  }, [refresh])

  // Delay lets a just-opened chat mark itself read before we ask what's still unread.
  useEffect(() => {
    const t = setTimeout(() => refresh(true), pathname.startsWith('/chats') ? 1500 : 0)
    return () => clearTimeout(t)
  }, [pathname, refresh])

  return items
}

const NOTIFICATION_LABEL = {
  accepted: 'Seller accepted your request for ',
  request: 'New request for ',
  message: 'New message about ',
}

const notificationLabel = (n) => (n.kind === 'message' && n.count > 1 ? `${n.count} new messages about ` : NOTIFICATION_LABEL[n.kind])

function NotificationsMenu({ items }) {
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative rounded-full" aria-label={items.length ? `Notifications, ${items.length} unread` : 'Notifications'}>
              <BellIcon />
              {items.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white" aria-hidden="true">
                  {items.length > 9 ? '9+' : items.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Notifications</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
            <CheckCheckIcon className="size-4" aria-hidden="true" />
            You're all caught up
          </p>
        ) : (
          <DropdownMenuGroup>
            {items.map((n) => (
              <DropdownMenuItem key={`${n.kind}-${n.inquiry_id}`} asChild>
                <Link to={`/chats/${n.inquiry_id}`} className="items-start">
                  <MessageCircleIcon />
                  <span className="min-w-0 whitespace-normal">
                    {notificationLabel(n)}
                    <span className="font-semibold">{n.listing_title}</span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AccountMenu({ user }) {
  const { signOut } = useAuth()
  const initial = user.name?.[0]?.toUpperCase() ?? '?'

  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
              <Avatar className="size-8">
                <AvatarFallback className="bg-ink-900 font-semibold text-white">{initial}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Account</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate text-sm font-semibold text-foreground">{user.name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild><Link to="/profile"><UserRoundIcon />Profile</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/dashboard"><PackageIcon />My listings</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/chats"><MessagesSquareIcon />Chats</Link></DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onSelect={signOut}><LogOutIcon />Sign out</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
