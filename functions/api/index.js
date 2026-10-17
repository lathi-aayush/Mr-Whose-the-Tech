'use strict';
const catalyst = require('zcatalyst-sdk-node');
const { createStore } = require('./lib/store');
const rules = require('./lib/rules');

const { ValidationError } = rules;

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing function env var ${name}`);
  return value;
}

function sendJson(res, status, data) {
  // No CORS headers here: Authorized Domains injects them, and duplicates break browsers.
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 100_000) reject(new ValidationError('Request body too large', 413));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new ValidationError('Body must be valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function currentUser(req) {
  // User scope only: admin scope has no user token and getCurrentUser() throws.
  try {
    const user = await catalyst.initialize(req).userManagement().getCurrentUser();
    if (!user) return null;
    return {
      id: String(user.user_id),
      email: String(user.email_id).toLowerCase(),
      name: [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.email_id,
    };
  } catch {
    return null;
  }
}

async function requireUser(req) {
  const user = await currentUser(req);
  if (!user) throw new ValidationError('Sign in required', 401);
  // Defense in depth: signup already checks the domain, but re-check in case a user was added another way.
  if (!rules.isAllowedEmail(user.email, rules.parseAllowedDomains(env('ALLOWED_EMAIL_DOMAINS')))) {
    throw new ValidationError('Only campus email accounts can do this', 403);
  }
  return user;
}

function uploadPrefix(userId) {
  return `listings/${userId}/`;
}

function publicUrlPrefix(userId) {
  return `${env('STRATUS_PUBLIC_BASE').replace(/\/$/, '')}/${uploadPrefix(userId)}`;
}

// Seller email is only revealed to a buyer whose inquiry was accepted.
function publicListing(l) {
  const { seller_email, ...rest } = l;
  return rest;
}

// A buyer's list never carries seller contact: the raw phone/email columns stay on the server and the
// chat endpoint returns only the detail the seller chose. Keeps this list cheap enough to poll.
function clientInquiry(inquiry) {
  const { seller_phone, shared_contact, ...rest } = inquiry;
  return rest;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Best-effort: the accept is already saved, so a mail failure (unverified sender, quota) must not undo it.
async function emailBuyerAccepted(admin, inquiry, listing, contact) {
  try {
    const link = `${env('APP_URL').replace(/\/$/, '')}/chats/${inquiry.ROWID}`;
    const title = escapeHtml(listing.title);
    await admin.email().sendMail({
      from_email: env('MAIL_FROM'),
      to_email: [inquiry.buyer_email],
      subject: `Your request for "${listing.title}" was accepted`,
      html_mode: true,
      content:
        `<p>Hi ${escapeHtml(inquiry.buyer_name)},</p>` +
        `<p>${escapeHtml(listing.seller_name)} accepted your request for <b>${title}</b>.</p>` +
        `<p>${contact.type === 'phone' ? 'Phone' : 'Email'}: <b>${escapeHtml(contact.value)}</b></p>` +
        `<p><a href="${escapeHtml(link)}">Open the chat</a> to arrange the handover.</p>`,
    });
  } catch (err) {
    console.error('Accepted-email failed', err && err.code, err && err.message);
  }
}

const routes = [];
function route(method, pattern, handler) {
  const keys = [];
  const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}/?$`);
  routes.push({ method, regex, keys, handler });
}

route('GET', '/health', async () => ({ status: 'ok' }));

route('GET', '/me', async ({ req }) => {
  const user = await currentUser(req);
  if (!user) throw new ValidationError('Sign in required', 401);
  return { ...user, campusVerified: rules.isAllowedEmail(user.email, rules.parseAllowedDomains(env('ALLOWED_EMAIL_DOMAINS'))) };
});

