import { api } from './api'

const MAX_EDGE = 1600

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Couldn't read ${file.name}. Try a JPEG or PNG.`))
    }
    img.src = url
  })
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

// Resize in the browser so a 4 MB phone photo uploads as roughly 200 KB.
export async function compressImage(file) {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image`)
  const img = await loadImage(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)

  // Older Safari ignores the WebP request and returns PNG; fall back to JPEG there.
  let blob = await toBlob(canvas, 'image/webp', 0.82)
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.85)
  if (!blob) throw new Error(`Couldn't compress ${file.name}`)
  return blob
}

// Server picks the object key and signs a 5-minute PUT URL; the browser uploads straight to Stratus.
export async function uploadImage(blob, kind = 'photo') {
  const { uploadUrl, publicUrl } = await api('/uploads/sign', {
    method: 'POST',
    body: { contentType: blob.type, size: blob.size, kind },
  })
  const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': blob.type }, body: blob })
  if (!res.ok) throw new Error(`Photo upload failed (${res.status}). Please try again.`)
  return publicUrl
}
