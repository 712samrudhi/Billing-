import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: { message: 'Not logged in' } });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: { message: 'Session expired, please login again' } });
  }
}

const router = express.Router();

// Mirrors sb.auth.signInWithPassword({ email, password })
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Enter email and password' });
  }
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid login credentials' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid login credentials' });
  const token = jwt.sign({ uid: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, email: user.email } });
});

// Mirrors sb.auth.signUp({ email, password }) — lets a new shop create its
// own login from the website itself, no SSH/seed-user.js needed.
// If REGISTER_CODE is set in the environment, it must be supplied to
// register (a simple shared invite code) — otherwise registration is open
// to anyone who reaches the page, which is fine for a single private shop
// but worth locking down with REGISTER_CODE if the URL could be guessed.
router.post('/register', async (req, res) => {
  const { email, password, registerCode } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Enter email and password' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (process.env.REGISTER_CODE && registerCode !== process.env.REGISTER_CODE) {
    return res.status(403).json({ error: 'Invalid registration code' });
  }
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing[0]) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }
  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO users (email, password_hash) VALUES (?, ?)',
    [email, hash]
  );
  const token = jwt.sign({ uid: result.insertId, email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: result.insertId, email } });
});

// Mirrors sb.auth.getSession() — called on page load to auto-login
router.get('/session', authMiddleware, (req, res) => {
  res.json({ user: { id: req.user.uid, email: req.user.email } });
});

// Mirrors sb.auth.signOut() — JWTs are stateless, so this is just a formality
router.post('/logout', (req, res) => {
  res.json({ ok: true });
});

export default router;
