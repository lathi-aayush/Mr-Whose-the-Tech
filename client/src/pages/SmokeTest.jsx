import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

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
    <Card className="max-w-lg">
      <CardHeader><CardTitle>Smoke test</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p>API health: <strong>{health}</strong></p>
        <p>Session: <strong>{user === undefined ? 'checking…' : user ? `${user.email} (campus: ${String(user.campusVerified)})` : 'signed out'}</strong></p>
      </CardContent>
    </Card>
  )
}
