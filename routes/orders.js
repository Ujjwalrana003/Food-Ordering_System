const router = require("express").Router();
const db = require("../config/db");
const { auth, admin, HttpError, wrap } = require("../middleware/auth");
const { breakdown } = require("../services/pricing");
const STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

async function withItems(orders) {
  if (!orders.length) return orders;
  const [items] = await db.query(
    `SELECT oi.order_id,oi.menu_item_id,oi.name_snapshot,oi.unit_price,oi.quantity,m.image_url
     FROM order_items oi LEFT JOIN menu_items m ON m.id=oi.menu_item_id WHERE oi.order_id IN (?)`,
    [orders.map((o) => o.id)],
  );
  orders.forEach((o) => (o.items = items.filter((i) => i.order_id === o.id)));
  return orders;
}
const merge = (items) => {
  const m = {};
  for (const it of items || []) {
    const q = Number(it.quantity);
    if (!Number.isInteger(q) || q < 1)
      throw new HttpError(400, "Invalid quantity.");
    m[it.id] = (m[it.id] || 0) + q;
  }
  return Object.entries(m).map(([id, quantity]) => ({ id: +id, quantity }));
};

router.post(
  "/quote",
  wrap(async (req, res) => {
    const items = merge(req.body.items);
    let subtotal = 0;
    if (items.length) {
      const [rows] = await db.query(
        "SELECT id,price FROM menu_items WHERE id IN (?)",
        [items.map((i) => i.id)],
      );
      const p = Object.fromEntries(rows.map((r) => [r.id, Number(r.price)]));
      for (const it of items) subtotal += (p[it.id] || 0) * it.quantity;
    }
    res.json(breakdown(subtotal, req.body.coupon));
  }),
);

router.post(
  "/",
  auth,
  wrap(async (req, res) => {
    const items = merge(req.body.items);
    const { delivery_address, notes, coupon } = req.body;
    const phoneNumber =
      typeof req.body.phone_number === "string"
        ? req.body.phone_number.trim()
        : "";
    if (!items.length) throw new HttpError(400, "Your cart is empty.");
    if (!delivery_address || !delivery_address.trim())
      throw new HttpError(400, "Enter a delivery address.");
    if (
      phoneNumber.length > 30 ||
      !/^\+?[\d\s().-]+$/.test(phoneNumber) ||
      phoneNumber.replace(/\D/g, "").length < 7 ||
      phoneNumber.replace(/\D/g, "").length > 15
    )
      throw new HttpError(400, "Enter a valid phone number.");
    const { delivery_lat, delivery_lng } = req.body;
    const hasLat = delivery_lat !== undefined && delivery_lat !== null;
    const hasLng = delivery_lng !== undefined && delivery_lng !== null;
    if (
      hasLat !== hasLng ||
      (hasLat &&
        (String(delivery_lat).trim() === "" ||
          String(delivery_lng).trim() === "" ||
          !Number.isFinite(Number(delivery_lat)) ||
          !Number.isFinite(Number(delivery_lng)) ||
          Math.abs(Number(delivery_lat)) > 90 ||
          Math.abs(Number(delivery_lng)) > 180))
    )
      throw new HttpError(400, "Invalid delivery map location.");
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      let subtotal = 0;
      const lines = [];
      for (const it of items) {
        const [[m]] = await conn.query(
          "SELECT * FROM menu_items WHERE id=? FOR UPDATE",
          [it.id],
        );
        if (!m || !m.is_available)
          throw new HttpError(
            400,
            `${m ? m.name : "An item"} is not available.`,
          );
        if (m.stock < it.quantity)
          throw new HttpError(400, `Only ${m.stock} left of ${m.name}.`);
        await conn.query("UPDATE menu_items SET stock=stock-? WHERE id=?", [
          it.quantity,
          m.id,
        ]);
        subtotal += Number(m.price) * it.quantity;
        lines.push([m, it.quantity]);
      }
      const b = breakdown(subtotal, coupon);
      if (b.couponError) throw new HttpError(400, b.couponError);
      const [o] = await conn.query(
        "INSERT INTO orders (user_id,subtotal,discount,delivery_fee,tax,total,coupon_code,delivery_address,phone_number,delivery_lat,delivery_lng,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          req.user.id,
          b.subtotal,
          b.discount,
          b.delivery_fee,
          b.tax,
          b.total,
          b.coupon,
          delivery_address.trim().slice(0, 300),
          phoneNumber,
          hasLat ? Number(delivery_lat) : null,
          hasLng ? Number(delivery_lng) : null,
          (notes || "").slice(0, 300),
        ],
      );
      for (const [m, q] of lines)
        await conn.query(
          "INSERT INTO order_items (order_id,menu_item_id,name_snapshot,unit_price,quantity) VALUES (?,?,?,?,?)",
          [o.insertId, m.id, m.name, m.price, q],
        );
      await conn.commit();
      res.status(201).json({ id: o.insertId, total: b.total });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }),
);

router.get(
  "/mine",
  auth,
  wrap(async (req, res) => {
    const [rows] = await db.query(
      "SELECT * FROM orders WHERE user_id=? ORDER BY id DESC",
      [req.user.id],
    );
    res.json(await withItems(rows));
  }),
);

router.patch(
  "/:id/cancel",
  auth,
  wrap(async (req, res) => {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [[o]] = await conn.query(
        "SELECT * FROM orders WHERE id=? AND user_id=? FOR UPDATE",
        [req.params.id, req.user.id],
      );
      if (!o) throw new HttpError(404, "Order not found.");
      if (!["pending", "confirmed"].includes(o.status))
        throw new HttpError(400, "This order can no longer be cancelled.");
      await conn.query(
        "UPDATE menu_items m JOIN order_items oi ON oi.menu_item_id=m.id SET m.stock=m.stock+oi.quantity WHERE oi.order_id=?",
        [o.id],
      );
      await conn.query(
        "UPDATE orders SET status='cancelled', payment_status=? WHERE id=?",
        [o.payment_status === "paid" ? "refunded" : o.payment_status, o.id],
      );
      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }),
);

router.get(
  "/",
  auth,
  admin,
  wrap(async (req, res) => {
    const [rows] = await db.query(
      "SELECT o.*,u.name AS customer FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 200",
    );
    res.json(await withItems(rows));
  }),
);

router.patch(
  "/:id/status",
  auth,
  admin,
  wrap(async (req, res) => {
    if (!STATUSES.includes(req.body.status))
      throw new HttpError(400, "Invalid status.");
    await db.query("UPDATE orders SET status=? WHERE id=?", [
      req.body.status,
      req.params.id,
    ]);
    res.json({ ok: true });
  }),
);

module.exports = router;
