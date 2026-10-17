import { useEffect, useState } from 'react'
import { InfoIcon, MailCheckIcon } from 'lucide-react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { mountSignIn, safeNext } from '@/lib/catalyst'
import { CAMPUS_DOMAIN, DEMO_OPEN_SIGNUP } from '@/lib/constants'

export default function Login() {
  const [params, setParams] = useSearchParams()
  const { user, markSignedIn } = useAuth()
  const next = safeNext(params.get('next'))
  const tab = params.get('tab') === 'signup' ? 'signup' : 'signin'
  const [checked, setChecked] = useState(false)

  // Opening this page means the user wants to be signed in, so drop our local sign-out flag first.
  useEffect(() => {
    markSignedIn().finally(() => setChecked(true))
  }, [markSignedIn])

  if (checked && user) return <Navigate to={next} replace />

  const setTab = (t) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', t); return n }, { replace: true })

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Campus Sibling</h1>
        {!DEMO_OPEN_SIGNUP && <p className="mt-1 text-muted-foreground">Only students with an <strong>@{CAMPUS_DOMAIN}</strong> email can join.</p>}
      </div>
      {DEMO_OPEN_SIGNUP && (
        <Alert className="border-grape-500/25 bg-grape-50 text-grape-700">
          <InfoIcon />
          <AlertTitle>Demo mode</AlertTitle>
          <AlertDescription className="text-grape-700/90">
            Built for one campus: in production only @{CAMPUS_DOMAIN} emails can join. For the hackathon demo, sign-up is open to any email.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="signin">Sign in</TabsTrigger>
          <TabsTrigger value="signup">Create account</TabsTrigger>
        </TabsList>
        <Card className="mt-2">
          <CardContent>
            {!checked ? (
              <Skeleton className="h-[500px] w-full" />
            ) : (
              <>
                <TabsContent value="signin"><SignIn next={next} /></TabsContent>
                <TabsContent value="signup"><SignUp onDone={() => setTab('signin')} /></TabsContent>
              </>
            )}
          </CardContent>
        </Card>
      </Tabs>
    </div>
  )
}

function SignIn({ next }) {
  const [error, setError] = useState(null)

  useEffect(() => {
    mountSignIn('login-container', next).catch((e) => setError(e.message))
  }, [next])

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Sign-in box failed to load</AlertTitle>
        <AlertDescription>{error}. Refresh the page to try again.</AlertDescription>
      </Alert>
    )
  }
  return <div id="login-container" className="min-h-[500px]" />
}

function SignUp({ onDone }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '' })
  const [status, setStatus] = useState({ busy: false, error: null, message: null })
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setStatus({ busy: true, error: null, message: null })
    try {
      const { message } = await api('/signup', { method: 'POST', body: form })
      setStatus({ busy: false, error: null, message })
    } catch (err) {
      setStatus({ busy: false, error: err.message, message: null })
    }
  }

  if (status.message) {
    return (
      <div className="fade-in flex flex-col gap-4">
        <CardHeader className="px-0">
          <MailCheckIcon className="size-8 text-brand-700" aria-hidden="true" />
          <CardTitle>{status.message}</CardTitle>
          <CardDescription>Open the email from Catalyst, set your password, then come back and sign in.</CardDescription>
        </CardHeader>
        <Button onClick={onDone}>Go to sign in</Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <FieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="first_name">First name</FieldLabel>
            <Input id="first_name" required maxLength={50} value={form.first_name} onChange={set('first_name')} autoComplete="given-name" />
          </Field>
          <Field>
            <FieldLabel htmlFor="last_name">Last name</FieldLabel>
            <Input id="last_name" maxLength={50} value={form.last_name} onChange={set('last_name')} autoComplete="family-name" />
          </Field>
        </div>
        <Field data-invalid={!!status.error || undefined}>
          <FieldLabel htmlFor="email">{DEMO_OPEN_SIGNUP ? 'Email' : 'Campus email'}</FieldLabel>
          <Input
            id="email"
            required
            type="email"
            value={form.email}
            onChange={set('email')}
            aria-invalid={!!status.error || undefined}
            placeholder={DEMO_OPEN_SIGNUP ? 'you@example.com' : `you@${CAMPUS_DOMAIN}`}
            autoComplete="email"
          />
          {status.error ? <FieldError>{status.error}</FieldError> : <FieldDescription>We'll send a link to set your password.</FieldDescription>}
        </Field>
        <Button type="submit" size="lg" disabled={status.busy} className="w-full">
          {status.busy && <Spinner data-icon="inline-start" />}
          {status.busy ? 'Creating account…' : 'Create account'}
        </Button>
      </FieldGroup>
    </form>
  )
}
