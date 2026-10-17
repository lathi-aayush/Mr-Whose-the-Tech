// Thin wrapper over the Catalyst Web SDK loaded via <script> in index.html.

function sdk() {
  return window.catalyst
}

export async function waitForSdk(timeoutMs = 5000) {
  const start = Date.now()
  while (!sdk()?.auth) {
    if (Date.now() - start > timeoutMs) throw new Error('Catalyst SDK failed to load')
    await new Promise((r) => setTimeout(r, 50))
  }
  return sdk()
}

export async function isSignedIn() {
  const catalyst = await waitForSdk()
  try {
    await catalyst.auth.isUserAuthenticated()
    return true
  } catch {
    return false
  }
}

// Slate and Functions are on different origins, so cookies don't reach the API.
// The function reads this raw token from the Authorization header (no "Bearer" prefix).
export async function getAuthToken() {
  if (!(await isSignedIn())) return null
  const res = await sdk().auth.generateAuthToken()
  return res.access_token
}

export async function mountSignIn(containerId) {
  const catalyst = await waitForSdk()
  // Keys from the console's v4 embed snippet. service_url must be "/" on Slate; the console default "/app/index.html" 404s there.
  catalyst.auth.signIn(containerId, { service_url: '/', css_url: '/embedded-login.css' })
}

export function signOut() {
  // Returns nothing (not a promise). Slate is a separate origin, so this only clears the frontend session.
  sdk().auth.signOut(window.location.origin + '/')
}
