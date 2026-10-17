import { getAuthToken } from './catalyst'
import { clearListingsCache } from './listingsCache'

const API_BASE = import.meta.env.VITE_API_BASE
if (!API_BASE) throw new Error('VITE_API_BASE is not set (see client/.env.example)')

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  if (method !== 'GET') clearListingsCache()
  const headers = { 'Content-Type': 'application/json' }
  const token = await getAuthToken()
  if (token) headers.Authorization = token

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  // A misconfigured base URL returns index.html with 200; catch it instead of failing on JSON.parse.
  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await res.json() : null
  if (!res.ok || !isJson) {
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`)
  }
  return data
}
