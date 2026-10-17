import { cloneElement, useEffect, useId, useState } from 'react'

// Shows on hover and keyboard focus, dismisses on Escape without moving focus.
export function Tooltip({ label, shortcut, children, side = 'top' }) {
  const id = useId()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const show = () => setOpen(true)
  const hide = () => setOpen(false)
  const position = side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'

  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {cloneElement(children, { 'aria-describedby': id })}
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-stone-900 px-2 py-1 text-xs text-white shadow transition duration-150 ${position} ${
          open ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        {label}
        {shortcut && <kbd className="ml-2 rounded bg-stone-700 px-1 font-mono text-[10px]">{shortcut}</kbd>}
      </span>
    </span>
  )
}

export function IconButton({ label, shortcut, children, className = '', ...props }) {
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-brand-600 ${className}`}
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  )
}

export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`skeleton rounded-md ${className}`} />
}

const STATUS_STYLES = {
  Available: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  Reserved: 'bg-accent-50 text-accent-700 ring-accent-500/20',
  Completed: 'bg-stone-100 text-stone-600 ring-stone-500/20',
  Pending: 'bg-sky-50 text-sky-800 ring-sky-600/20',
  Accepted: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  Declined: 'bg-rose-50 text-rose-700 ring-rose-600/20',
}
const STATUS_HELP = {
  Available: 'Open for inquiries',
  Reserved: 'Seller accepted an inquiry; handover pending',
  Completed: 'Exchange done; no longer available',
  Pending: 'Waiting for the seller to respond',
  Accepted: 'Seller accepted; contact details unlocked',
  Declined: 'Seller declined or the item went to someone else',
}

export function StatusBadge({ status }) {
  return (
    <Tooltip label={STATUS_HELP[status] ?? status}>
      <span
        tabIndex={0}
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status] ?? ''}`}
      >
        {status}
      </span>
    </Tooltip>
  )
}

export function ErrorState({ message, onRetry, className = '' }) {
  return (
    <div role="alert" className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-6 text-center ${className}`}>
      <p className="text-sm text-rose-800">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-rose-800 ring-1 ring-rose-300 hover:bg-rose-100">
          Try again
        </button>
      )}
    </div>
  )
}

const CATEGORY_ICON = {
  Books: 'M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5Zm2 14h12',
  'Calculators & Electronics': 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm1 3h8v3H8V6Zm0 6h2m3 0h2m-7 3h2m3 0h2m-7 3h2m3 0h2',
  'Lab Supplies': 'M9 3h6m-5 0v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M7 15h10',
  Stationery: 'M4 20l4-1 11-11-3-3L5 16l-1 4Zm10-13 3 3',
  'Hostel Essentials': 'M3 11 12 4l9 7v9H3v-9Zm6 9v-6h6v6',
  Other: 'M4 7l8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7m-8 4v10',
}

// Built-in placeholder when a listing has no photo or while it loads.
export function CategoryArt({ category, className = '' }) {
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br from-brand-50 to-stone-100 ${className}`}>
      <svg viewBox="0 0 24 24" className="h-12 w-12 text-brand-600/60" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={CATEGORY_ICON[category] ?? CATEGORY_ICON.Other} />
      </svg>
    </div>
  )
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-stone-800">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && !error && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-rose-700">{error}</span>}
    </label>
  )
}

export const inputClass =
  'block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-stone-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20'

export const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-900 shadow-sm hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60'

export const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-stone-800 ring-1 ring-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60'
