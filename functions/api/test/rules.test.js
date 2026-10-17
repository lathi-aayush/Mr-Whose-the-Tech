'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const r = require('../lib/rules');

const PREFIX = 'https://bucket-development.zohostratus.in/listings/42/';
const base = {
  title: 'Casio fx-991ES',
  description: 'Works fine',
  category: 'Calculators & Electronics',
  item_condition: 'Good',
  listing_type: 'sell',
  price: 450,
  image_urls: [`${PREFIX}photo-1.webp`],
};

test('isAllowedEmail matches the exact domain only', () => {
  const allowed = r.parseAllowedDomains(' VIT.edu , vitstudent.ac.in ');
  assert.equal(r.isAllowedEmail('a.b@vit.edu', allowed), true);
  assert.equal(r.isAllowedEmail('A@VIT.EDU', allowed), true);
  assert.equal(r.isAllowedEmail('x@vit.edu.evil.com', allowed), false);
  assert.equal(r.isAllowedEmail('x@notvit.edu', allowed), false);
  assert.equal(r.isAllowedEmail('x@gmail.com', allowed), false);
  assert.equal(r.isAllowedEmail('not-an-email', allowed), false);
  assert.equal(r.isAllowedEmail(undefined, allowed), false);
  // Demo mode still rejects malformed input.
  assert.equal(r.isAllowedEmail('judge@gmail.com', r.parseAllowedDomains('*')), true);
  assert.equal(r.isAllowedEmail('not-an-email', r.parseAllowedDomains('*')), false);
});

test('validateListingInput accepts a valid sell listing', () => {
  const l = r.validateListingInput(base, PREFIX);
  assert.equal(l.price, 450);
  assert.deepEqual(l.image_urls, base.image_urls);
});

test('validateListingInput requires price for sell and drops it for free', () => {
  assert.throws(() => r.validateListingInput({ ...base, price: 0 }, PREFIX), /Price/);
  assert.equal(r.validateListingInput({ ...base, listing_type: 'free', price: 99 }, PREFIX).price, null);
});

test('validateListingInput rejects foreign or other users image URLs', () => {
  assert.throws(() => r.validateListingInput({ ...base, image_urls: ['https://unsplash.com/x.jpg'] }, PREFIX), /uploaded/);
  assert.throws(
    () => r.validateListingInput({ ...base, image_urls: [PREFIX.replace('/42/', '/43/') + 'a.webp'] }, PREFIX),
    /uploaded/,
  );
  assert.throws(() => r.validateListingInput({ ...base, image_urls: [`${PREFIX}../43/a.webp`] }, PREFIX), /uploaded/);
  assert.throws(() => r.validateListingInput({ ...base, image_urls: [] }, PREFIX), /at least one/);
});

test('validateListingInput rejects unknown enums', () => {
  assert.throws(() => r.validateListingInput({ ...base, category: 'Weapons' }, PREFIX), /Category/);
  assert.throws(() => r.validateListingInput({ ...base, item_condition: 'Broken' }, PREFIX), /Condition/);
});

test('owner transitions follow the state machine', () => {
  assert.doesNotThrow(() => r.assertOwnerTransition('Available', 'Completed'));
  assert.doesNotThrow(() => r.assertOwnerTransition('Reserved', 'Available'));
  assert.doesNotThrow(() => r.assertOwnerTransition('Reserved', 'Completed'));
  assert.throws(() => r.assertOwnerTransition('Available', 'Reserved'), /Cannot/);
  assert.throws(() => r.assertOwnerTransition('Completed', 'Available'), /Cannot/);
  assert.throws(() => r.assertOwnerTransition('Available', 'Sold'), /Status/);
});

test('validateUploadRequest allows images up to 5 MB only', () => {
  assert.equal(r.validateUploadRequest({ contentType: 'image/webp', size: 200000 }).ext, 'webp');
  assert.throws(() => r.validateUploadRequest({ contentType: 'image/svg+xml', size: 10 }), /JPEG/);
  assert.throws(() => r.validateUploadRequest({ contentType: 'image/png', size: 6 * 1024 * 1024 }), /5 MB/);
});

test('validateMessageInput trims, keeps newlines, rejects empty and oversized', () => {
  assert.equal(r.validateMessageInput({ body: '  hi\nthere  ' }).body, 'hi\nthere');
  assert.throws(() => r.validateMessageInput({ body: '   ' }), /empty/);
  assert.throws(() => r.validateMessageInput({ body: 'x'.repeat(1001) }), /1000/);
  assert.throws(() => r.validateMessageInput({ body: 5 }), /text/);
});

test('chatRole identifies buyer, seller and strangers', () => {
  const inq = { buyer_id: '1', seller_id: '2' };
  assert.equal(r.chatRole(inq, '1'), 'buyer');
  assert.equal(r.chatRole(inq, 2), 'seller');
  assert.equal(r.chatRole(inq, '3'), null);
  assert.equal(r.chatRole(null, '1'), null);
});

test('validateContactShare: email, normalised phone, bad input', () => {
  assert.deepEqual(r.validateContactShare({ share: 'email' }), { shared_contact: 'email', seller_phone: null });
  assert.deepEqual(r.validateContactShare({ share: 'phone', phone: '+91 98765-43210' }), { shared_contact: 'phone', seller_phone: '+919876543210' });
  assert.throws(() => r.validateContactShare({ share: 'phone', phone: '12345' }), /phone/);
  assert.throws(() => r.validateContactShare({ share: 'phone', phone: 'call me' }), /phone/);
  assert.throws(() => r.validateContactShare({ share: 'phone' }), /phone/);
  assert.throws(() => r.validateContactShare({ share: 'fax' }), /Contact choice/);
  assert.throws(() => r.validateContactShare({}), /Contact choice/);
});

