# Campus Sibling Handbook

How every part of the app behaves, for students using it and for whoever runs it. For setup and the pitch, see the [README](README.md).

## Quick tour

1. Sign in or create an account.
2. Browse and filter listings, or press `/` to search.
3. Open a listing and send a request (buy, swap, or take for free).
4. The seller gets an in-app alert and an email, then accepts or declines.
5. On accept, the item flips to Reserved and a chat opens. The buyer gets an email.
6. After the handover the seller marks the item Completed.

## Accounts and sign-in

- **Create account** — first name, optional last name, and email. A link arrives by email to set the password, then you sign in.
- **Campus rule** — production accepts only `@vit.edu` emails (`ALLOWED_EMAIL_DOMAINS`). The demo build accepts any email, and the login page says so.
- **Sign out** — account menu (top right). Your email is your identity and cannot be edited.
- **Protected pages** — Sell, My listings, Chats and Profile send you to sign-in first and bring you back after.

## Browse, search and filters

- **Search** — matches words in title, description and category. All words must match. Press `/` anywhere to jump to the search box.
- **Filters** — category, condition, exchange type (sale, swap, free), availability, and a price range. Each option shows how many items match.
- **Availability default** — shows Available and Reserved. Completed items appear only if you tick "Completed (gone)".
- **Price range** — free items count as ₹0. Swap items are hidden while a price range is set.
- **Sort** — newest, oldest, price low to high, price high to low.
- **Shareable** — every filter lives in the page URL, so a copied link reproduces the same results.
- **On phones** — filters open in a bottom sheet and sort sits beside the Filters button.
- **Loading** — skeleton cards hold the layout while the list loads. A failed load shows an error with a retry button.

## Listing an item

Open **Sell** (sign-in required).

| Field | Rule |
|---|---|
| Photos | 1 to 5. Compressed in your browser before upload. JPEG, PNG or WebP, up to 5 MB each. The first photo is the cover. |
| Title | 3 to 80 characters |
| Category | Books, Calculators & Electronics, Lab Supplies, Stationery, Hostel Essentials, Other |
| Condition | New, Once used, Used more than once |
| Description | Optional, up to 2,000 characters |
| Exchange type | For sale, Swap, or Free |
| Price | Required only for sale: ₹1 to ₹1,00,000 |

The Category and Condition pickers show an error after you try to publish without choosing. Choosing a condition or exchange type shows what it means underneath.

## Listing page

- **Gallery** — swipe on phones, thumbnails on desktop. Listings without a photo show a tinted placeholder for their category.
- **Details card** — condition, exchange type, category and listing age, each with a colored icon and a one-line meaning.
- **Condition colors** — New green, Once used lime, Used more than once amber.
- **Seller card** — name and a reminder that contact details appear only after acceptance.
- **Signed out** — a "Sign in to send a request" button.
- **Signed in as a buyer** — the request form (see next section).
- **Item not Available** — a note that it is Reserved or Completed, with a link to similar items.
- **Safety tips** — meet in a public place on campus and check the item first.

## Requests and swaps

