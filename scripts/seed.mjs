// Seeds demo listings from seed/photos/<Category>/<slug>.jpg through the function's guarded /seed routes.
//   node scripts/seed.mjs --dry     print what would be inserted
//   node scripts/seed.mjs           upload photos + insert listings
//   node scripts/seed.mjs --adopt you@vit.edu   give all seeded listings to that existing account
//   node scripts/seed.mjs --clean   delete every seeded listing and photo
// SEED_KEY comes from the env or functions/api/catalyst-config.json; it must be deployed to the function.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PHOTOS = join(ROOT, 'seed', 'photos')
const BASE = (process.env.SEED_URL || 'https://campus-exchange-60090998580.development.catalystserverless.in/server/api').replace(/\/$/, '')
const KEY = process.env.SEED_KEY || JSON.parse(readFileSync(join(ROOT, 'functions/api/catalyst-config.json'), 'utf8')).deployment.env_variables.SEED_KEY
const MAX_BYTES = 2 * 1024 * 1024
const SELLERS = 8
const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }
const args = new Set(process.argv.slice(2))

// Deterministic, so a re-run after --clean produces the same catalogue.
let seed = 20261017
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1))
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const weighted = (pairs) => {
  let r = rand() * pairs.reduce((s, [, w]) => s + w, 0)
  for (const [v, w] of pairs) if ((r -= w) < 0) return v
  return pairs[0][0]
}

// First match wins; price in rupees for a "sell" listing.
const PRICES = {
  Books: [[/./, [80, 350]]],
  'Calculators & Electronics': [
    [/usb|cable/, [100, 450]],
    [/mouse|power-strip|laptop-stand|power-bank/, [250, 900]],
    [/calculator/, [350, 1100]],
    [/./, [600, 2800]],
  ],
  'Lab Supplies': [
    [/microscope/, [1500, 4500]],
    [/stethoscope/, [500, 1500]],
    [/coat|goggles|kit/, [150, 450]],
    [/./, [100, 700]],
  ],
  'Hostel Essentials': [
    [/mattress/, [1200, 3000]],
    [/kettle|iron|fans|curtain/, [300, 1100]],
    [/./, [80, 600]],
  ],
  Stationery: [[/./, [30, 200]]],
  Other: [
    [/shirt|cap|sneakers/, [250, 1500]],
    [/./, [900, 6000]],
  ],
}
const NOTES = {
  Books: ['Clean copy, no torn pages. Light pencil marks in a few chapters.', 'Used for one academic year. Spine and cover are intact.', 'Highlighting only in the first two chapters. Handy for exam revision.'],
  'Calculators & Electronics': ['Works perfectly, charger or cable included where it applies.', 'Used through one semester, no scratches on the screen or body.', 'Selling because I upgraded. Happy to show it working before you pay.'],
  'Lab Supplies': ['Needed for first-year practicals. Cleaned and ready to use.', 'Used for one semester of labs. No chips or cracks.', 'Handing it down now that my lab courses are over.'],
  'Hostel Essentials': ['Moving out of the hostel, so it has to go. Pickup from the hostel block.', 'Used for one year, in good working shape.', 'Cleaned before listing. Easy to carry, collect it from my room.'],
  Stationery: ['Barely used, works like new.', 'Spare from my semester pack. Pickup on campus.', 'Never needed it. Selling it cheap to a junior.'],
  Other: ['Not using it anymore. Happy to meet at the canteen.', 'Taken care of and stored properly. Ask for more photos if you like.', 'Selling to make room in my cupboard.'],
}
const FREE_NOTE = 'Giving this away to a junior who can use it. Message me and I will arrange pickup on campus.'
const SWAP_NOTE = 'Open to a swap for something useful for my courses. Tell me what you have when you message.'

const titleOf = (slug) =>
  slug
    .split('-')
    .map((w) => ({ ncert: 'NCERT', usb: 'USB' })[w] ?? w[0].toUpperCase() + w.slice(1))
    .join(' ')

function plan() {
  const items = []
  for (const category of readdirSync(PHOTOS)) {
    for (const file of readdirSync(join(PHOTOS, category))) {
      const ext = file.slice(file.lastIndexOf('.')).toLowerCase()
      const path = join(PHOTOS, category, file)
      if (!TYPES[ext]) continue
      if (statSync(path).size > MAX_BYTES) {
        console.warn(`skip (over 2 MB): ${category}/${file}`)
        continue
      }
      items.push({ category, slug: file.slice(0, -ext.length), path, contentType: TYPES[ext] })
    }
  }
  // Shuffle so "newest" mixes categories instead of listing one category after another.
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items.map((it) => {
    const listing_type = weighted([['sell', 65], ['free', 20], ['swap', 15]])
    const [, [lo, hi]] = PRICES[it.category].find(([re]) => re.test(it.slug))
    return {
      ...it,
      title: titleOf(it.slug),
      listing_type,
      price: listing_type === 'sell' ? Math.round(between(lo, hi) / 10) * 10 : null,
      item_condition: weighted([['New', 20], ['Once used', 45], ['Used more than once', 35]]),
      status: weighted([['Available', 86], ['Reserved', 8], ['Completed', 6]]),
      description: listing_type === 'free' ? FREE_NOTE : listing_type === 'swap' ? SWAP_NOTE : pick(NOTES[it.category]),
      seller: between(1, SELLERS),
    }
  })
}

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-seed-key': KEY },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${data.error ?? 'failed'}`)
  return data
}

async function insert(it) {
  const bytes = readFileSync(it.path)
  const { uploadUrl, publicUrl } = await call('POST', '/seed/sign', { seller: it.seller, contentType: it.contentType, size: bytes.length })
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': it.contentType }, body: bytes })
  if (!put.ok) throw new Error(`photo upload ${put.status} for ${it.slug}`)
  await call('POST', '/seed', {
    seller: it.seller,
    title: it.title,
    description: it.description,
    category: it.category,
    item_condition: it.item_condition,
    listing_type: it.listing_type,
    price: it.price,
    status: it.status,
    image_urls: [publicUrl],
  })
}

if (args.has('--adopt')) {
  console.log(await call('POST', '/seed/adopt', { email: process.argv[process.argv.indexOf('--adopt') + 1] }))
} else if (args.has('--clean')) {
  console.log(await call('DELETE', '/seed'))
} else {
  const items = plan()
  const tally = (f) => Object.entries(items.reduce((m, i) => ((m[f(i)] = (m[f(i)] ?? 0) + 1), m), {})).map(([k, v]) => `${k} ${v}`).join(', ')
  console.log(`${items.length} listings | ${tally((i) => i.listing_type)} | ${tally((i) => i.status)}`)
  if (args.has('--dry')) {
    for (const i of items) console.log(`${i.category.padEnd(26)} ${i.title.padEnd(48)} ${i.listing_type.padEnd(5)} ${String(i.price ?? '-').padStart(5)}  ${i.item_condition}  ${i.status}`)
  } else {
    let done = 0
    const queue = [...items]
    // 4 at a time: fast enough, gentle on the function and the monthly quota.
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        for (let it; (it = queue.shift()); ) {
          try {
            await insert(it)
            console.log(`${++done}/${items.length} ${it.title}`)
          } catch (e) {
            console.error(`FAILED ${it.slug}: ${e.message}`)
          }
        }
      }),
    )
  }
}
