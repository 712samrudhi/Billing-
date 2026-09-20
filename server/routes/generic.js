import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db.js';

// Parses JSON columns back into JS objects (mysql2 sometimes returns JSON
// columns as strings depending on driver/column config, so we normalize).
function parseJsonCols(row, jsonColumns) {
  if (!row) return row;
  const out = { ...row };
  jsonColumns.forEach((c) => {
    if (typeof out[c] === 'string') {
      try { out[c] = JSON.parse(out[c]); } catch (e) { /* leave as-is */ }
    }
  });
  return out;
}

/**
 * Builds an Express router for one table that supports exactly the
 * operations the original Supabase client calls in krushiApp.js:
 *   GET    /?select=a,b&eq_col=val&order=col.asc      -> { data: [...] }
 *   POST   /                                           -> { data: {...} }   (insert)
 * POST   /upsert?onConflict=company_id                -> { data: {...} }   (upsert)
 *   PATCH  /:id                                        -> { data: {...} }   (update)
 *   DELETE /:id                                        -> { data: null }
 */
export function createTableRouter({ table, allowedColumns, jsonColumns = [], idStrategy = 'uuid' }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const selectParam = req.query.select || '*';
      const cols = selectParam === '*'
        ? '*'
        : selectParam.split(',').map((s) => s.trim()).filter((c) => allowedColumns.includes(c)).join(',');

      let sql = `SELECT ${cols || '*'} FROM ${table}`;
      const where = [];
      const params = [];
      Object.keys(req.query).forEach((k) => {
        if (k.startsWith('eq_')) {
          const col = k.slice(3);
          if (allowedColumns.includes(col)) {
            where.push(`${col} = ?`);
            params.push(req.query[k]);
          }
        }
      });
      if (where.length) sql += ' WHERE ' + where.join(' AND ');
      if (req.query.order) {
        const [col, dir] = String(req.query.order).split('.');
        if (allowedColumns.includes(col)) {
          sql += ` ORDER BY ${col} ${dir === 'desc' ? 'DESC' : 'ASC'}`;
        }
      }
      const [rows] = await pool.query(sql, params);
      res.json({ data: rows.map((r) => parseJsonCols(r, jsonColumns)) });
    } catch (e) {
      console.error(`GET /${table} error`, e);
      res.status(500).json({ error: { message: e.message } });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const body = req.body || {};
      const row = { ...body };
      let idForLookup;
      const cols = Object.keys(row).filter((c) => allowedColumns.includes(c) && c !== 'id');

      if (idStrategy === 'uuid') {
        idForLookup = row.id || uuidv4();
        cols.unshift('id');
        row.id = idForLookup;
      }

      const values = cols.map((c) => (jsonColumns.includes(c) ? JSON.stringify(row[c] ?? {}) : row[c] ?? null));
      const placeholders = cols.map(() => '?').join(',');
      const [result] = await pool.query(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`,
        values
      );
      if (idStrategy !== 'uuid') idForLookup = result.insertId;

      const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [idForLookup]);
      res.json({ data: parseJsonCols(rows[0], jsonColumns) });
    } catch (e) {
      console.error(`POST /${table} error`, e);
      res.status(500).json({ error: { message: e.message } });
    }
  });

  // Mirrors .upsert(payload, { onConflict: 'company_id' })
  router.post('/upsert', async (req, res) => {
    try {
      const conflictCol = req.query.onConflict || 'id';
      const row = { ...(req.body || {}) };
      if (!allowedColumns.includes(conflictCol) || row[conflictCol] === undefined) {
        return res.status(400).json({ error: { message: 'Missing conflict column: ' + conflictCol } });
      }
      // A brand-new row needs an id even on an upsert path, since MySQL
      // (unlike Postgres) won't auto-generate one for a uuid-strategy table.
      if (idStrategy === 'uuid' && row.id === undefined) {
        row.id = uuidv4();
      }
      const cols = Object.keys(row).filter((c) => allowedColumns.includes(c));
      const values = cols.map((c) => (jsonColumns.includes(c) ? JSON.stringify(row[c] ?? {}) : row[c] ?? null));
      const placeholders = cols.map(() => '?').join(',');
      // Never let an upsert overwrite the row's own id on an existing match —
      // only the conflict column and 'id' are excluded from the UPDATE part.
      const updates = cols.filter((c) => c !== conflictCol && c !== 'id').map((c) => `${c}=VALUES(${c})`).join(',');
      await pool.query(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`,
        values
      );
      const [rows] = await pool.query(`SELECT * FROM ${table} WHERE ${conflictCol} = ?`, [row[conflictCol]]);
      res.json({ data: parseJsonCols(rows[0], jsonColumns) });
    } catch (e) {
      console.error(`POST /${table}/upsert error`, e);
      res.status(500).json({ error: { message: e.message } });
    }
  });

  router.patch('/:id', async (req, res) => {
    try {
      const row = req.body || {};
      const cols = Object.keys(row).filter((c) => allowedColumns.includes(c) && c !== 'id');
      if (!cols.length) return res.status(400).json({ error: { message: 'Nothing to update' } });
      const values = cols.map((c) => (jsonColumns.includes(c) ? JSON.stringify(row[c] ?? {}) : row[c] ?? null));
      const setSql = cols.map((c) => `${c} = ?`).join(',');
      values.push(req.params.id);
      await pool.query(`UPDATE ${table} SET ${setSql} WHERE id = ?`, values);
      const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
      res.json({ data: parseJsonCols(rows[0], jsonColumns) });
    } catch (e) {
      console.error(`PATCH /${table}/:id error`, e);
      res.status(500).json({ error: { message: e.message } });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      await pool.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
      res.json({ data: null });
    } catch (e) {
      console.error(`DELETE /${table}/:id error`, e);
      res.status(500).json({ error: { message: e.message } });
    }
  });

  return router;
}
