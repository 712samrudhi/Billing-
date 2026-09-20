-- Krushi Bill — MySQL setup, STEP 1 (run before importing your data)
-- Creates the database + the one table that never existed in Supabase:
-- `users`, for login (replaces Supabase Auth).
--
-- Full import order:
--   1) mysql -u root -p < server/schema.sql
--   2) mysql -u root -p nutrientfert_bill < server/data/nutrientfert_mysql.sql
--   3) mysql -u root -p nutrientfert_bill < server/schema_after_import.sql
--   4) npm run seed --prefix server -- you@example.com yourpassword

CREATE DATABASE IF NOT EXISTS nutrientfert_bill CHARACTER SET utf8mb4;
USE nutrientfert_bill;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
