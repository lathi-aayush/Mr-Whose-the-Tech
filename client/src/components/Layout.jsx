import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Skeleton, Tooltip } from './ui'

const navClass = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-stone-600 hover:bg-stone-100'}`

export function Layout() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <Link to="/" className="mr-auto flex items-center gap-2 font-semibold text-stone-900">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">♻</span>
            <span className="hidden sm:inline">Campus Exchange</span>
          </Link>
          <NavLink to="/" end className={navClass}>Browse</NavLink>
          {user && <NavLink to="/dashboard" className={navClass}>My stuff</NavLink>}
          {user === undefined ? (
            <Skeleton className="h-9 w-20" />
          ) : user ? (
            <>
              <NavLink to="/sell" className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                + List item
              </NavLink>
              <Tooltip label={`Signed in as ${user.email}. Click to sign out.`} side="bottom">
                <button type="button" onClick={signOut} className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-200 text-sm font-semibold text-stone-700 hover:bg-stone-300" aria-label="Sign out">
                  {user.name?.[0]?.toUpperCase() ?? '?'}
                </button>
              </Tooltip>
            </>
          ) : (
            <NavLink to="/login" className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              Sign in
            </NavLink>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
