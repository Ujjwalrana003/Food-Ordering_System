const router = require("express").Router();
const db = require("../config/db");
const { auth, admin, HttpError, wrap } = require("../middleware/auth");
const { saveDataUrl, cleanUrl } = require("../services/images");

const SELECT = `SELECT m.id,m.category_id,c.name AS category,m.name,m.description,m.image_url,m.is_veg,m.rating,m.prep_time,m.price,m.stock,m.is_available
                FROM menu_items m JOIN categories c ON c.id=m.category_id`;

// Public: full menu with images
router.get(
  "/",
  wrap(async (req, res) => {
    const [items] = await db.query(SELECT + " ORDER BY c.id, m.id");
    const [categories] = await db.query(
      "SELECT id,name FROM categories ORDER BY id",
    );
    res.json({ categories, items });
  }),
);

async function categoryId(body) {
  if (body.category_id) return body.category_id;
  const name = String(body.category || "").trim();
  if (!name) throw new HttpError(400, "Choose a category.");
  const [r] = await db.query("SELECT id FROM categories WHERE name=?", [name]);
  if (r.length) return r[0].id;
  return (await db.query("INSERT INTO categories (name) VALUES (?)", [name]))[0]
    .insertId;
}

function check(b) {
  if (!b.name || !String(b.name).trim())
    throw new HttpError(400, "Item name is required.");
  if (!(Number(b.price) >= 0)) throw new HttpError(400, "Enter a valid price.");
  if (!(Number.isInteger(Number(b.stock)) && Number(b.stock) >= 0))
    throw new HttpError(400, "Stock must be a whole number.");
  b.rating = b.rating === "" || b.rating == null ? 4 : Number(b.rating);
  if (!(b.rating >= 0 && b.rating <= 5))
    throw new HttpError(400, "Rating must be between 0 and 5.");
  b.prep_time =
    b.prep_time === "" || b.prep_time == null ? 20 : Number(b.prep_time);
  if (
    !(Number.isInteger(b.prep_time) && b.prep_time >= 1 && b.prep_time <= 180)
  )
    throw new HttpError(400, "Prep time must be 1-180 minutes.");
}

router.post(
  "/upload",
  auth,
  admin,
  wrap(async (req, res) => {
    res.status(201).json({ image_url: saveDataUrl(req.body.data) });
  }),
);

router.post(
  "/",
  auth,
  admin,
  wrap(async (req, res) => {
    const b = req.body;
    check(b);
    const cid = await categoryId(b);
    const [r] = await db.query(
      "INSERT INTO menu_items (category_id,name,description,image_url,is_veg,rating,prep_time,price,stock,is_available) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [
        cid,
        b.name.trim(),
        b.description || "",
        cleanUrl(b.image_url),
        b.is_veg === false ? 0 : 1,
        b.rating,
        b.prep_time,
        b.price,
        b.stock,
        b.is_available === false ? 0 : 1,
      ],
    );
    res.status(201).json({ id: r.insertId });
  }),
);

router.put(
  "/:id",
  auth,
  admin,
  wrap(async (req, res) => {
    const b = req.body;
    check(b);
    const cid = await categoryId(b);
    const [r] = await db.query(
      "UPDATE menu_items SET category_id=?,name=?,description=?,image_url=?,is_veg=?,rating=?,prep_time=?,price=?,stock=?,is_available=? WHERE id=?",
      [
        cid,
        b.name.trim(),
        b.description || "",
        cleanUrl(b.image_url),
        b.is_veg === false ? 0 : 1,
        b.rating,
        b.prep_time,
        b.price,
        b.stock,
        b.is_available === false ? 0 : 1,
        req.params.id,
      ],
    );
    if (!r.affectedRows) throw new HttpError(404, "Item not found.");
    res.json({ ok: true });
  }),
);

router.delete(
  "/:id",
  auth,
  admin,
  wrap(async (req, res) => {
    await db.query("DELETE FROM menu_items WHERE id=?", [req.params.id]);
    res.json({ ok: true });
  }),
);

module.exports = router;
