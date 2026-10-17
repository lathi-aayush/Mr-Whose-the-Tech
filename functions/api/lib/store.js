'use strict';
// Data Store access. All ZCQL goes through here so escaping and row unwrapping live in one place.

const LISTING_COLUMNS = [
  'ROWID', 'CREATEDTIME', 'seller_id', 'seller_name', 'title', 'description', 'category',
  'item_condition', 'listing_type', 'price', 'status', 'image_urls', 'spin_url',
];
const PAGE = 300; // ZCQL hard cap per SELECT
const MAX_SCAN = 900;

function id(value) {
  const s = String(value);
  if (!/^\d{1,20}$/.test(s)) {
    const err = new Error('Invalid id');
    err.status = 400;
    throw err;
  }
  return s;
}

function str(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parseListing(row) {
  let images = [];
  try {
    images = JSON.parse(row.image_urls || '[]');
  } catch {
    images = [];
  }
  return { ...row, price: row.price === null || row.price === '' ? null : Number(row.price), image_urls: images };
}

function parseInquiry(row) {
  let images = [];
  try {
    images = JSON.parse(row.swap_image_urls || '[]');
  } catch {
    images = [];
  }
  return { ...row, swap_image_urls: images };
}

function createStore(adminApp) {
  const zcql = adminApp.zcql();
  const listings = adminApp.datastore().table('Listings');
  const inquiries = adminApp.datastore().table('Inquiries');
  const messages = adminApp.datastore().table('Messages');
  const profiles = adminApp.datastore().table('Profiles');

  async function query(sql, table) {
    const rows = await zcql.executeZCQLQuery(sql);
    return rows.map((r) => r[table]);
  }

  async function scan(sqlWithoutLimit, table) {
    // ponytail: in-memory search caps at 900 listings. Upgrade path: Catalyst Search service.
    const out = [];
    for (let offset = 0; offset < MAX_SCAN; offset += PAGE) {
      const rows = await query(`${sqlWithoutLimit} LIMIT ${offset}, ${PAGE}`, table);
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
  }

  return {
    async allListings() {
      const rows = await scan(`SELECT ${LISTING_COLUMNS.join(', ')} FROM Listings ORDER BY CREATEDTIME DESC`, 'Listings');
      return rows.map(parseListing);
    },

    async listingsBySeller(sellerId) {
      const rows = await scan(
        `SELECT ${LISTING_COLUMNS.join(', ')} FROM Listings WHERE seller_id = ${str(sellerId)} ORDER BY CREATEDTIME DESC`,
        'Listings',
      );
      return rows.map(parseListing);
    },

    async getListing(listingId) {
      const rows = await query(`SELECT * FROM Listings WHERE ROWID = ${id(listingId)}`, 'Listings');
      return rows[0] ? parseListing(rows[0]) : null;
    },

    async createListing(data) {
      const row = await listings.insertRow({ ...data, image_urls: JSON.stringify(data.image_urls) });
      return parseListing(row);
    },

    // Seed tooling only: hands rows to another owner.
    async reassignListings(ids, fields) {
      // Batches of 5: all at once trips Catalyst's concurrency limit (TOO_MANY_REQUESTS).
      for (let i = 0; i < ids.length; i += 5) {
        await Promise.all(ids.slice(i, i + 5).map((rowId) => listings.updateRow({ ...fields, ROWID: id(rowId) })));
      }
    },

    // Seed cleanup only; listings are never deleted by users. Chunked to stay under the per-call id cap.
    async deleteListings(ids) {
      for (let i = 0; i < ids.length; i += 100) await listings.deleteRows(ids.slice(i, i + 100).map(id));
    },

    async updateListingStatus(listingId, status) {
      return listings.updateRow({ ROWID: id(listingId), status });
    },

    async getInquiry(inquiryId) {
      const rows = await query(`SELECT * FROM Inquiries WHERE ROWID = ${id(inquiryId)}`, 'Inquiries');
      return rows[0] ? parseInquiry(rows[0]) : null;
    },

    async inquiriesForListing(listingId) {
      const rows = await scan(`SELECT * FROM Inquiries WHERE listing_id = ${id(listingId)} ORDER BY CREATEDTIME DESC`, 'Inquiries');
      return rows.map(parseInquiry);
    },

    async inquiriesByBuyer(buyerId) {
      const rows = await scan(`SELECT * FROM Inquiries WHERE buyer_id = ${str(buyerId)} ORDER BY CREATEDTIME DESC`, 'Inquiries');
      return rows.map(parseInquiry);
    },

    async inquiriesForSeller(sellerId) {
      const rows = await scan(`SELECT * FROM Inquiries WHERE seller_id = ${str(sellerId)} ORDER BY CREATEDTIME DESC`, 'Inquiries');
      return rows.map(parseInquiry);
    },

    // One Profiles row per user (user_id, phone); name lives on the Catalyst user.
    async getProfile(userId) {
      const rows = await query(`SELECT * FROM Profiles WHERE user_id = ${str(userId)}`, 'Profiles');
      return rows[0] || null;
    },

    async saveProfile(userId, phone) {
      const existing = await this.getProfile(userId);
      if (existing) return profiles.updateRow({ ROWID: existing.ROWID, phone });
      return profiles.insertRow({ user_id: String(userId), phone });
    },

    // Names are copied onto rows at write time, so a rename has to rewrite the user's own rows.
    // Only rows whose name differs are touched, which keeps a no-op rename free.
    async renameUser(userId, name) {
      const [mine, asBuyer] = await Promise.all([this.listingsBySeller(userId), this.inquiriesByBuyer(userId)]);
      await Promise.all([
        ...mine.filter((l) => l.seller_name !== name).map((l) => listings.updateRow({ ROWID: id(l.ROWID), seller_name: name })),
        ...asBuyer.filter((i) => i.buyer_name !== name).map((i) => inquiries.updateRow({ ROWID: id(i.ROWID), buyer_name: name })),
      ]);
    },

    async createInquiry(data) {
      const row = await inquiries.insertRow({ ...data, swap_image_urls: JSON.stringify(data.swap_image_urls || []) });
      return parseInquiry(row);
    },

    async updateInquiry(inquiryId, fields) {
      return inquiries.updateRow({ ...fields, ROWID: id(inquiryId) });
    },

    async updateInquiryStatus(inquiryId, status) {
      return this.updateInquiry(inquiryId, { status });
    },

    // sent_at is epoch ms; Number() keeps a hostile ?after= out of the SQL.
    async messagesForInquiry(inquiryId, afterMs = 0) {
      const after = Number.isFinite(Number(afterMs)) ? Math.max(0, Math.floor(Number(afterMs))) : 0;
      return scan(
        `SELECT * FROM Messages WHERE inquiry_id = ${id(inquiryId)} AND sent_at > ${after} ORDER BY sent_at ASC`,
        'Messages',
      );
    },

    async createMessage(data) {
      return messages.insertRow(data);
    },
  };
}

module.exports = { createStore };