test('sellerContact only reveals the chosen detail; legacy rows get email', () => {
  const listing = { seller_email: 's@x.edu' };
  assert.deepEqual(r.sellerContact({ shared_contact: 'phone', seller_phone: '9876543210' }, listing), { type: 'phone', value: '9876543210' });
  assert.deepEqual(r.sellerContact({ shared_contact: 'email' }, listing), { type: 'email', value: 's@x.edu' });
  assert.deepEqual(r.sellerContact({ shared_contact: null }, listing), { type: 'email', value: 's@x.edu' });
});

test('unreadNotifications: approval for buyer, messages from the other side only', () => {
  const base = { ROWID: '9', listing_title: 'Book', status: 'Accepted', buyer_id: 'b', seller_id: 's' };
  // Buyer has not opened the chat yet: approval notification.
  assert.deepEqual(r.unreadNotifications([base], 'b').map((n) => n.kind), ['accepted']);
  // Seller already knows they accepted.
  assert.deepEqual(r.unreadNotifications([base], 's'), []);
  // New message from the other side.
  const msg = { ...base, buyer_read_at: 100, last_message_at: 200, last_sender_id: 's' };
  assert.deepEqual(r.unreadNotifications([msg], 'b').map((n) => n.kind), ['message']);
  // Message notifications carry the unread count and preview for the toast.
  const counted = { ...msg, buyer_unread: 3, last_message_preview: 'is it still there?' };
  const [note] = r.unreadNotifications([counted], 'b');
  assert.equal(note.count, 3);
  assert.equal(note.preview, 'is it still there?');
  // Own message is not unread; neither is a message older than read_at.
  assert.deepEqual(r.unreadNotifications([msg], 's'), []);
  assert.deepEqual(r.unreadNotifications([{ ...msg, buyer_read_at: 300 }], 'b'), []);
  // Pending notifies the seller (they must act), not the buyer; declined and strangers never notify.
  assert.deepEqual(r.unreadNotifications([{ ...base, status: 'Pending' }], 's').map((n) => n.kind), ['request']);
  assert.deepEqual(r.unreadNotifications([{ ...base, status: 'Pending' }], 'b'), []);
  assert.deepEqual(r.unreadNotifications([{ ...base, status: 'Declined' }], 's'), []);
  assert.deepEqual(r.unreadNotifications([base], 'x'), []);
});

test('validateInquiryInput: swap needs an item, limits and owns photos, others drop swap fields', () => {
  const swap = { message: 'hi', offer_type: 'swap', swap_item: '  HC Verma  Vol 1 ', swap_image_urls: [`${PREFIX}a.webp`] };
  const ok = r.validateInquiryInput(swap, PREFIX);
  assert.equal(ok.swap_item, 'HC Verma Vol 1');
  assert.deepEqual(ok.swap_image_urls, [`${PREFIX}a.webp`]);
  assert.throws(() => r.validateInquiryInput({ ...swap, swap_item: '' }, PREFIX), /offering/);
  assert.throws(() => r.validateInquiryInput({ ...swap, swap_item: undefined }, PREFIX), /offering/);
  assert.throws(() => r.validateInquiryInput({ ...swap, swap_image_urls: Array(4).fill(`${PREFIX}a.webp`) }, PREFIX), /At most 3/);
  assert.throws(() => r.validateInquiryInput({ ...swap, swap_image_urls: ['https://evil.com/x.jpg'] }, PREFIX), /uploaded/);
  assert.equal(r.validateInquiryInput({ ...swap, swap_image_urls: undefined }, PREFIX).swap_image_urls.length, 0);
  const buy = r.validateInquiryInput({ ...swap, offer_type: 'sell' }, PREFIX);
  assert.equal(buy.swap_item, null);
  assert.deepEqual(buy.swap_image_urls, []);
});

test('searchListings filters, hides Completed by default and sorts deterministically', () => {
  const rows = [
    { ROWID: '1', CREATEDTIME: '2026-10-17 10:00:00:000', title: 'Physics textbook', description: 'HC Verma', category: 'Books', item_condition: 'Good', listing_type: 'sell', price: 200, status: 'Available' },
    { ROWID: '2', CREATEDTIME: '2026-10-17 11:00:00:000', title: 'Lab coat', description: 'size M', category: 'Lab Supplies', item_condition: 'Like New', listing_type: 'free', price: null, status: 'Reserved' },
    { ROWID: '3', CREATEDTIME: '2026-10-17 12:00:00:000', title: 'Chemistry textbook', description: '', category: 'Books', item_condition: 'Fair', listing_type: 'sell', price: 150, status: 'Completed' },
  ];
  assert.deepEqual(r.searchListings(rows, {}).map((l) => l.ROWID), ['2', '1']);
  assert.deepEqual(r.searchListings(rows, { q: 'TEXTBOOK  physics' }).map((l) => l.ROWID), ['1']);
  assert.deepEqual(r.searchListings(rows, { status: 'Completed' }).map((l) => l.ROWID), ['3']);
  assert.deepEqual(r.searchListings(rows, { status: 'all' }).map((l) => l.ROWID), ['3', '2', '1']);
  assert.deepEqual(r.searchListings(rows, { category: 'Books' }).map((l) => l.ROWID), ['1']);
  assert.deepEqual(r.searchListings(rows, { sort: 'price_desc' }).map((l) => l.ROWID), ['1', '2']);
  assert.deepEqual(r.searchListings(rows, { sort: 'oldest' }).map((l) => l.ROWID), ['1', '2']);
});
