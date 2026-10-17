import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Field, IconButton, inputClass, primaryButton } from '../components/ui'
import { api } from '../lib/api'
import { CATEGORIES, CONDITIONS, LISTING_TYPES, MAX_IMAGES } from '../lib/constants'
import { compressImage, uploadImage } from '../lib/image'

export default function Sell() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ title: '', description: '', category: '', item_condition: '', listing_type: 'sell', price: '' })
  const [photos, setPhotos] = useState([]) // { id, preview, blob }
  const [status, setStatus] = useState({ busy: false, step: '', error: null })

  // Free preview object URLs on unmount only; a [photos] cleanup would revoke previews that are still shown.
  const photosRef = useRef(photos)
  photosRef.current = photos
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), [])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

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

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">List an item</h1>
        <p className="mt-1 text-sm text-stone-500">Clear photos and an honest condition get faster replies.</p>
      </div>

      <div>
        <span className="text-sm font-medium text-stone-800">Photos ({photos.length}/{MAX_IMAGES})</span>
        <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {photos.map((p, i) => (
            <div key={p.id} className="fade-in relative aspect-square overflow-hidden rounded-lg border border-stone-200 bg-white">
              <img src={p.preview} alt={`Photo ${i + 1} preview`} className="h-full w-full object-cover" />
              {i === 0 && <span className="absolute bottom-1 left-1 rounded bg-stone-900/80 px-1.5 text-[10px] font-medium text-white">Cover</span>}
              <div className="absolute right-1 top-1">
                <IconButton label="Remove photo" onClick={() => removePhoto(p.id)} className="h-7 w-7 bg-white/90 shadow">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                </IconButton>
              </div>
            </div>
          ))}
          {photos.length < MAX_IMAGES && (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-stone-300 bg-white text-stone-500 hover:border-brand-500 hover:text-brand-700 focus-within:border-brand-600">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              <span className="text-xs font-medium">Add photo</span>
              <input type="file" accept="image/*" multiple onChange={addPhotos} className="sr-only" />
            </label>
          )}
        </div>
      </div>

      <Field label="Title">
        <input required minLength={3} maxLength={80} value={form.title} onChange={set('title')} className={inputClass} placeholder="e.g. Casio fx-991ES Plus calculator" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <select required value={form.category} onChange={set('category')} className={inputClass}>
            <option value="" disabled>Choose a category</option>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Condition">
          <select required value={form.item_condition} onChange={set('item_condition')} className={inputClass}>
            <option value="" disabled>Choose condition</option>
            {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-stone-800">How do you want to exchange it?</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {LISTING_TYPES.map((t) => (
            <label key={t.value} className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium ${form.listing_type === t.value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-stone-300 bg-white text-stone-700'}`}>
              <input type="radio" name="listing_type" value={t.value} checked={form.listing_type === t.value} onChange={set('listing_type')} className="sr-only" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      {form.listing_type === 'sell' && (
        <Field label="Price (₹)">
          <input required type="number" min={1} max={100000} step="1" inputMode="numeric" value={form.price} onChange={set('price')} className={inputClass} placeholder="450" />
        </Field>
      )}

      <Field label="Description" hint="Edition, defects, what's included, where to meet.">
        <textarea maxLength={2000} rows={4} value={form.description} onChange={set('description')} className={inputClass} />
      </Field>

      {status.error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{status.error}</p>}
      <button type="submit" disabled={status.busy} className={`${primaryButton} w-full py-3`}>
        {status.busy ? status.step : 'Publish listing'}
      </button>
    </form>
  )
}
