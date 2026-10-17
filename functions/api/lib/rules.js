'use strict';
// Pure business rules: no SDK, no I/O, so they're unit-testable with node:test.

const CATEGORIES = ['Books', 'Calculators & Electronics', 'Lab Supplies', 'Stationery', 'Hostel Essentials', 'Other'];
const CONDITIONS = ['New', 'Once used', 'Used more than once'];
// Rows saved before the 3-value scale; mapped on read so old listings still filter and display.
const LEGACY_CONDITIONS = { 'Like New': 'Once used', Good: 'Used more than once', Fair: 'Used more than once' };
const normalizeCondition = (c) => LEGACY_CONDITIONS[c] || c;
const LISTING_TYPES = ['sell', 'swap', 'free'];
const STATUSES = ['Available', 'Reserved', 'Completed'];
const SORTS = ['newest', 'oldest', 'price_asc', 'price_desc'];
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES = 5;
const MAX_SWAP_IMAGES = 3;

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
  // "*" opens sign-up to any address (hackathon demo, so judges can try it). Set a domain to lock it to one campus.
  if (allowedDomains.includes('*')) return true;
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

function validateInquiryInput(body, ownPrefix) {
  if (!body || typeof body !== 'object') throw new ValidationError('Request body is required');
  const inquiry = {
    message: cleanText(body.message, 'Message', { min: 1, max: 500 }),
    offer_type: oneOf(body.offer_type, LISTING_TYPES, 'Offer type'),
    swap_item: null,
    swap_image_urls: [],
  };
  if (inquiry.offer_type !== 'swap') return inquiry;
  // A swap must say what is offered; photos are optional but must be this user's uploads.
  inquiry.swap_item = cleanText(body.swap_item, 'What you are offering', { min: 2, max: 100 });
  const images = Array.isArray(body.swap_image_urls) ? body.swap_image_urls : [];
  if (images.length > MAX_SWAP_IMAGES) throw new ValidationError(`At most ${MAX_SWAP_IMAGES} photos of your swap item`);
  inquiry.swap_image_urls = images.map((u) => checkOwnedUrl(u, ownPrefix, 'Swap photo'));
  return inquiry;
}


// Email is the login identity and the campus-domain check key, so it is not editable here.
function validateProfileInput(body) {
  if (!body || typeof body !== 'object') throw new ValidationError('Request body is required');
  const name = cleanText(body.name, 'Name', { min: 2, max: 80 });
  const phone = String(body.phone ?? '').replace(/[\s\-()]/g, '');
  if (phone && !/^\+?\d{10,15}$/.test(phone)) throw new ValidationError('Phone must be 10–15 digits, optional leading +');
  return { name, phone };
}

function validateMessageInput(body) {
  if (!body || typeof body !== 'object') throw new ValidationError('Request body is required');
  if (typeof body.body !== 'string') throw new ValidationError('Message must be text');
  // Keep line breaks (chat messages are multi-line); only trim the ends.
  const text = body.body.trim();
  if (!text) throw new ValidationError('Message cannot be empty');
  if (text.length > 1000) throw new ValidationError('Message must be at most 1000 characters');
  return { body: text };
}

const REPORT_REASONS = ['Harassment or abusive language', 'Spam or scam', 'Inappropriate content', 'No-show or unreliable', 'Other'];

function validateReportInput(body) {
  if (!body || typeof body !== 'object') throw new ValidationError('Request body is required');
  const reason = oneOf(body.reason, REPORT_REASONS, 'Reason');
  const details = cleanText(body.details, 'Details', { max: 500 });
  return { reason, details };
}

function chatRole(inquiry, userId) {
  if (!inquiry || !userId) return null;
  if (String(inquiry.buyer_id) === String(userId)) return 'buyer';
  if (String(inquiry.seller_id) === String(userId)) return 'seller';
  return null;
}

// The seller picks what the buyer sees: email only, or a phone number they type in.
function validateContactShare(body) {
  const share = oneOf(body && body.share, ['email', 'phone'], 'Contact choice');
  if (share === 'email') return { shared_contact: 'email', seller_phone: null };
  const phone = String(body.phone || '').replace(/[\s\-()]/g, '');
  if (!/^\+?\d{10,15}$/.test(phone)) throw new ValidationError('Enter a valid phone number');
  return { shared_contact: 'phone', seller_phone: phone };
}

// Rows accepted before phone sharing existed have shared_contact null: they revealed the email.
function sellerContact(inquiry, listing) {
  if (inquiry.shared_contact === 'phone' && inquiry.seller_phone) return { type: 'phone', value: inquiry.seller_phone };
  return { type: 'email', value: listing ? listing.seller_email : null };
}

// Mail is capped at 100/month on the free tier, so a chat message only emails the first unread one of a
// burst, and only when the recipient hasn't read this chat recently (a recent read mark means they are
// in it). There is no presence signal to do better.
const MESSAGE_EMAIL_QUIET_MS = 5 * 60 * 1000;
function shouldEmailMessage({ unread, readAt, now = Date.now() }) {
  if ((Number(unread) || 0) > 0) return false;
  const last = Number(readAt) || 0;
  return !last || now - last > MESSAGE_EMAIL_QUIET_MS;
}

// Unread = what the bell shows. The buyer's "accepted" item is the approval notification;
// it clears when the buyer first opens the chat (buyer_read_at gets set).
function unreadNotifications(inquiries, userId) {
  const out = [];
  for (const i of inquiries) {
    const role = chatRole(i, userId);
    if (!role) continue;
    // A pending request waits on the seller, so it stays in their bell until they accept or decline.
    if (i.status === 'Pending' && role === 'seller') {
      out.push({ inquiry_id: i.ROWID, listing_title: i.listing_title, kind: 'request', at: null });
      continue;
    }
    if (i.status !== 'Accepted') continue;
    const readAt = Number(role === 'buyer' ? i.buyer_read_at : i.seller_read_at) || 0;
    const lastAt = Number(i.last_message_at) || 0;
    if (lastAt > readAt && String(i.last_sender_id) !== String(userId)) {
      out.push({
        inquiry_id: i.ROWID,
        listing_title: i.listing_title,
        kind: 'message',
        at: lastAt,
        count: Number(i[`${role}_unread`]) || 1,
        preview: i.last_message_preview || '',
      });
    } else if (role === 'buyer' && !readAt) {
      out.push({ inquiry_id: i.ROWID, listing_title: i.listing_title, kind: 'accepted', at: lastAt || null });
    }
  }
  return out;
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
  // "all" includes Completed; the browse page fetches everything once and filters in the browser.
  const includeAll = params.status === 'all';
  const sort = SORTS.includes(params.sort) ? params.sort : 'newest';

  const filtered = listings.filter((l) => {
    if (status ? l.status !== status : !includeAll && l.status === 'Completed') return false;
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
  normalizeCondition,
  LISTING_TYPES,
  STATUSES,
  SORTS,
  ValidationError,
  parseAllowedDomains,
  isAllowedEmail,
  validateListingInput,
  validateInquiryInput,
  validateProfileInput,
  validateMessageInput,
  REPORT_REASONS,
  validateReportInput,
  validateContactShare,
  chatRole,
  sellerContact,
  unreadNotifications,
  shouldEmailMessage,
  validateUploadRequest,
  assertOwnerTransition,
  searchListings,
};
