// ponytail: per-tab, 60s. Browse -> detail -> back reuses the list instead of rescanning Data Store
// (up to 3 fetches). api() clears it on any write, so your own changes show immediately; another
// user's new listing appears after 60s or a reload.
const TTL_MS = 60_000
let entry = null

export const getCachedListings = () => (entry && Date.now() - entry.at < TTL_MS ? entry.listings : null)
export const setCachedListings = (listings) => { entry = { at: Date.now(), listings } }
export const clearListingsCache = () => { entry = null }
