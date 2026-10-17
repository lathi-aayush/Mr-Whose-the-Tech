import { SearchXIcon } from 'lucide-react'
import { Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Button } from './components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './components/ui/empty'
import { Skeleton } from './components/ui/skeleton'
import { useAuth } from './lib/auth'
import Browse from './pages/Browse'
import Chats from './pages/Chats'
import Dashboard from './pages/Dashboard'
import ListingDetail from './pages/ListingDetail'
import Login from './pages/Login'
import Profile from './pages/Profile'
import Sell from './pages/Sell'
import SmokeTest from './pages/SmokeTest'

function RequireAuth({ children }) {
  const { user } = useAuth()
  const location = useLocation()
  if (user === undefined) return <Skeleton className="h-96 w-full rounded-xl" />
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return children
}

// Early notification emails linked to /chat/:id; chats now live on /chats.
function LegacyChatRedirect() {
  const { id } = useParams()
  return <Navigate to={`/chats/${id}`} replace />
}

function NotFound() {
  return (
    <Empty className="min-h-80">
      <EmptyHeader>
        <EmptyMedia variant="icon"><SearchXIcon /></EmptyMedia>
        <EmptyTitle>Page not found</EmptyTitle>
        <EmptyDescription>The link may be old or the listing was removed.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild><Link to="/">Back to listings</Link></Button>
      </EmptyContent>
    </Empty>
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
        <Route path="profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="chats" element={<RequireAuth><Chats /></RequireAuth>} />
        <Route path="chats/:id" element={<RequireAuth><Chats /></RequireAuth>} />
        <Route path="chat/:id" element={<LegacyChatRedirect />} />
        <Route path="login" element={<Login />} />
        <Route path="smoke" element={<SmokeTest />} />
        {/* The Catalyst SDK can still redirect to the legacy /app/ path; Slate serves from root. */}
        <Route path="app/*" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
