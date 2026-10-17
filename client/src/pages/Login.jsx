import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Field, Skeleton, inputClass, primaryButton } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { mountSignIn, safeNext } from '../lib/catalyst'
import { CAMPUS_DOMAIN } from '../lib/constants'

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
  const tabClass = (t) =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${tab === t ? 'bg-white text-ink-900 shadow-sm' : 'text-stone-600 hover:text-stone-900'}`

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Welcome to Campus Sibling</h1>
      <p className="mt-1 text-stone-600">Only students with an <strong>@{CAMPUS_DOMAIN}</strong> email can join.</p>

      <div role="tablist" aria-label="Account" className="mt-6 flex gap-1 rounded-xl bg-stone-100 p-1">
        <button type="button" role="tab" aria-selected={tab === 'signin'} className={tabClass('signin')} onClick={() => setTab('signin')}>Sign in</button>
        <button type="button" role="tab" aria-selected={tab === 'signup'} className={tabClass('signup')} onClick={() => setTab('signup')}>Create account</button>
      </div>

      <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
        {!checked ? (
          <Skeleton className="h-[500px] w-full" />
        ) : tab === 'signin' ? (
          <SignIn next={next} />
        ) : (
          <SignUp onDone={() => setTab('signin')} />
        )}
      </div>
    </div>
  )
}

function SignIn({ next }) {
  const [error, setError] = useState(null)

  useEffect(() => {
    mountSignIn('login-container', next).catch((e) => setError(e.message))
  }, [next])

  if (error) return <p role="alert" className="text-sm text-rose-700">{error}. Refresh the page to try again.</p>
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
      <div className="fade-in space-y-3 text-sm text-stone-700">
        <p className="rounded-lg bg-brand-50 p-3 font-medium text-brand-900">{status.message}</p>
        <p>Open the email from Catalyst, set your password, then come back and sign in.</p>
        <button type="button" onClick={onDone} className={primaryButton}>Go to sign in</button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name">
          <input required maxLength={50} value={form.first_name} onChange={set('first_name')} className={inputClass} autoComplete="given-name" />
        </Field>
        <Field label="Last name">
          <input maxLength={50} value={form.last_name} onChange={set('last_name')} className={inputClass} autoComplete="family-name" />
        </Field>
      </div>
      <Field label="Campus email" hint="We'll send a link to set your password.">
        <input required type="email" value={form.email} onChange={set('email')} className={inputClass} placeholder={`you@${CAMPUS_DOMAIN}`} autoComplete="email" />
      </Field>
      {status.error && <p role="alert" className="text-sm text-rose-700">{status.error}</p>}
      <button type="submit" disabled={status.busy} className={`${primaryButton} w-full`}>
        {status.busy ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  )
}
