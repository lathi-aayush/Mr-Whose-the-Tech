import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

// Deploy check at /smoke: proves Slate -> function -> auth works without touching the data model.
export default function SmokeTest() {
  const { user } = useAuth()
  const [health, setHealth] = useState('checking…')

  useEffect(() => {
    api('/health')
      .then((d) => setHealth(d.status))
      .catch((e) => setHealth(`error: ${e.message}`))
  }, [])

  return (
    <div className="space-y-2 text-sm">
      <h1 className="text-xl font-semibold text-ink-900">Smoke test</h1>
      <p>API health: <strong>{health}</strong></p>
      <p>Session: <strong>{user === undefined ? 'checking…' : user ? `${user.email} (campus: ${String(user.campusVerified)})` : 'signed out'}</strong></p>
    </div>
  )
}
