require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./config/db');

const app = express();
app.use(express.json({ limit: '6mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/menu', require('./routes/menu'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/reports', require('./routes/reports'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Server error. Please try again.' });
});

const port = process.env.PORT || 3000;

async function start() {
  const orderColumns = [
    ['subtotal', 'DECIMAL(10,2) NOT NULL DEFAULT 0'],
    ['discount', 'DECIMAL(10,2) NOT NULL DEFAULT 0'],
    ['delivery_fee', 'DECIMAL(10,2) NOT NULL DEFAULT 0'],
    ['tax', 'DECIMAL(10,2) NOT NULL DEFAULT 0'],
    ['coupon_code', 'VARCHAR(30) NULL'],
    ['phone_number', 'VARCHAR(30) NULL'],
    ['delivery_lat', 'DECIMAL(10,7) NULL'],
    ['delivery_lng', 'DECIMAL(10,7) NULL'],
  ];
  for (const [name, definition] of orderColumns) {
    const [columns] = await db.query('SHOW COLUMNS FROM orders LIKE ?', [name]);
    if (!columns.length) {
      await db.query(`ALTER TABLE orders ADD COLUMN ${name} ${definition}`);
      console.log(`Added orders.${name}`);
    }
  }

  app.listen(port, () => console.log(`Running at http://localhost:${port}`));
}

start().catch(async (error) => {
  console.error('Startup failed:', error);
  await db.end();
  process.exitCode = 1;
});
