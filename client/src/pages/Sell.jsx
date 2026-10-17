import { useEffect, useRef, useState } from 'react'
import { ImagePlusIcon, XIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AttrIcon, CATEGORY_META, CONDITION_META, EXCHANGE_META, IconButton } from '@/components/common'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { api } from '@/lib/api'
import { CATEGORIES, CONDITIONS, LISTING_TYPES, MAX_IMAGES } from '@/lib/constants'
import { compressImage, uploadImage } from '@/lib/image'

export default function Sell() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ title: '', description: '', category: '', item_condition: '', listing_type: 'sell', price: '' })
  const [photos, setPhotos] = useState([]) // { id, preview, blob }
  const [status, setStatus] = useState({ busy: false, step: '', error: null })
  // Radix Select has no native `required` bubble, so missing picks are flagged after a submit attempt.
  const [tried, setTried] = useState(false)

  // Free preview object URLs on unmount only; a [photos] cleanup would revoke previews that are still shown.
  const photosRef = useRef(photos)
  photosRef.current = photos
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), [])

  const setValue = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const set = (key) => (e) => setValue(key, e.target.value)

  async function addPhotos(e) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_IMAGES - photos.length)
    e.target.value = ''
    setStatus((s) => ({ ...s, error: null }))
    try {
      const added = await Promise.all(
        files.map(async (file) => {
          const blob = await compressImage(file)
          return { id: crypto.randomUUID(), blob, preview: URL.createObjectURL(blob) }
        }),
      )
      setPhotos((p) => [...p, ...added])
    } catch (err) {
      setStatus((s) => ({ ...s, error: err.message }))
    }
  }

  function removePhoto(id) {
    const gone = photos.find((x) => x.id === id)
    if (gone) URL.revokeObjectURL(gone.preview)
    setPhotos((p) => p.filter((x) => x.id !== id))
  }

  async function submit(e) {
    e.preventDefault()
    setTried(true)
    if (!form.category || !form.item_condition) return
    if (photos.length === 0) return setStatus({ busy: false, step: '', error: 'Add at least one photo.' })
    setStatus({ busy: true, step: 'Uploading photos…', error: null })
    try {
      const image_urls = await Promise.all(photos.map((p) => uploadImage(p.blob)))
      setStatus({ busy: true, step: 'Publishing…', error: null })
      const { listing } = await api('/listings', {
        method: 'POST',
        body: { ...form, price: form.listing_type === 'sell' ? Number(form.price) : null, image_urls },
      })
      navigate(`/listings/${listing.ROWID}`)
    } catch (err) {
      setStatus({ busy: false, step: '', error: err.message })
    }
  }

  const missing = (key) => tried && !form[key]

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">List an item</h1>
        <p className="mt-1 text-sm text-muted-foreground">Takes about a minute. Clear photos and an honest condition get faster replies.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Photos <span className="text-sm font-normal text-muted-foreground">({photos.length}/{MAX_IMAGES})</span></CardTitle>
          <CardDescription>The first photo is the cover. Photos are compressed on your device before upload.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {photos.map((p, i) => (
              <div key={p.id} className="fade-in relative aspect-square overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10">
                <img src={p.preview} alt={`Photo ${i + 1} preview`} className="size-full object-cover" />
                {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-foreground/80 px-1.5 text-[10px] font-medium text-background">Cover</span>}
                <IconButton label={`Remove photo ${i + 1}`} size="icon-sm" variant="outline" onClick={() => removePhoto(p.id)} className="absolute right-1 top-1 bg-background/90 shadow">
                  <XIcon />
                </IconButton>
              </div>
            ))}
            {photos.length < MAX_IMAGES && (
              <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-input text-muted-foreground hover:border-brand-500 hover:text-brand-700 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                <ImagePlusIcon className="size-6" aria-hidden="true" />
                <span className="text-xs font-medium">Add photo</span>
                <input type="file" accept="image/*" multiple onChange={addPhotos} className="sr-only" />
              </label>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About the item</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="title">Title</FieldLabel>
              <Input id="title" required minLength={3} maxLength={80} value={form.title} onChange={set('title')} placeholder="e.g. Casio fx-991ES Plus calculator" />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <ChoiceField id="category" label="Category" placeholder="Choose a category" options={CATEGORIES} meta={CATEGORY_META} value={form.category} onChange={(v) => setValue('category', v)} invalid={missing('category')} />
              <ChoiceField id="item_condition" label="Condition" placeholder="Choose condition" options={CONDITIONS} meta={CONDITION_META} value={form.item_condition} onChange={(v) => setValue('item_condition', v)} invalid={missing('item_condition')} />
            </div>

            <Field>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Textarea id="description" maxLength={2000} rows={4} value={form.description} onChange={set('description')} className="min-h-24" />
              <FieldDescription>Edition, defects, what's included, where to meet.</FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle id="listing-type-label">How do you want to exchange it?</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {/* Single-select ToggleGroup lets the active item be unpressed (value ''); ignore that. */}
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={2}
              value={form.listing_type}
              onValueChange={(v) => v && setValue('listing_type', v)}
              aria-labelledby="listing-type-label"
              className="grid w-full grid-cols-3"
            >
              {LISTING_TYPES.map((t) => (
                <ToggleGroupItem key={t.value} value={t.value} size="lg" className="font-semibold">
                  <AttrIcon inline meta={EXCHANGE_META[t.value]} className="size-4" />
                  {t.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription className="-mt-2">{EXCHANGE_META[form.listing_type].hint}.</FieldDescription>

            {form.listing_type === 'sell' && (
              <Field>
                <FieldLabel htmlFor="price">Price (₹)</FieldLabel>
                <Input id="price" required type="number" min={1} max={100000} step="1" inputMode="numeric" value={form.price} onChange={set('price')} placeholder="450" />
              </Field>
            )}
          </FieldGroup>
        </CardContent>
      </Card>

      {status.error && (
        <Alert variant="destructive">
          <AlertDescription>{status.error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" disabled={status.busy} className="w-full">
        {status.busy && <Spinner data-icon="inline-start" />}
        {status.busy ? status.step : 'Publish listing'}
      </Button>
    </form>
  )
}

function ChoiceField({ id, label, placeholder, options, meta, value, onChange, invalid }) {
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} aria-invalid={invalid || undefined} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectGroup>
            {options.map((o) => (
              <SelectItem key={o} value={o}>
                <AttrIcon inline meta={meta[o]} className="size-4" />
                {o}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {invalid ? <FieldError>Choose a {label.toLowerCase()}.</FieldError> : meta[value]?.hint && <FieldDescription>{meta[value].hint}.</FieldDescription>}
    </Field>
  )
}
