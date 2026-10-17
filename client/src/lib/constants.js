// Mirrors functions/api/lib/rules.js; the server is the source of truth and rejects anything else.
export const CATEGORIES = ['Books', 'Calculators & Electronics', 'Lab Supplies', 'Stationery', 'Hostel Essentials', 'Other']
export const CONDITIONS = ['New', 'Like New', 'Good', 'Fair']
export const LISTING_TYPES = [
  { value: 'sell', label: 'For sale' },
  { value: 'swap', label: 'Swap' },
  { value: 'free', label: 'Free' },
]
export const SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
]
export const MAX_IMAGES = 5
// Display only; the function's ALLOWED_EMAIL_DOMAINS env var is what's enforced. Keep DEMO_OPEN_SIGNUP in sync with it ("*").
export const CAMPUS_DOMAIN = 'vit.edu'
export const DEMO_OPEN_SIGNUP = true
export const OFFER_LABELS = { sell: 'Wants to buy', swap: 'Wants to swap', free: 'Wants it free' }

export function typeLabel(value) {
  return LISTING_TYPES.find((t) => t.value === value)?.label ?? value
}

export function formatPrice(listing) {
  if (listing.listing_type === 'free') return 'Free'
  if (listing.listing_type === 'swap') return 'Swap'
  return `₹${Number(listing.price).toLocaleString('en-IN')}`
}

export const STATUSES = ['Available', 'Reserved', 'Completed']

// Catalyst timestamps look like "2026-10-17 10:00:00:123"; make them ISO-parseable.
export function parseCatalystTime(catalystTime) {
  return Date.parse(String(catalystTime).replace(' ', 'T').replace(/:(\d{3})$/, '.$1')) || 0
}

export function timeAgo(catalystTime) {
  return timeAgoMs(parseCatalystTime(catalystTime))
}

// Same wording for epoch-ms values (chat timestamps, last seen).
export function timeAgoMs(t) {
  if (!t) return ''
  const mins = Math.round((Date.now() - t) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
