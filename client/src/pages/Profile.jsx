import { useEffect, useState } from 'react'
import { LockIcon } from 'lucide-react'
import { toast } from 'sonner'
import { ErrorState } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

export default function Profile() {
  const { refresh } = useAuth()
  const [state, setState] = useState({ loading: true, error: null })
  const [form, setForm] = useState({ name: '', phone: '' })
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function load() {
    setState({ loading: true, error: null })
    try {
      const p = await api('/me/profile')
      setForm({ name: p.name, phone: p.phone })
      setEmail(p.email)
      setState({ loading: false, error: null })
    } catch (e) {
      setState({ loading: false, error: e.message })
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function submit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const p = await api('/me/profile', { method: 'PATCH', body: form })
      setForm({ name: p.name, phone: p.phone })
      await refresh() // header avatar and menu read the name from /me
      toast.success('Profile saved')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      {state.error ? (
        <ErrorState message={state.error} onRetry={load} className="min-h-64" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Your details</CardTitle>
            <CardDescription>Your name shows on your listings and requests. Your phone is only shared if you choose to when accepting a request.</CardDescription>
          </CardHeader>
          <CardContent>
            {state.loading ? (
              <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading profile">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))}
                <Skeleton className="h-9 w-28" />
              </div>
            ) : (
              <form onSubmit={submit}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="name">Name</FieldLabel>
                    <Input id="name" required minLength={2} maxLength={80} autoComplete="name" value={form.name} onChange={set('name')} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <div className="relative">
                      <Input id="email" value={email} readOnly aria-describedby="email-help" className="bg-muted pr-9 text-muted-foreground" />
                      <LockIcon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    </div>
                    <FieldDescription id="email-help">Your email is your login and proves you're on campus, so it can't be changed here.</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="phone">Phone <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
                    <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="+91 98765 43210" value={form.phone} onChange={set('phone')} />
                    <FieldDescription>10–15 digits, optional leading +.</FieldDescription>
                  </Field>
                  {error && <FieldError>{error}</FieldError>}
                  <Button type="submit" disabled={saving} className="self-start">
                    {saving && <Spinner data-icon="inline-start" />}
                    {saving ? 'Saving…' : 'Save changes'}
                  </Button>
                </FieldGroup>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
