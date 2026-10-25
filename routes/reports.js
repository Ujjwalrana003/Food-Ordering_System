const router = require('express').Router();
const db = require('../config/db');
const { auth, admin, wrap } = require('../middleware/auth');

router.get('/summary', auth, admin, wrap(async (req, res) => {
  const [[t]] = await db.query("SELECT COUNT(*) orders, COALESCE(SUM(CASE WHEN status<>'cancelled' THEN total END),0) revenue FROM orders");
  const [top] = await db.query(
    `SELECT oi.name_snapshot name, SUM(oi.quantity) qty, m.image_url
     FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN menu_items m ON m.id=oi.menu_item_id
     WHERE o.status<>'cancelled' GROUP BY oi.name_snapshot, m.image_url ORDER BY qty DESC LIMIT 5`);
  const [[low]] = await db.query('SELECT COUNT(*) c FROM menu_items WHERE stock<=5');
  res.json({ orders: t.orders, revenue: t.revenue, top, low_stock: low.c });
}));

module.exports = router;
