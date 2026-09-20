// This module replaces the Supabase JS client. It exposes the exact same
// chainable interface (.from(table).select().eq().order().maybeSingle(),
// .insert().select().single(), .update().eq(), .upsert(obj,{onConflict}),
// .delete().eq(), plus .auth.signInWithPassword / .signOut / .getSession)
// so that krushiApp.js — the original app logic — needs zero changes beyond
// swapping which client it talks to.
//
// OFFLINE SUPPORT: every select() caches its result in localStorage. If a
// later request fails because there is no network, cached data is served
// instead. Every write (insert/update/upsert/delete) that fails offline is
// queued in a local "outbox" and applied optimistically to the cache, then
// replayed against the server automatically once the connection returns.

const SESSION_KEY = 'krushi_session_token';
const CACHE_PREFIX = 'krushi_cache::';
const OUTBOX_KEY = 'krushi_outbox';
const API_BASE = (import.meta.env && import.meta.env.VITE_API_URL) || 'http://localhost:4000/api';

function getToken() {
  return localStorage.getItem(SESSION_KEY);
}

// A failed fetch (DNS/connection refused/timeout) throws before a Response
// exists — that's "we're offline". An HTTP error (400/401/500...) means the
// server WAS reached, so it should never fall back to the cache/outbox.
function isNetworkFailure(e) {
  return e instanceof TypeError || e?.message === 'Failed to fetch' || e?.name === 'TypeError';
}

// ---------- local read cache ----------
const cache = {
  key(table, qs) {
    return CACHE_PREFIX + table + '::' + qs;
  },
  save(table, qs, rows) {
    try {
      localStorage.setItem(this.key(table, qs), JSON.stringify({ rows, ts: Date.now() }));
    } catch (e) {
      /* storage full or unavailable — offline cache is best-effort */
    }
  },
  load(table, qs) {
    try {
      const raw = localStorage.getItem(this.key(table, qs));
      if (!raw) return null;
      return JSON.parse(raw).rows;
    } catch (e) {
      return null;
    }
  },
  // Applies a locally-made change to every cached select result for this
  // table, so the UI sees it immediately even before the write reaches the
  // server. `updater` gets the cached row array and returns the new array.
  patchAllForTable(table, updater) {
    const prefix = CACHE_PREFIX + table + '::';
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(k));
        parsed.rows = updater(parsed.rows || []);
        localStorage.setItem(k, JSON.stringify(parsed));
      } catch (e) {
        /* ignore malformed cache entry */
      }
    }
  }
};

// ---------- outbox (queued writes made while offline) ----------
const outbox = {
  list() {
    try {
      return JSON.parse(localStorage.getItem(OUTBOX_KEY)) || [];
    } catch (e) {
      return [];
    }
  },
  save(items) {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  },
  push(op) {
    const items = this.list();
    items.push({ ...op, queuedAt: Date.now(), opId: crypto.randomUUID() });
    this.save(items);
    notifyListeners();
  },
  remove(opId) {
    this.save(this.list().filter((o) => o.opId !== opId));
    notifyListeners();
  },
  count() {
    return this.list().length;
  }
};

const listeners = new Set();
function notifyListeners() {
  const count = outbox.count();
  listeners.forEach((fn) => fn(count));
}
// Lets App.jsx show a "N changes waiting to sync" banner without touching
// the original app logic at all.
export function onOutboxChange(fn) {
  listeners.add(fn);
  fn(outbox.count());
  return () => listeners.delete(fn);
}

async function authHeaders() {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return headers;
}

