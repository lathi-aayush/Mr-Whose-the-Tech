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
