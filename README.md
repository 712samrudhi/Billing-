# Krushi Bill — Node.js + React + MySQL

The original single-file HTML app has been converted into a
**Node.js + React (Vite) frontend** talking to a **Node.js + Express +
MySQL backend**. Supabase is completely replaced — your own MySQL
database and your own login now power the app. UI, business logic,
GST/billing/stock calculations — all unchanged.

## What changed vs. the earlier version

- Supabase (Postgres, hosted auth) → your own MySQL database + a small
  JWT-based login (`server/`).
- `src/dbClient.js` is a drop-in replacement for the Supabase JS client:
  it exposes the exact same `.from(table).select().eq().order()`,
  `.insert().select().single()`, `.update().eq()`,
  `.upsert(obj, {onConflict})`, `.delete().eq()`, and
  `.auth.signInWithPassword/.signOut/.getSession` shape — so
  `src/krushiApp.js` (your original app logic) needed only a 3-line
  change at the very top (swap which client it talks to).
- Your actual exported data (`server/data/nutrientfert_mysql.sql`) is
  used as-is — same table/column names the app already expects
  (`price`, `low_stock`, `dealer_price`, `retail_price`, `gst_percent`,
  `extra` JSON, etc.), same rows, same values.

## One-time database setup

```bash
# 1) create the database + the `users` table (for login)
mysql -u root -p < server/schema.sql

# 2) load your real data (products, customers, invoices, settings)
mysql -u root -p nutrientfert_bill < server/data/nutrientfert_mysql.sql

# 3) add the one constraint your export was missing — a UNIQUE key on
#    settings.company_id, needed so "save settings" can upsert per company
mysql -u root -p nutrientfert_bill < server/schema_after_import.sql

# 4) create your first login
cd server
cp .env.example .env      # edit DB_USER / DB_PASSWORD / JWT_SECRET as needed
npm install
node seed-user.js you@example.com yourpassword
```

## Running it

Two processes — backend and frontend:

```bash
# Terminal 1 — backend API (MySQL)
cd server
npm run dev            # http://localhost:4000

# Terminal 2 — frontend (React)
cd ..
cp .env.example .env    # VITE_API_URL, defaults to http://localhost:4000/api
npm install
npm run dev             # http://localhost:5173
```

Open `http://localhost:5173`, log in with the email/password you
created in step 4, and everything — Dashboard, New Bill, Stock,
Invoices, Customers, Business Accounts, Reports — works exactly as it
did before, now against your own MySQL database.

## Project structure

```
krushi-bill-react/
├── index.html
├── package.json
├── vite.config.js
├── .env.example            # VITE_API_URL for the frontend
├── src/
│   ├── main.jsx
│   ├── App.jsx              # mounts original markup, runs original JS
│   ├── appMarkup.html       # original body HTML, unchanged
│   ├── krushiApp.js         # original app JS, unchanged except the client swap
│   ├── dbClient.js          # NEW: Supabase-compatible client → your MySQL API
│   └── styles.css           # original CSS, unchanged
└── server/                  # NEW: Express + MySQL backend
    ├── index.js              # wires routes; column lists match your real tables
    ├── db.js                 # MySQL connection pool
    ├── routes/
    │   ├── auth.js            # login/session/logout (JWT, replaces Supabase Auth)
    │   └── generic.js         # generic table router (select/insert/update/upsert/delete)
    ├── seed-user.js           # creates/updates a login
    ├── schema.sql             # STEP 1: database + users table
    ├── schema_after_import.sql # STEP 3: adds the missing UNIQUE key
    ├── data/
    │   └── nutrientfert_mysql.sql   # YOUR real exported data, untouched
    └── .env.example
```

## Tested end-to-end

Every operation the app actually performs was run against a live MySQL
database loaded with your real data before this was handed to you:
login, session check, loading products/customers/invoices/settings for
a company, listing companies for the switcher, creating an invoice
(insert), adjusting stock (update), editing a customer, deleting a
product, and saving company settings for both a new company and an
existing one (upsert) — confirmed it correctly *updates* rather than
duplicating a row on repeat saves.

## Works online AND offline

- **Online / deployed**: set `VITE_API_URL` (frontend `.env`) to wherever
  you host `server/`, build with `npm run build`, and deploy the `dist/`
  folder to any static host (Netlify, Vercel, your own server, etc.).
  The backend (`server/`) can run anywhere Node + MySQL are available
  (a VPS, Railway, Render + a MySQL host, etc.) — it's a plain Express app.
- **Offline / no internet**: two things make this work —
  1. **App shell** — the app is now a PWA (`vite-plugin-pwa`). After the
     first successful visit, the page, its JS/CSS, and the manifest are
     cached by a service worker, so the app still *opens* with zero
     internet.
  2. **Data** — `src/dbClient.js` caches every read in `localStorage` and
     serves that cache automatically if a request fails offline. Any
     bill/entry made while offline (insert/update/delete/settings save)
     is queued in a local "outbox" and applied to the screen immediately;
     it's sent to MySQL automatically the moment the connection returns
     (checked on the browser's `online` event and every ~20s). A thin
     status strip at the top of the screen shows "Offline — working from
     saved data" or "Syncing N changes…" when relevant — this is new UI,
     it doesn't touch any of the original screens.

Note the trade-off inherent to any offline-first app: the very first
visit still needs internet (to cache the shell and pull the first batch
of data), and if two people edit the *same* record while both offline,
the one who reconnects last simply overwrites the other's change —
there's no conflict-merge logic. For a single-shop, single-device use
this is fine; flag it if you'll have multiple people editing at once.


## Other notes

Accounts data (ledger transactions, bank accounts, opening stock under
"Business Accounts") was never in Supabase in the original app — it
lived in the browser's `localStorage` and still does here. That part
is unrelated to this migration and works exactly as before, online or
offline (it was already local-only).
