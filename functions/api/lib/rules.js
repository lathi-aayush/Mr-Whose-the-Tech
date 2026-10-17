'use strict';
// Pure business rules: no SDK, no I/O, so they're unit-testable with node:test.

const CATEGORIES = ['Books', 'Calculators & Electronics', 'Lab Supplies', 'Stationery', 'Hostel Essentials', 'Other'];
const CONDITIONS = ['New', 'Like New', 'Good', 'Fair'];
const LISTING_TYPES = ['sell', 'swap', 'free'];
const STATUSES = ['Available', 'Reserved', 'Completed'];
const SORTS = ['newest', 'oldest', 'price_asc', 'price_desc'];
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 5;

// Owner-driven transitions. Available -> Reserved is deliberately absent:
// it only happens by accepting an inquiry, so a buyer is always attached.
const OWNER_TRANSITIONS = {
  Available: ['Completed'],
  Reserved: ['Available', 'Completed'],
  Completed: [],
};

class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function parseAllowedDomains(raw) {
  return String(raw || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

// Exact domain match on the part after the last "@"; suffix checks would let x@vit.edu.evil.com through.
function isAllowedEmail(email, allowedDomains) {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false;
  const domain = normalized.slice(normalized.lastIndexOf('@') + 1);
  return allowedDomains.includes(domain);
}

function cleanText(value, field, { min = 0, max }) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new ValidationError(`${field} must be text`);
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length < min) throw new ValidationError(`${field} must be at least ${min} characters`);
  if (text.length > max) throw new ValidationError(`${field} must be at most ${max} characters`);
  return text;
}

function oneOf(value, allowed, field) {
  if (!allowed.includes(value)) throw new ValidationError(`${field} must be one of: ${allowed.join(', ')}`);
  return value;
}

// Every image must live under this user's own upload prefix, so nobody can attach
// external URLs or another seller's photos.
function checkOwnedUrl(url, ownPrefix, field) {
  if (typeof url !== 'string' || !url.startsWith(ownPrefix) || url.includes('..')) {
    throw new ValidationError(`${field} must be an image you uploaded`);
  }
  return url;
}

function validateListingInput(body, ownPrefix) {
  if (!body || typeof body !== 'object') throw new ValidationError('Request body is required');
  const listing = {
    title: cleanText(body.title, 'Title', { min: 3, max: 80 }),
    // Preserve line breaks in descriptions; only trim the ends.
    description: typeof body.description === 'string' ? body.description.trim() : '',
    category: oneOf(body.category, CATEGORIES, 'Category'),
    item_condition: oneOf(body.item_condition, CONDITIONS, 'Condition'),
    listing_type: oneOf(body.listing_type, LISTING_TYPES, 'Listing type'),
    price: null,
    image_urls: [],
    spin_url: null,
  };
  if (listing.description.length > 2000) throw new ValidationError('Description must be at most 2000 characters');

  if (listing.listing_type === 'sell') {
    const price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0 || price > 100000) {
      throw new ValidationError('Price must be between 1 and 100000 for items for sale');
    }
    listing.price = Math.round(price * 100) / 100;
  }

  const images = Array.isArray(body.image_urls) ? body.image_urls : [];
  if (images.length < 1) throw new ValidationError('Add at least one photo');
  if (images.length > MAX_IMAGES) throw new ValidationError(`At most ${MAX_IMAGES} photos`);
  listing.image_urls = images.map((u) => checkOwnedUrl(u, ownPrefix, 'Photo'));

  if (body.spin_url) listing.spin_url = checkOwnedUrl(body.spin_url, ownPrefix, '360° view');
  return listing;
}

function validateInquiryInput(body) {
  if (!body || typeof body !== 'object') throw new ValidationError('Request body is required');
  return {
    message: cleanText(body.message, 'Message', { min: 1, max: 500 }),
    offer_type: oneOf(body.offer_type, LISTING_TYPES, 'Offer type'),
  };
}

function validateUploadRequest(body) {
  if (!body || typeof body !== 'object') throw new ValidationError('Request body is required');
  const ext = IMAGE_TYPES[body.contentType];
  if (!ext) throw new ValidationError('Only JPEG, PNG or WebP images are allowed');
  const size = Number(body.size);
  // ponytail: declared size only; a pre-signed PUT can't enforce it server-side.
  // Upgrade path: verify object size with headObject when the listing is created.
  if (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_BYTES) {
    throw new ValidationError('Images must be 5 MB or smaller');
  }
  return { contentType: body.contentType, ext, kind: body.kind === 'spin' ? 'spin' : 'photo' };
}

function assertOwnerTransition(from, to) {
  oneOf(to, STATUSES, 'Status');
  if (!(OWNER_TRANSITIONS[from] || []).includes(to)) {
    throw new ValidationError(`Cannot change status from ${from} to ${to}`, 409);
  }
}

// Search, filter and sort in memory because ZCQL LIKE wildcards silently return nothing.
function searchListings(listings, params = {}) {
  const terms = String(params.q || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
  const status = params.status && STATUSES.includes(params.status) ? params.status : null;
  const sort = SORTS.includes(params.sort) ? params.sort : 'newest';

  const filtered = listings.filter((l) => {
    if (status ? l.status !== status : l.status === 'Completed') return false;
    if (params.category && l.category !== params.category) return false;
    if (params.condition && l.item_condition !== params.condition) return false;
    if (params.type && l.listing_type !== params.type) return false;
    if (terms.length) {
      const haystack = `${l.title} ${l.description} ${l.category}`.toLowerCase();
      if (!terms.every((t) => haystack.includes(t))) return false;
    }
    return true;
  });

  // Catalyst timestamps look like "2026-10-17 10:00:00:123"; make them ISO-parseable.
  const time = (l) => Date.parse(String(l.CREATEDTIME).replace(' ', 'T').replace(/:(\d{3})$/, '.$1')) || 0;
  // Free and swap items sort as price 0. Ties fall back to newest, then ROWID, so order is deterministic.
  const price = (l) => (l.price === null || l.price === undefined || l.price === '' ? 0 : Number(l.price));
  const byNewest = (a, b) => time(b) - time(a) || String(b.ROWID).localeCompare(String(a.ROWID));
  const comparators = {
    newest: byNewest,
    oldest: (a, b) => -byNewest(a, b),
    price_asc: (a, b) => price(a) - price(b) || byNewest(a, b),
    price_desc: (a, b) => price(b) - price(a) || byNewest(a, b),
  };
  return filtered.sort(comparators[sort]);
}

module.exports = {
  CATEGORIES,
  CONDITIONS,
  LISTING_TYPES,
  STATUSES,
  SORTS,
  ValidationError,
  parseAllowedDomains,
  isAllowedEmail,
  validateListingInput,
  validateInquiryInput,
  validateUploadRequest,
  assertOwnerTransition,
  searchListings,
};
