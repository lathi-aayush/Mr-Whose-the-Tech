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
  return { ...rest, item_condition: rules.normalizeCondition(rest.item_condition) };
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

// Best-effort: the action is already saved, so a mail failure (bad credentials, quota) must not undo it.
// SMTP_* env vars (set in the Catalyst console, never in catalyst-config.json: that file is public) send
// through the owner's own SMTP account; without them it falls back to Catalyst Mail, which needs a
// domain-verified sender and is capped at 100/month. rules.shouldEmailMessage keeps chat emails rare.
let smtp;
function smtpTransport() {
  if (!smtp) {
    const port = Number(process.env.SMTP_PORT) || 465;
    smtp = require('nodemailer').createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 587 upgrades with STARTTLS
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // Fail fast: a blocked outbound port must not hold the request open until the function times out.
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
  }
  return smtp;
}

async function sendMail(admin, { to, subject, html }) {
  try {
    if (process.env.SMTP_HOST) {
      const from = process.env.SMTP_FROM || process.env.SMTP_USER;
      await smtpTransport().sendMail({ from: `Campus Sibling <${from}>`, to, subject, html });
    } else {
      await admin.email().sendMail({ from_email: env('MAIL_FROM'), to_email: [to], subject, html_mode: true, content: html });
    }
  } catch (err) {
    console.error('Mail failed', err && err.code, err && err.message);
    if (process.env.DEBUG_ERRORS === '1') throw new Error(`MAIL: ${err && err.message}`); // TEMP: surfaces the real mail error
  }
}

const chatLink = (inquiryId) => `${env('APP_URL').replace(/\/$/, '')}/chats/${inquiryId}`;

// Every interpolated value is user text, so callers pass it through escapeHtml.
function mailBody(name, paragraphs, link, cta) {
  return `<p>Hi ${escapeHtml(name)},</p>${paragraphs.map((p) => `<p>${p}</p>`).join('')}<p><a href="${escapeHtml(link)}">${escapeHtml(cta)}</a></p>`;
}

const OFFER_VERB = { sell: 'buy', swap: 'swap for', free: 'take for free' };

function requestMail(inquiry, listing) {
  return {
    to: listing.seller_email,
    subject: `New request for "${listing.title}"`,
    html: mailBody(
      listing.seller_name,
      [
        `<b>${escapeHtml(inquiry.buyer_name)}</b> wants to ${OFFER_VERB[inquiry.offer_type] || 'get'} your <b>${escapeHtml(listing.title)}</b>.`,
        `&ldquo;${escapeHtml(inquiry.message)}&rdquo;`,
      ],
      chatLink(inquiry.ROWID),
      'Open your chats to accept or decline',
    ),
  };
}

function acceptedMail(inquiry, listing, contact) {
  return {
    to: inquiry.buyer_email,
    subject: `Your request for "${listing.title}" was accepted`,
    html: mailBody(
      inquiry.buyer_name,
      [
        `${escapeHtml(listing.seller_name)} accepted your request for <b>${escapeHtml(listing.title)}</b>.`,
        `${contact.type === 'phone' ? 'Phone' : 'Email'}: <b>${escapeHtml(contact.value)}</b>`,
      ],
      chatLink(inquiry.ROWID),
      'Open the chat to arrange the handover',
    ),
  };
}