// Sends one real network request for a queued (or live) write. Thrown
// errors mean "still offline" and are left for the caller to handle.
async function sendWrite(op) {
  const headers = await authHeaders();
  if (op.mode === 'insert') {
    const res = await fetch(`${API_BASE}/${op.table}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(op.payload)
    });
    const json = await res.json();
    if (!res.ok) throw Object.assign(new Error('server'), { serverError: json.error });
    return json.data;
  }
  if (op.mode === 'update') {
    const res = await fetch(`${API_BASE}/${op.table}/${op.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(op.payload)
    });
    const json = await res.json();
    if (!res.ok) throw Object.assign(new Error('server'), { serverError: json.error });
    return json.data;
  }
  if (op.mode === 'upsert') {
    const res = await fetch(
      `${API_BASE}/${op.table}/upsert?onConflict=${encodeURIComponent(op.onConflict || 'id')}`,
      { method: 'POST', headers, body: JSON.stringify(op.payload) }
    );
    const json = await res.json();
    if (!res.ok) throw Object.assign(new Error('server'), { serverError: json.error });
    return json.data;
  }
  if (op.mode === 'delete') {
    const res = await fetch(`${API_BASE}/${op.table}/${op.id}`, { method: 'DELETE', headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error('server'), { serverError: json.error });
    return null;
  }
}

let syncing = false;
export async function syncOutbox() {
  if (syncing) return;
  syncing = true;
  try {
    for (const op of outbox.list()) {
      try {
        await sendWrite(op);
        outbox.remove(op.opId);
      } catch (e) {
        if (isNetworkFailure(e)) break; // still offline — stop, try again later
        outbox.remove(op.opId); // server rejected it outright — drop it, don't retry forever
      }
    }
  } finally {
    syncing = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => syncOutbox());
  // also retry periodically in case 'online' fires before the server is
  // actually reachable again
  setInterval(() => syncOutbox(), 20000);
  // attempt a sync shortly after load too
  setTimeout(() => syncOutbox(), 1500);
}

class QueryBuilder {
  constructor(table) {
    this.table = table;
    this._select = '*';
    this._filters = [];
    this._order = null;
    this._mode = 'select';
    this._payload = null;
    this._onConflict = null;
    this._single = false;
    this._maybeSingle = false;
  }

  select(cols) {
    this._select = cols || '*';
    return this;
  }
  eq(col, val) {
    this._filters.push([col, val]);
    return this;
  }
  order(col, opts) {
    this._order = { col, ascending: opts ? opts.ascending !== false : true };
    return this;
  }
  maybeSingle() {
    this._maybeSingle = true;
    return this;
  }
  single() {
    this._single = true;
    return this;
  }
  insert(obj) {
    this._mode = 'insert';
    this._payload = obj;
    return this;
  }
  update(obj) {
    this._mode = 'update';
    this._payload = obj;
    return this;
  }
  upsert(obj, opts) {
    this._mode = 'upsert';
    this._payload = obj;
    this._onConflict = opts && opts.onConflict;
    return this;
  }
  delete() {
    this._mode = 'delete';
    return this;
  }

  _queryString() {
    const params = new URLSearchParams();
    params.set('select', this._select);
    this._filters.forEach(([c, v]) => params.append('eq_' + c, v));
    if (this._order) {
      params.set('order', this._order.col + '.' + (this._order.ascending ? 'asc' : 'desc'));
    }
    return params.toString();
  }

  async _execute() {
    if (this._mode === 'select') return this._doSelect();
    if (this._mode === 'insert') return this._doInsert();
    if (this._mode === 'update') return this._doUpdate();
    if (this._mode === 'upsert') return this._doUpsert();
    if (this._mode === 'delete') return this._doDelete();
  }

  async _doSelect() {
    const qs = this._queryString();
    try {
      const headers = await authHeaders();
      const res = await fetch(`${API_BASE}/${this.table}?${qs}`, { headers });
      const json = await res.json();
      if (!res.ok) return { data: null, error: json.error || { message: 'Request failed' } };
      const rows = json.data || [];
      cache.save(this.table, qs, rows);
      return this._shapeSelectResult(rows);
    } catch (e) {
      if (!isNetworkFailure(e)) return { data: null, error: { message: e.message } };
      const cached = cache.load(this.table, qs);
      if (cached) return this._shapeSelectResult(cached);
      return { data: this._maybeSingle ? null : [], error: { message: 'Offline and nothing cached yet' } };
    }
  }

  _shapeSelectResult(rows) {
    if (this._maybeSingle) return { data: rows[0] || null, error: null };
    if (this._single) {
      return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'No rows found' } };
    }
    return { data: rows, error: null };
  }

  async _doInsert() {
    const op = { mode: 'insert', table: this.table, payload: this._payload };
    try {
      const data = await sendWrite(op);
      cache.patchAllForTable(this.table, (rows) => [...rows, data]);
      return { data, error: null };
    } catch (e) {
      if (!isNetworkFailure(e)) return { data: null, error: e.serverError || { message: 'Insert failed' } };
      const optimistic = { id: crypto.randomUUID(), ...this._payload };
      op.payload = optimistic; // keep the same id once it syncs later
      outbox.push(op);
      cache.patchAllForTable(this.table, (rows) => [...rows, optimistic]);
      return { data: optimistic, error: null };
    }
  }

  async _doUpdate() {
    const idFilter = this._filters.find(([c]) => c === 'id');
    if (!idFilter) return { data: null, error: { message: 'update() requires .eq("id", ...)' } };
    const id = idFilter[1];
    const op = { mode: 'update', table: this.table, id, payload: this._payload };
    try {
      const data = await sendWrite(op);
      cache.patchAllForTable(this.table, (rows) => rows.map((r) => (r.id === id ? data : r)));
      return { data, error: null };
    } catch (e) {
      if (!isNetworkFailure(e)) return { data: null, error: e.serverError || { message: 'Update failed' } };
      outbox.push(op);
      let merged = null;
      cache.patchAllForTable(this.table, (rows) =>
        rows.map((r) => {
          if (r.id !== id) return r;
          merged = { ...r, ...this._payload };
          return merged;
        })
      );
      return { data: merged || { id, ...this._payload }, error: null };
    }
  }

  async _doUpsert() {
    const conflictCol = this._onConflict || 'id';
    const op = { mode: 'upsert', table: this.table, payload: this._payload, onConflict: conflictCol };
    try {
      const data = await sendWrite(op);
      cache.patchAllForTable(this.table, (rows) => {
        const idx = rows.findIndex((r) => r[conflictCol] === data[conflictCol]);
        if (idx === -1) return [...rows, data];
        const copy = rows.slice();
        copy[idx] = data;
        return copy;
      });
      return { data, error: null };
    } catch (e) {
      if (!isNetworkFailure(e)) return { data: null, error: e.serverError || { message: 'Upsert failed' } };
      const conflictVal = this._payload[conflictCol];
      let optimistic = null;
      cache.patchAllForTable(this.table, (rows) => {
        const idx = rows.findIndex((r) => r[conflictCol] === conflictVal);
        if (idx === -1) {
          optimistic = { id: crypto.randomUUID(), ...this._payload };
          return [...rows, optimistic];
        }
        optimistic = { ...rows[idx], ...this._payload };
        const copy = rows.slice();
        copy[idx] = optimistic;
        return copy;
      });
      if (!optimistic) optimistic = { id: crypto.randomUUID(), ...this._payload };
      op.payload = optimistic;
      outbox.push(op);
      return { data: optimistic, error: null };
    }
  }

  async _doDelete() {
    const idFilter = this._filters.find(([c]) => c === 'id');
    if (!idFilter) return { data: null, error: { message: 'delete() requires .eq("id", ...)' } };
    const id = idFilter[1];
    const op = { mode: 'delete', table: this.table, id };
    try {
      await sendWrite(op);
      cache.patchAllForTable(this.table, (rows) => rows.filter((r) => r.id !== id));
      return { data: null, error: null };
    } catch (e) {
      if (!isNetworkFailure(e)) return { data: null, error: e.serverError || { message: 'Delete failed' } };
      outbox.push(op);
      cache.patchAllForTable(this.table, (rows) => rows.filter((r) => r.id !== id));
      return { data: null, error: null };
    }
  }

  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }
}