- **Request form** — choose Buy it, Swap for something, or Take it for free (defaults to the listing's type), then write a message of up to 500 characters.
- **Swap offers** — you must say what you are offering (2 to 100 characters) and can add up to 3 photos of it. The seller sees them in the request and pinned in the chat.
- **Rules** — you cannot request your own item, the item must be Available, and you can have only one pending request per item.
- **Where it shows** — the request appears in the seller's Chats under Pending, and in yours under Pending too.

## Accepting and declining

- **Decline** — the request moves to Declined for both people. No chat opens and no email is sent.
- **Accept** — opens a dialog where the seller picks what the buyer sees: their email, or a phone number they type in (10 to 15 digits, optional `+`).
- **After accepting** — the item becomes Reserved, every other pending request on it is declined, the chat unlocks, and the buyer is emailed.
- **Contact** — the chosen contact appears in the chat's item card. It is never shown before acceptance.

## Item status rules

| From | The seller can move it to |
|---|---|
| Available | Completed |
| Reserved | Completed (handover done), or Available (deal fell through) |
| Completed | Nothing, it is final |

- **Reserved cannot be set by hand.** It only happens by accepting a request, so a buyer is always attached.
- **Back to Available** — the accepted request is declined and the chat closes.
- **Enforced on the server**, not only in the interface.
- **Seller controls** — on your own listing page: mark completed, mark available again, or jump to your requests.

## Chats

Open **Chats** from the header. One list shows requests you sent (Buying) and received (Selling), grouped Accepted, Pending and Declined.

- **Search chats** — filters the list by item name, the other person's name, or the last message.
- **Rows** — last message preview, time, a Buying or Selling chip, a status chip, and a green count for unread messages. "New" marks a fresh request or an acceptance you have not opened.
- **Conversation** — the other person's name and role, a pinned item card (photo, price, status, shared contact), then messages with day dividers.
- **Messages** — up to 1,000 characters. Enter sends, Shift+Enter adds a line.
- **Seen** — a "Seen" mark appears under your last message once the other person has read it.
- **Only accepted requests can chat.** Pending requests show the request itself, with Accept and Decline for the seller. Declined requests show a closed notice.
- **Closed chats** — if the item goes back to Available, the chat becomes read-only.

## Alerts inside the app

- **Bell** — lists new requests (for sellers), accepted requests you have not opened (for buyers), and unread messages.
- **Chats link** — shows the unread count.
- **Toast** — a pop-up with an Open button when something new arrives while you browse.
- **Tab title** — shows the count, for example `(2) Campus Sibling`.
- **Refresh rhythm** — a quiet chat checks for new messages every 5 seconds at first, slowing to every 30 seconds. The bell checks every 30 seconds. Nothing refreshes while the tab is hidden or after 5 minutes without input; it resumes when you return.

## Email alerts

Emails go to people who are away from the site. Three events send mail:

| Event | Who gets it | When |
|---|---|---|
| Buyer sends a request | Seller | Right away, once per request. A buyer cannot have two pending requests on one item. |
| Seller accepts | Buyer | Right away. Includes the contact the seller chose to share. |
| Chat message | The other person | On send, only if both rules below hold |

**Chat message rules (both must hold)**

1. The recipient has no unread messages in that chat. A second message while the first is unread sends nothing, so it is one email per burst.
2. The recipient has not read that chat in the last 5 minutes, or has never read it.

**Never emailed:** declines, the automatic declines when another request is accepted, status changes (Reserved, Completed), your own messages, and anything when the mail service fails (the action still succeeds).

**What each email contains:** the sender, the item, and an Open chat button. Message emails add the first 80 characters of the message.

**Known limits**

- There is no live "online" signal, so someone sitting on the chat page with nothing unread for 5 or more minutes can still get an email for a new message.
- Someone who read a chat 3 minutes ago and then closed the tab gets no email for the next message.

**Example:** A messages B, who was last in the chat 10 minutes ago. B gets an email. A sends two more straight away, and B gets nothing. B opens the chat and reads them. Six minutes later A writes again, and B gets another email.

## Profile

Open **Profile** from the account menu.

- **Name** — shown on your listings and requests.
- **Email** — read only. It is your login and proves you are on campus.
- **Phone** — optional, 10 to 15 digits. Shared only if you choose it when accepting a request.

## Accessibility and polish

- **Tooltips** — every icon-only button, status chip and unread badge explains itself on hover and keyboard focus, and Escape closes it.
- **Skeletons** — every list and page uses placeholders that match the final layout, with no blank flashes.
- **Errors** — failed loads show a message and a retry button in place of the content.
- **Installable** — the app has a phone manifest, so it can be added to a home screen.

## Limits at a glance

| Item | Limit |
|---|---|
| Photos per listing | 5, up to 5 MB each |
| Swap photos per request | 3 |
| Title | 3 to 80 characters |
| Description | 2,000 characters |
| Price | ₹1 to ₹1,00,000 |
| Request message | 500 characters |
| Swap item name | 2 to 100 characters |
| Chat message | 1,000 characters |
| Search scan | 900 listings per load |

## Running it

Settings for whoever deploys. Secrets never go in `catalyst-config.json`, because that file is public.

| Variable | Where | Purpose |
|---|---|---|
| `ALLOWED_EMAIL_DOMAINS` | `catalyst-config.json` | Allowed sign-up domains. `*` opens sign-up to any email. |
| `APP_URL` | `catalyst-config.json` | Where sign-up and email links return users |
| `AUTH_ZAID`, `STRATUS_BUCKET`, `STRATUS_PUBLIC_BASE` | `catalyst-config.json` | Catalyst auth and photo storage |
| `MAIL_FROM` | `catalyst-config.json` | Catalyst Mail sender, used only when SMTP is not set |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Catalyst console | Sends email through your own SMTP account. For Gmail or Google Workspace, `SMTP_PASS` is an app password. |

**Free-tier quotas** (monthly, shared by Development and Production):

| Service | Free allowance | How the app stays inside it |
|---|---|---|
| Data Store fetches | 10,000 | Slower, idle-aware polling, a 60-second browse cache, and a lighter chat refresh |
| Data Store updates | 1,000 | Read marks are written only when something is unread |
| Cache reads | 1,000 | Not used at all |
| Mail (Catalyst) | 100 | Only used if SMTP is not configured |

## Known limits

- Messages arrive within seconds when a chat is active but can take up to 30 seconds when it is quiet. Instant delivery would need Catalyst Signals or a websocket.
- Search runs in memory over up to 900 listings, which is plenty for one campus.
- Another user's new listing can take up to 60 seconds to appear in a browse tab that was already open. Your own changes appear immediately.
- Photo size is checked from the size the browser declares. A stronger server-side check is a possible upgrade.
