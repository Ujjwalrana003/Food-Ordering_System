require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("../config/db");

const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
const img = (name) => `/images/menu/${slug(name)}.svg`;

async function ensureCol(table, col, ddl) {
  const [c] = await db.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [col]);
  if (!c.length) {
    await db.query(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
    console.log(`Added ${table}.${col}`);
  }
}

const MENU = {
  Starters: [
    [
      "Paneer Tikka",
      "Charred cottage cheese, mint chutney",
      240,
      30,
      1,
      4.5,
      20,
    ],
    [
      "Veg Spring Rolls",
      "Crisp rolls with sweet chilli dip",
      160,
      40,
      1,
      4.1,
      15,
    ],
    ["Amritsari Fish", "Ajwain-spiced batter-fried fish", 320, 20, 0, 4.4, 25],
    [
      "Chicken Tikka",
      "Smoky tandoori chicken, lemon and onion",
      290,
      25,
      0,
      4.6,
      25,
    ],
  ],
  "Main Course": [
    [
      "Butter Chicken",
      "Creamy tomato gravy, tandoor chicken",
      360,
      25,
      0,
      4.7,
      30,
    ],
    [
      "Dal Makhani",
      "Slow-cooked black lentils with butter",
      220,
      35,
      1,
      4.6,
      20,
    ],
    [
      "Kadhai Paneer",
      "Peppers, onions, freshly ground masala",
      280,
      30,
      1,
      4.3,
      25,
    ],
    [
      "Palak Paneer",
      "Creamy spinach gravy with soft paneer",
      260,
      30,
      1,
      4.2,
      25,
    ],
    [
      "Rajma Chawal",
      "Kidney bean curry with steamed rice",
      190,
      40,
      1,
      4.4,
      20,
    ],
  ],
  Breads: [
    ["Butter Naan", "Soft tandoor-baked bread", 45, 80, 1, 4.5, 10],
    ["Missi Roti", "Gram flour and spices", 40, 60, 1, 4.0, 10],
    [
      "Chole Bhature",
      "Spiced chickpeas with fluffy fried bread",
      170,
      40,
      1,
      4.6,
      20,
    ],
  ],
  Drinks: [
    ["Sweet Lassi", "Thick Punjabi lassi, 350ml", 90, 50, 1, 4.7, 5],
    ["Masala Chaas", "Spiced buttermilk", 60, 50, 1, 4.2, 5],
  ],
  Desserts: [
    [
      "Gulab Jamun",
      "Warm milk dumplings in saffron syrup",
      110,
      50,
      1,
      4.6,
      10,
    ],
    ["Rice Kheer", "Slow-simmered rice pudding with nuts", 120, 40, 1, 4.3, 10],
  ],
};

(async () => {
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const password = process.env.ADMIN_PASSWORD || "Admin@12345";
  const [u] = await db.query("SELECT id FROM users WHERE email=?", [email]);
  if (!u.length) {
    await db.query(
      "INSERT INTO users (name,email,password_hash,role) VALUES ('Admin',?,?,'admin')",
      [email, await bcrypt.hash(password, 10)],
    );
    console.log(`Admin created: ${email}`);
  } else console.log("Admin already exists.");

  await ensureCol(
    "menu_items",
    "image_url",
    "VARCHAR(500) NULL AFTER description",
  );
  await ensureCol("menu_items", "is_veg", "TINYINT(1) NOT NULL DEFAULT 1");
  await ensureCol("menu_items", "rating", "DECIMAL(2,1) NOT NULL DEFAULT 4.0");
  await ensureCol("menu_items", "prep_time", "INT NOT NULL DEFAULT 20");
  for (const [c, d] of [
    ["subtotal", "DECIMAL(10,2) NOT NULL DEFAULT 0"],
    ["discount", "DECIMAL(10,2) NOT NULL DEFAULT 0"],
    ["delivery_fee", "DECIMAL(10,2) NOT NULL DEFAULT 0"],
    ["tax", "DECIMAL(10,2) NOT NULL DEFAULT 0"],
    ["coupon_code", "VARCHAR(30) NULL"],
    ["phone_number", "VARCHAR(30) NULL"],
    ["delivery_lat", "DECIMAL(10,7) NULL"],
    ["delivery_lng", "DECIMAL(10,7) NULL"],
  ])
    await ensureCol("orders", c, d);

  let added = 0;
  for (const [cat, items] of Object.entries(MENU)) {
    let [c] = await db.query("SELECT id FROM categories WHERE name=?", [cat]);
    const cid = c.length
      ? c[0].id
      : (await db.query("INSERT INTO categories (name) VALUES (?)", [cat]))[0]
          .insertId;
    for (const [name, desc, price, stock, veg, rating, prep] of items) {
      const [ex] = await db.query("SELECT id FROM menu_items WHERE name=?", [
        name,
      ]);
      if (!ex.length) {
        await db.query(
          "INSERT INTO menu_items (category_id,name,description,image_url,is_veg,rating,prep_time,price,stock) VALUES (?,?,?,?,?,?,?,?,?)",
          [cid, name, desc, img(name), veg, rating, prep, price, stock],
        );
        added++;
      } // fill in the new fields only if they are still at their defaults
      else
        await db.query(
          "UPDATE menu_items SET is_veg=?,rating=?,prep_time=? WHERE id=? AND rating=4.0 AND prep_time=20",
          [veg, rating, prep, ex[0].id],
        );
    }
  }
  if (added) console.log(`${added} sample dish(es) added.`);
  const [missing] = await db.query(
    "SELECT id,name FROM menu_items WHERE image_url IS NULL OR image_url=''",
  );
  for (const m of missing)
    await db.query("UPDATE menu_items SET image_url=? WHERE id=?", [
      img(m.name),
      m.id,
    ]);
  process.exit(0);
})().catch((e) => {
  console.error("Seed failed:", e.message);
  process.exit(1);
});
