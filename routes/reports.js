const router = require('express').Router();
const db = require('../config/db');
const { auth, admin, HttpError, wrap } = require('../middleware/auth');

router.get('/summary', auth, admin, wrap(async (req, res) => {
  const [[t]] = await db.query("SELECT COUNT(*) orders, COALESCE(SUM(CASE WHEN status<>'cancelled' THEN total END),0) revenue FROM orders");
  const [top] = await db.query(
    `SELECT oi.name_snapshot name, SUM(oi.quantity) qty, m.image_url
     FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN menu_items m ON m.id=oi.menu_item_id
     WHERE o.status<>'cancelled' GROUP BY oi.name_snapshot, m.image_url ORDER BY qty DESC LIMIT 5`);
  const [[low]] = await db.query('SELECT COUNT(*) c FROM menu_items WHERE stock<=5');
  res.json({ orders: t.orders, revenue: t.revenue, top, low_stock: low.c });
}));

router.get('/analytics', auth, admin, wrap(async (req, res) => {
  const days = Number(req.query.days || 30);
  if (![7, 30, 90].includes(days)) throw new HttpError(400, 'Choose a 7, 30, or 90 day period.');

  const range = `created_at >= DATE_SUB(CURDATE(), INTERVAL ${days - 1} DAY)
    AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`;
  const orderRange = range.replace(/created_at/g, 'o.created_at');
  const [[summary]] = await db.query(
    `SELECT DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL ${days - 1} DAY), '%Y-%m-%d') start_date,
      COUNT(*) orders,
      SUM(status='cancelled') cancelled,
      COALESCE(SUM(CASE WHEN status<>'cancelled' THEN total ELSE 0 END), 0) revenue,
      COALESCE(AVG(CASE WHEN status<>'cancelled' THEN total END), 0) average_order
     FROM orders WHERE ${range}`,
  );
  const [[dailyRows], [statusRows], [topItems]] = await Promise.all([
    db.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') date, COUNT(*) orders,
        COALESCE(SUM(CASE WHEN status<>'cancelled' THEN total ELSE 0 END), 0) revenue
       FROM orders WHERE ${range}
       GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
       ORDER BY DATE_FORMAT(created_at, '%Y-%m-%d')`,
    ),
    db.query(
      `SELECT status, COUNT(*) count FROM orders WHERE ${range} GROUP BY status ORDER BY count DESC`,
    ),
    db.query(
      `SELECT oi.name_snapshot name, SUM(oi.quantity) quantity
       FROM order_items oi JOIN orders o ON o.id=oi.order_id
       WHERE o.status<>'cancelled' AND ${orderRange}
       GROUP BY oi.name_snapshot ORDER BY quantity DESC LIMIT 5`,
    ),
  ]);
  const byDate = Object.fromEntries(dailyRows.map(row => [row.date, row]));
  const trend = [];
  const start = new Date(`${summary.start_date}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + i);
    const key = date.toISOString().slice(0, 10);
    const row = byDate[key];
    trend.push({ date: key, orders: row ? Number(row.orders) : 0, revenue: row ? Number(row.revenue) : 0 });
  }

  res.json({
    period_days: days,
    orders: Number(summary.orders),
    cancelled: Number(summary.cancelled || 0),
    revenue: Number(summary.revenue),
    average_order: Number(summary.average_order),
    trend,
    statuses: statusRows.map(row => ({ status: row.status, count: Number(row.count) })),
    top_items: topItems.map(row => ({ name: row.name, quantity: Number(row.quantity) })),
  });
}));

module.exports = router;