export function createDbClient() {
  return {
    from(table) {
      return new QueryBuilder(table);
    },
    auth: {
      async signInWithPassword({ email, password }) {
        // Logging in for the first time always needs real network — there's
        // nothing to cache a login against.
        try {
          const res = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          const json = await res.json();
          if (!res.ok) return { data: null, error: { message: json.error || 'Login failed' } };
          localStorage.setItem(SESSION_KEY, json.token);
          return { data: { session: { access_token: json.token, user: json.user } }, error: null };
        } catch (e) {
          return { data: null, error: { message: isNetworkFailure(e) ? 'No internet connection' : e.message } };
        }
      },
      async signUp({ email, password, registerCode }) {
        try {
          const res = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, registerCode })
          });
          const json = await res.json();
          if (!res.ok) return { data: null, error: { message: json.error || 'Registration failed' } };
          localStorage.setItem(SESSION_KEY, json.token);
          return { data: { session: { access_token: json.token, user: json.user } }, error: null };
        } catch (e) {
          return { data: null, error: { message: isNetworkFailure(e) ? 'No internet connection' : e.message } };
        }
      },
      async signOut() {
        localStorage.removeItem(SESSION_KEY);
        return { error: null };
      },
      // Offline-safe: a network failure here must NOT log the person out —
      // only an explicit "session expired" reply from the server should.
      async getSession() {
        const token = getToken();
        if (!token) return { data: { session: null } };
        try {
          const res = await fetch(`${API_BASE}/auth/session`, {
            headers: { Authorization: 'Bearer ' + token }
          });
          if (!res.ok) {
            localStorage.removeItem(SESSION_KEY);
            return { data: { session: null } };
          }
          const json = await res.json();
          return { data: { session: { access_token: token, user: json.user } } };
        } catch (e) {
          if (isNetworkFailure(e)) {
            // Offline but we have a token from before — stay logged in and
            // let the app run off cached data until connectivity returns.
            return { data: { session: { access_token: token, user: null, offline: true } } };
          }
          return { data: { session: null } };
        }
      }
    }
  };
}
