import { useCallback, useEffect, useState } from 'react'
import { PackageOpenIcon } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { ListingCard, ListingCardSkeleton } from '@/components/ListingCard'
import { ErrorState } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { api } from '@/lib/api'

export default function Dashboard() {
  const [params] = useSearchParams()
  // Requests moved to /chats; keep old bookmarks and emails working.
  if (params.get('tab') === 'received' || params.get('tab') === 'sent') return <Navigate to="/chats" replace />

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">My listings</h1>
      <MyListings />
    </div>
  )
}

function MyListings() {
  const [state, setState] = useState({ loading: true, error: null, items: [] })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await api('/me/listings')
      setState({ loading: false, error: null, items: data.listings })
    } catch (e) {
      setState({ loading: false, error: e.message, items: [] })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (state.error) return <ErrorState message={state.error} onRetry={load} className="min-h-64" />
  if (state.loading && state.items.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4" aria-busy="true" aria-label="Loading">
        {Array.from({ length: 4 }, (_, i) => <ListingCardSkeleton key={i} />)}
      </div>
    )
  }
  if (state.items.length === 0) {
    return (
      <Empty className="fade-in min-h-64 border border-dashed bg-card">
        <EmptyHeader>
          <EmptyMedia variant="icon"><PackageOpenIcon /></EmptyMedia>
          <EmptyTitle>You haven't listed anything yet</EmptyTitle>
          <EmptyDescription>Got books or lab gear you no longer need?</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild><Link to="/sell">List an item</Link></Button>
        </EmptyContent>
      </Empty>
    )
  }
  return (
    <div className="fade-in grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {state.items.map((l) => <ListingCard key={l.ROWID} listing={l} />)}
    </div>
  )
}