function messageMail({ to, name, sender, title, preview, inquiryId }) {
  return {
    to,
    subject: `${sender} sent you a message about "${title}"`,
    html: mailBody(
      name,
      [`<b>${escapeHtml(sender)}</b> sent you a message about <b>${escapeHtml(title)}</b>:`, `&ldquo;${escapeHtml(preview)}&rdquo;`],
      chatLink(inquiryId),
      'Open the chat to reply',
    ),
  };
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

route('GET', '/me/profile', async ({ req, store }) => {
  const user = await requireUser(req);
  const profile = await store.getProfile(user.id);
  return { name: user.name, email: user.email, phone: (profile && profile.phone) || '' };
});

route('PATCH', '/me/profile', async ({ req, body, store, admin }) => {
  const user = await requireUser(req);
  const input = rules.validateProfileInput(body);
  if (input.name !== user.name) {
    const [first, ...rest] = input.name.split(' ');
    // email_id is resent unchanged: the update call takes the full identity block.
    await admin.userManagement().updateUserDetails(user.id, { first_name: first, last_name: rest.join(' '), email_id: user.email });
    await store.renameUser(user.id, input.name);
  }
  await store.saveProfile(user.id, input.phone);
  return { name: input.name, email: user.email, phone: input.phone };
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

route('POST', '/listings/:id/inquiries', async ({ req, body, store, params, admin }) => {
  const user = await requireUser(req);
  const input = rules.validateInquiryInput(body, publicUrlPrefix(user.id));
  const listing = await store.getListing(params.id);
  if (!listing) throw new ValidationError('Listing not found', 404);
  if (listing.seller_id === user.id) throw new ValidationError("You can't send an inquiry on your own listing", 409);
  if (listing.status !== 'Available') throw new ValidationError(`This item is ${listing.status.toLowerCase()}`, 409);
  if (input.offer_type !== listing.listing_type) throw new ValidationError(`This item is listed for ${listing.listing_type} only`, 400);
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
  await sendMail(admin, requestMail(inquiry, listing));
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

// ponytail: no live presence. Catalyst Cache GET is 1,000/month on the free tier, which a 5s chat poll
// burns in hours. "Seen" comes from the peer's *_read_at column, already on the inquiry row.
// Upgrade path: Catalyst Signals or an AppSail websocket for online/typing.
const otherRole = (role) => (role === 'buyer' ? 'seller' : 'buyer');

// Every Data Store query is one "Fetch" against a 10,000/month free quota, so poll ticks (?after=)
// skip the listing lookup and return only what changes: status, peer read mark, new messages.
route('GET', '/inquiries/:id/messages', async ({ req, store, params, query }) => {
  const user = await requireUser(req);
  const { inquiry, role } = await loadChat(store, user, params.id);
  if (inquiry.status === 'Pending') throw new ValidationError('Chat unlocks when the seller accepts the request', 409);
  const messages = await store.messagesForInquiry(inquiry.ROWID, query.after);
  const peer = { readAt: Number(inquiry[`${otherRole(role)}_read_at`]) || null };

  // Mark read only when something is unread, so polling doesn't write every time.
  const readKey = `${role}_read_at`;
  const readAt = Number(inquiry[readKey]) || 0;
  if (!readAt || Number(inquiry.last_message_at) > readAt || Number(inquiry[`${role}_unread`]) > 0) {
    await store.updateInquiry(inquiry.ROWID, { [readKey]: Date.now(), [`${role}_unread`]: 0 });
  }

  const open = inquiry.status === 'Accepted';
  if (query.after !== undefined) return { canSend: open, status: inquiry.status, peer, messages };

  const listing = await store.getListing(inquiry.listing_id);
  let contact = null;
  if (open) contact = role === 'buyer' ? rules.sellerContact(inquiry, listing) : { type: 'email', value: inquiry.buyer_email };
  return {
    role,
    canSend: open,
    status: inquiry.status,
    listing: listing
      ? { ROWID: listing.ROWID, title: listing.title, image_urls: listing.image_urls, category: listing.category, price: listing.price, listing_type: listing.listing_type }
      : null,
    counterpart: role === 'buyer' ? (listing ? listing.seller_name : 'Seller') : inquiry.buyer_name,
    contact,
    me: user.id,
    peer,
    swap: inquiry.swap_item ? { item: inquiry.swap_item, image_urls: inquiry.swap_image_urls } : null,
    messages,
  };
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
  const peerRole = otherRole(role);
  const peerUnread = `${peerRole}_unread`;
  const preview = input.body.replace(/\s+/g, ' ').slice(0, 80);
  await store.updateInquiry(inquiry.ROWID, {
    last_message_at: now,
    last_sender_id: user.id,
    last_message_preview: preview,
    [`${role}_read_at`]: now,
    [`${role}_unread`]: 0,
    [peerUnread]: (Number(inquiry[peerUnread]) || 0) + 1,
  });
  // Away-recipient email. Read before the update above lands, so this uses the counts the sender saw.
  if (rules.shouldEmailMessage({ unread: inquiry[peerUnread], readAt: inquiry[`${peerRole}_read_at`] })) {
    // Only the buyer's row carries its email; the seller's is on the listing (one extra fetch, only when emailing).
    const listing = role === 'buyer' ? await store.getListing(inquiry.listing_id) : null;
    const to = role === 'seller' ? inquiry.buyer_email : listing && listing.seller_email;
    const name = role === 'seller' ? inquiry.buyer_name : listing && listing.seller_name;
    if (to) await sendMail(admin, messageMail({ to, name, sender: user.name, title: inquiry.listing_title, preview, inquiryId: inquiry.ROWID }));
  }
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
  await sendMail(admin, acceptedMail(inquiry, listing, rules.sellerContact({ ...inquiry, ...share }, listing)));
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
    // TEMP diagnostic: DEBUG_ERRORS=1 returns the real 5xx message. Remove once the chat 500 is found.
    const show = status < 500 || process.env.DEBUG_ERRORS === '1';
    sendJson(res, status, { error: show ? `${err.message}${err.code ? ` [${err.code}]` : ''}` : 'Something went wrong. Please try again.' });
  }
};
