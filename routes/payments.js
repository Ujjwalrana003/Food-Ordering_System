const router = require("express").Router();
const crypto = require("crypto");
const db = require("../config/db");
const { auth, HttpError, wrap } = require("../middleware/auth");

router.post(
  "/",
  auth,
  wrap(async (req, res) => {
    const { order_id, method } = req.body;
    if (!["card", "upi", "cod"].includes(method))
      throw new HttpError(400, "Choose a payment method.");
    const [[o]] = await db.query(
      "SELECT * FROM orders WHERE id=? AND user_id=?",
      [order_id, req.user.id],
    );
    if (!o) throw new HttpError(404, "Order not found.");
    if (o.payment_status === "paid")
      throw new HttpError(400, "This order is already paid.");
    const status = method === "cod" ? "pending" : "success";
    const ref = "TXN" + crypto.randomBytes(5).toString("hex").toUpperCase();
    await db.query(
      "INSERT INTO payments (order_id,method,amount,status,transaction_ref) VALUES (?,?,?,?,?)",
      [o.id, method, o.total, status, ref],
    );
    if (status === "success")
      await db.query(
        "UPDATE orders SET payment_status='paid', status='confirmed' WHERE id=?",
        [o.id],
      );
    else
      await db.query("UPDATE orders SET status='confirmed' WHERE id=?", [o.id]);
    res.json({ status, transaction_ref: ref });
  }),
);

module.exports = router;