route('POST', '/signup', async ({ body, admin }) => {
  const email = String(body.email || '').trim().toLowerCase();
  const allowed = rules.parseAllowedDomains(env('ALLOWED_EMAIL_DOMAINS'));
  if (!rules.isAllowedEmail(email, allowed)) {
    throw new ValidationError(
      allowed.includes('*') ? 'Enter a valid email address' : `Use your campus email (${allowed.map((d) => '@' + d).join(', ')})`,
    );
  }
  const firstName = String(body.first_name || '').trim().slice(0, 50);
  const lastName = String(body.last_name || '').trim().slice(0, 50);
  if (!firstName) throw new ValidationError('First name is required');
  try {
    await admin.userManagement().registerUser(
      // Without redirect_url Catalyst sends users to the project's bare domain, which hosts nothing.
      { platform_type: 'web', zaid: env('AUTH_ZAID'), redirect_url: `${env('APP_URL').replace(/\/$/, '')}/login?tab=signin` },
      { email_id: email, first_name: firstName, last_name: lastName },
    );
  } catch (err) {
    if (/exist/i.test(String(err && err.message))) throw new ValidationError('An account with this email already exists. Sign in instead.', 409);
    throw err;
  }
  return { message: 'Check your campus inbox to set your password.' };
});

route('GET', '/listings', async ({ store, query }) => {
  const all = await store.allListings();
  return { listings: rules.searchListings(all, query).map(publicListing) };
});

route('GET', '/listings/:id', async ({ store, params, req }) => {
  const listing = await store.getListing(params.id);
  if (!listing) throw new ValidationError('Listing not found', 404);
  const user = await currentUser(req);
  return { listing: publicListing(listing), isOwner: !!user && user.id === listing.seller_id };
});

route('POST', '/listings', async ({ req, body, store }) => {
  const user = await requireUser(req);
  const data = rules.validateListingInput(body, publicUrlPrefix(user.id));
  const listing = await store.createListing({
    ...data,
    status: 'Available',
    seller_id: user.id,
    seller_name: user.name,
    seller_email: user.email,
  });
  return { listing: publicListing(listing) };
});

route('GET', '/me/listings', async ({ req, store }) => {
  const user = await requireUser(req);
  return { listings: (await store.listingsBySeller(user.id)).map(publicListing) };
});

route('PATCH', '/listings/:id/status', async ({ req, body, store, params }) => {
  const user = await requireUser(req);
  const listing = await store.getListing(params.id);
  if (!listing) throw new ValidationError('Listing not found', 404);
  if (listing.seller_id !== user.id) throw new ValidationError('Only the seller can change this listing', 403);
  rules.assertOwnerTransition(listing.status, body.status);

  // Reserved -> Available means the deal fell through: release the accepted buyer.
  if (listing.status === 'Reserved' && body.status === 'Available') {
    const accepted = (await store.inquiriesForListing(listing.ROWID)).filter((i) => i.status === 'Accepted');
    await Promise.all(accepted.map((i) => store.updateInquiryStatus(i.ROWID, 'Declined')));
  }
  await store.updateListingStatus(listing.ROWID, body.status);
  return { status: body.status };
});

route('POST', '/listings/:id/inquiries', async ({ req, body, store, params }) => {
  const user = await requireUser(req);
  const input = rules.validateInquiryInput(body, publicUrlPrefix(user.id));
  const listing = await store.getListing(params.id);
  if (!listing) throw new ValidationError('Listing not found', 404);
  if (listing.seller_id === user.id) throw new ValidationError("You can't send an inquiry on your own listing", 409);
  if (listing.status !== 'Available') throw new ValidationError(`This item is ${listing.status.toLowerCase()}`, 409);
  const existing = await store.inquiriesForListing(listing.ROWID);
  if (existing.some((i) => i.buyer_id === user.id && i.status === 'Pending')) {
    throw new ValidationError('You already have a pending inquiry on this item', 409);
  }
  const inquiry = await store.createInquiry({
    ...input,
    listing_id: listing.ROWID,
    listing_title: listing.title,
    seller_id: listing.seller_id,
    buyer_id: user.id,
    buyer_name: user.name,
    buyer_email: user.email,
    status: 'Pending',
  });
  return { inquiry };
});

route('GET', '/me/inquiries', async ({ req, store }) => {
  const user = await requireUser(req);
  return { inquiries: (await store.inquiriesByBuyer(user.id)).map(clientInquiry) };
});

route('GET', '/me/received', async ({ req, store }) => {
  const user = await requireUser(req);
  return { inquiries: await store.inquiriesForSeller(user.id) };
});

route('GET', '/me/notifications', async ({ req, store }) => {
  const user = await requireUser(req);
  const [sent, received] = await Promise.all([store.inquiriesByBuyer(user.id), store.inquiriesForSeller(user.id)]);
  return { items: rules.unreadNotifications([...sent, ...received], user.id) };
});

