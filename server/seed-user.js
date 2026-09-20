// Creates (or updates the password of) a login user.
// Usage:  node seed-user.js you@example.com yourpassword
import dotenv from 'dotenv';
dotenv.config();
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

async function main() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error('Usage: node seed-user.js <email> <password>');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO users (email, password_hash) VALUES (?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)',
    [email, hash]
  );
  console.log(`Login ready for ${email}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
