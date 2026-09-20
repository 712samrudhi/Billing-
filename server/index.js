import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import authRouter, { authMiddleware } from './routes/auth.js';
import { createTableRouter } from './routes/generic.js';

const app = express();
app.use(cors());
// logo_data_url / qr images are base64 data-URLs and can be large
app.use(express.json({ limit: '20mb' }));

app.use('/api/auth', authRouter);

// Column lists below match server/data/nutrientfert_mysql.sql exactly —
// these are your real table structures, not the placeholder schema.

app.use(
  '/api/products',
  authMiddleware,
  createTableRouter({
    table: 'products',
    allowedColumns: [
      'id', 'name', 'unit', 'price', 'stock', 'low_stock', 'created_at',
      'product_code', 'batch_no', 'mrp', 'dealer_price', 'retail_price',
      'gst_percent', 'extra', 'company_id'
    ],
    jsonColumns: ['extra'],
    idStrategy: 'uuid'
  })
);

app.use(
  '/api/customers',
  authMiddleware,
  createTableRouter({
    table: 'customers',
    allowedColumns: [
      'id', 'name', 'type', 'phone', 'address', 'outstanding',
      'created_at', 'extra', 'company_id'
    ],
    jsonColumns: ['extra'],
    idStrategy: 'uuid'
  })
);

app.use(
  '/api/invoices',
  authMiddleware,
  createTableRouter({
    table: 'invoices',
    allowedColumns: [
      'id', 'invoice_no', 'customer_name', 'customer_phone', 'items',
      'subtotal', 'gst_percent', 'gst_amount', 'total', 'payment_method',
      'created_at', 'customer_id', 'bill_type', 'extra', 'company_id'
    ],
    jsonColumns: ['items', 'extra'],
    idStrategy: 'uuid'
  })
);

app.use(
  '/api/settings',
  authMiddleware,
  createTableRouter({
    table: 'settings',
    allowedColumns: [
      'id', 'shop_name', 'tagline', 'address', 'gstin', 'phone',
      'logo_data_url', 'thank_you', 'extra', 'company_id'
    ],
    jsonColumns: ['extra'],
    idStrategy: 'uuid' // this table's id is VARCHAR in your data, not auto-increment.
    // NOTE: requires server/schema_after_import.sql to have been run once,
    // which adds a UNIQUE key on company_id (needed for upsert-by-company).
  })
);

app.get('/api/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Krushi Bill API (MySQL) running on http://localhost:${PORT}`);
});