// Shared by the chat routes: loads the inquiry and checks the caller is its buyer or seller.
async function loadChat(store, user, inquiryId) {
  const inquiry = await store.getInquiry(inquiryId);
  if (!inquiry) throw new ValidationError('Request not found', 404);
  const role = rules.chatRole(inquiry, user.id);
  if (!role) throw new ValidationError('This chat is only for the buyer and seller', 403);
  return { inquiry, role };
}

// ponytail: presence and typing are timestamps in Catalyst Cache, refreshed by the chat poll.
// Throwaway and high-frequency, so not Data Store rows. Cache failures must never break chat.
// Upgrade path: Catalyst Signals or an AppSail websocket for true push.
const otherRole = (role) => (role === 'buyer' ? 'seller' : 'buyer');

async function cachePut(admin, key, value) {
  try {
    await admin.cache().segment().put(key, String(value), 1);
  } catch (err) {
    console.error('Cache put failed', err && err.message);
  }
}

async function cacheGet(admin, key) {
  try {
    return Number(await admin.cache().segment().getValue(key)) || null;
  } catch {
    return null; // missing key and cache errors both mean "no signal"
  }
}

route('GET', '/inquiries/:id/messages', async ({ req, store, params, query, admin }) => {
  const user = await requireUser(req);
  const { inquiry, role } = await loadChat(store, user, params.id);
  if (inquiry.status === 'Pending') throw new ValidationError('Chat unlocks when the seller accepts the request', 409);
  const listing = await store.getListing(inquiry.listing_id);
  const messages = await store.messagesForInquiry(inquiry.ROWID, query.after);

  const peerRole = otherRole(role);
  const [, seenAt, typingAt] = await Promise.all([
    cachePut(admin, `seen_${inquiry.ROWID}_${role}`, Date.now()),
    cacheGet(admin, `seen_${inquiry.ROWID}_${peerRole}`),
    cacheGet(admin, `typing_${inquiry.ROWID}_${peerRole}`),
  ]);

  // Mark read only when something is unread, so 3s polling doesn't write every time.
  const readKey = `${role}_read_at`;
  const readAt = Number(inquiry[readKey]) || 0;
  if (!readAt || Number(inquiry.last_message_at) > readAt || Number(inquiry[`${role}_unread`]) > 0) {
    await store.updateInquiry(inquiry.ROWID, { [readKey]: Date.now(), [`${role}_unread`]: 0 });
  }

  const open = inquiry.status === 'Accepted';
  let contact = null;
  if (open) contact = role === 'buyer' ? rules.sellerContact(inquiry, listing) : { type: 'email', value: inquiry.buyer_email };
  return {
    role,
    canSend: open,
    status: inquiry.status,
    listing: listing ? { ROWID: listing.ROWID, title: listing.title, image_urls: listing.image_urls, category: listing.category } : null,
    counterpart: role === 'buyer' ? (listing ? listing.seller_name : 'Seller') : inquiry.buyer_name,
    contact,
    me: user.id,
    peer: rules.presenceState({ seenAt, typingAt }),
    swap: inquiry.swap_item ? { item: inquiry.swap_item, image_urls: inquiry.swap_image_urls } : null,
    messages,
  };
});

route('POST', '/inquiries/:id/typing', async ({ req, store, params, admin }) => {
  const user = await requireUser(req);
  const { inquiry, role } = await loadChat(store, user, params.id);
  if (inquiry.status !== 'Accepted') throw new ValidationError('This chat is closed', 409);
  await cachePut(admin, `typing_${inquiry.ROWID}_${role}`, Date.now());
  return {};
});

