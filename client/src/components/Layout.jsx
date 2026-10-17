import { useEffect, useRef, useState } from 'react'
import { InboxIcon, LogOutIcon, PackageIcon, PlusIcon, SearchIcon, SendIcon } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
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
import { useAuth } from '@/lib/auth'
import { DEMO_OPEN_SIGNUP } from '@/lib/constants'

export function Layout() {
  const { user } = useAuth()

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b bg-card lg:sticky lg:top-0 lg:z-40">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 lg:flex-nowrap lg:gap-x-6">
          <Link to="/" className="mr-auto flex shrink-0 items-center gap-2 rounded-md font-semibold tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:mr-0" aria-label="Campus Sibling home">
            <img src="/logo-192.png" alt="" width="36" height="36" className="size-9" />
            <span className="text-lg">Campus Sibling</span>
          </Link>

          <HeaderSearch />

          <nav aria-label="Account" className="flex items-center gap-2">
            {user && (
              <Button variant="ghost" asChild className="hidden sm:inline-flex">
                <NavLink to="/dashboard" className="aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground">My stuff</NavLink>
              </Button>
            )}
            <Button asChild>
              <Link to="/sell">
                <PlusIcon data-icon="inline-start" />
                Sell
              </Link>
            </Button>
            {user === undefined ? (
              <Skeleton className="size-10 rounded-full" />
            ) : user ? (
              <AccountMenu user={user} />
            ) : (
              <Button variant="outline" asChild>
                <Link to="/login">Sign in</Link>
              </Button>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 lg:py-8">
        <Outlet />
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

function AccountMenu({ user }) {
  const { signOut } = useAuth()
  const initial = user.name?.[0]?.toUpperCase() ?? '?'

  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
              <Avatar className="size-10">
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
          <DropdownMenuItem asChild><Link to="/dashboard?tab=listings"><PackageIcon />My listings</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/dashboard?tab=received"><InboxIcon />Requests received</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to="/dashboard?tab=sent"><SendIcon />Requests sent</Link></DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onSelect={signOut}><LogOutIcon />Sign out</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
