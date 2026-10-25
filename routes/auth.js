const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { auth, HttpError, wrap } = require("../middleware/auth");

const sign = (u) =>
  jwt.sign({ id: u.id, role: u.role, name: u.name }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

router.post(
  "/register",
  wrap(async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      throw new HttpError(400, "Name, email and password are required.");
    if (password.length < 6)
      throw new HttpError(400, "Password must be at least 6 characters.");
    const [ex] = await db.query("SELECT id FROM users WHERE email=?", [email]);
    if (ex.length)
      throw new HttpError(409, "An account with this email already exists.");
    const hash = await bcrypt.hash(password, 10);
    const [r] = await db.query(
      "INSERT INTO users (name,email,password_hash) VALUES (?,?,?)",
      [name.trim(), email.trim().toLowerCase(), hash],
    );
    const user = { id: r.insertId, name: name.trim(), email, role: "customer" };
    res.status(201).json({ token: sign(user), user: pub(user) });
  }),
);

router.post(
  "/login",
  wrap(async (req, res) => {
    const { email, password } = req.body;
    const [rows] = await db.query("SELECT * FROM users WHERE email=?", [
      String(email || "")
        .trim()
        .toLowerCase(),
    ]);
    if (
      !rows.length ||
      !(await bcrypt.compare(password || "", rows[0].password_hash))
    )
      throw new HttpError(401, "Email or password is incorrect.");
    res.json({ token: sign(rows[0]), user: pub(rows[0]) });
  }),
);

router.get(
  "/me",
  auth,
  wrap(async (req, res) => {
    const [rows] = await db.query(
      "SELECT id,name,email,role FROM users WHERE id=?",
      [req.user.id],
    );
    if (!rows.length) throw new HttpError(401, "Account not found.");
    res.json(rows[0]);
  }),
);

module.exports = router;
