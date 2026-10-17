import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Skeleton, primaryButton } from './components/ui'
import { useAuth } from './lib/auth'
import Browse from './pages/Browse'
import Dashboard from './pages/Dashboard'
import ListingDetail from './pages/ListingDetail'
import Login from './pages/Login'
import Sell from './pages/Sell'
import SmokeTest from './pages/SmokeTest'

function RequireAuth({ children }) {
  const { user } = useAuth()
  const location = useLocation()
  if (user === undefined) return <Skeleton className="h-96 w-full rounded-xl" />
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return children
}

function NotFound() {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center text-center">
      <p className="text-lg font-semibold text-ink-900">Page not found</p>
      <Link to="/" className={`${primaryButton} mt-4`}>Back to listings</Link>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Browse />} />
        <Route path="listings/:id" element={<ListingDetail />} />
        <Route path="sell" element={<RequireAuth><Sell /></RequireAuth>} />
        <Route path="dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="login" element={<Login />} />
        <Route path="smoke" element={<SmokeTest />} />
        {/* The Catalyst SDK can still redirect to the legacy /app/ path; Slate serves from root. */}
        <Route path="app/*" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
