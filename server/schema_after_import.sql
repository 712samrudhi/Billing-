-- Krushi Bill — MySQL setup, STEP 3 (run AFTER importing
-- server/data/nutrientfert_mysql.sql, since it alters that table)
--
-- The original Supabase table relied on company_id being unique per
-- company, so "save settings" could upsert onConflict:'company_id'.
-- Your MySQL export only carries the PRIMARY KEY on id — this adds
-- that constraint back so per-company settings upsert works correctly.

ALTER TABLE settings ADD UNIQUE KEY uniq_company_id (company_id);
