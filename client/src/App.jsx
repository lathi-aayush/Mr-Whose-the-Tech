import { useEffect, useState } from 'react'
import { api } from './lib/api'
import { isSignedIn, mountSignIn, signOut } from './lib/catalyst'

// ponytail: smoke-test screen proving Slate -> function -> auth works end to end.
// Replaced by the real router once the deploy is verified.
export default function App() {
  const [health, setHealth] = useState('checking…')
  const [me, setMe] = useState(null)
  const [signedIn, setSignedIn] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api('/health')
      .then((d) => setHealth(d.status))
      .catch((e) => setHealth(`error: ${e.message}`))

    isSignedIn().then(async (ok) => {
      setSignedIn(ok)
      if (ok) {
        try {
          setMe(await api('/me'))
        } catch (e) {
          setError(e.message)
        }
      } else {
        mountSignIn('login-container')
      }
    })
  }, [])

  return (
    <main className="mx-auto max-w-xl p-4 font-sans">
      <h1 className="text-2xl font-semibold">Campus Exchange: smoke test</h1>
      <p className="mt-4">API health: <strong>{health}</strong></p>
      {signedIn === false && <div id="login-container" className="mt-6 min-h-96" />}
      {me && (
        <div className="mt-4">
          <p>Signed in as <strong>{me.email}</strong> (campus: {String(me.campusVerified)})</p>
          <button type="button" onClick={signOut} className="mt-3 rounded bg-gray-900 px-4 py-2 text-white">
            Sign out
          </button>
        </div>
      )}
      {error && <p className="mt-4 text-red-700" role="alert">{error}</p>}
    </main>
  )
}