route('POST', '/inquiries/:id/messages', async ({ req, body, store, params, admin }) => {
  const user = await requireUser(req);
  const { inquiry, role } = await loadChat(store, user, params.id);
  const input = rules.validateMessageInput(body);
  if (inquiry.status !== 'Accepted') throw new ValidationError('This chat is closed', 409);
  const now = Date.now();
  const message = await store.createMessage({
    inquiry_id: inquiry.ROWID,
    sender_id: user.id,
    sender_name: user.name,
    body: input.body,
    sent_at: now,
  });
  // ponytail: read-modify-write counter. Two messages from the same sender landing in the same instant
  // can lose one increment; the unread dot still shows. Upgrade path: count Messages rows.
  const peerUnread = `${otherRole(role)}_unread`;
  await store.updateInquiry(inquiry.ROWID, {
    last_message_at: now,
    last_sender_id: user.id,
    last_message_preview: input.body.replace(/\s+/g, ' ').slice(0, 80),
    [`${role}_read_at`]: now,
    [`${role}_unread`]: 0,
    [peerUnread]: (Number(inquiry[peerUnread]) || 0) + 1,
  });
  await cachePut(admin, `typing_${inquiry.ROWID}_${role}`, 0); // clears "typing…" on send
  return { message };
});

route('PATCH', '/inquiries/:id', async ({ req, body, store, params, admin }) => {
  const user = await requireUser(req);
  const action = body.action;
  if (action !== 'accept' && action !== 'decline') throw new ValidationError('Action must be accept or decline');
  const inquiry = await store.getInquiry(params.id);
  if (!inquiry) throw new ValidationError('Inquiry not found', 404);
  const listing = await store.getListing(inquiry.listing_id);
  if (!listing || listing.seller_id !== user.id) throw new ValidationError('Only the seller can respond to this inquiry', 403);
  if (inquiry.status !== 'Pending') throw new ValidationError(`Inquiry is already ${inquiry.status.toLowerCase()}`, 409);

  if (action === 'decline') {
    await store.updateInquiryStatus(inquiry.ROWID, 'Declined');
    return { status: 'Declined' };
  }

  if (listing.status !== 'Available') throw new ValidationError(`Listing is already ${listing.status.toLowerCase()}`, 409);
  // Validate before any write: a bad phone number must not leave the item reserved.
  const share = rules.validateContactShare(body);
  // ponytail: no transactions in ZCQL, so these writes aren't atomic. Order is chosen so a
  // partial failure leaves the listing Reserved with its buyer accepted (the safe state).
  await store.updateListingStatus(listing.ROWID, 'Reserved');
  await store.updateInquiry(inquiry.ROWID, { status: 'Accepted', ...share });
  const others = (await store.inquiriesForListing(listing.ROWID)).filter(
    (i) => i.status === 'Pending' && i.ROWID !== inquiry.ROWID,
  );
  await Promise.all(others.map((i) => store.updateInquiryStatus(i.ROWID, 'Declined')));
  await emailBuyerAccepted(admin, inquiry, listing, rules.sellerContact({ ...inquiry, ...share }, listing));
  return { status: 'Accepted', listingStatus: 'Reserved', declined: others.length };
});

route('POST', '/uploads/sign', async ({ req, body, admin }) => {
  const user = await requireUser(req);
  const { contentType, ext, kind } = rules.validateUploadRequest(body);
  // Server picks the key so clients can't overwrite other users' objects.
  const key = `${uploadPrefix(user.id)}${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const signed = await admin.stratus().bucket(env('STRATUS_BUCKET')).generatePreSignedUrl(key, 'PUT', { expiryIn: 300 });
  return { uploadUrl: signed.signature, publicUrl: `${publicUrlPrefix(user.id)}${key.slice(uploadPrefix(user.id).length)}`, contentType };
});

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  // Local dev only: production origins get CORS from Authorized Domains.
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
  }

  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const path = url.pathname.replace(/^\/execute/, '') || '/';
    const match = routes
      .filter((r) => r.method === req.method)
      .map((r) => ({ r, m: path.match(r.regex) }))
      .find((x) => x.m);
    if (!match) return sendJson(res, 404, { error: 'Not found' });

    const params = Object.fromEntries(match.r.keys.map((k, i) => [k, decodeURIComponent(match.m[i + 1])]));
    const admin = catalyst.initialize(req, { scope: 'admin' });
    const body = req.method === 'GET' ? {} : await getBody(req);
    const data = await match.r.handler({
      req,
      body,
      params,
      query: Object.fromEntries(url.searchParams),
      admin,
      store: createStore(admin),
    });
    sendJson(res, req.method === 'POST' ? 201 : 200, data);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    sendJson(res, status, { error: status >= 500 ? 'Something went wrong. Please try again.' : err.message });
  }
};
