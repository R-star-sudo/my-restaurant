const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const crypto = require("crypto");
const { openDb } = require("./db");

const app = express();
const db = openDb();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(morgan("tiny"));
app.use(express.static(path.join(__dirname)));

const liveUrl = process.env.LIVE_URL || process.env.RENDER_EXTERNAL_URL || "";
const apiBase = process.env.API_BASE || (liveUrl ? `${liveUrl.replace(/\/$/, "")}/api` : "/api");

app.get("/config.js", (_req, res) => {
  res.type("application/javascript").send(
    `window.LIVE_URL=${JSON.stringify(liveUrl)};window.API_BASE=${JSON.stringify(apiBase)};`
  );
});

function uid(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex").slice(0, 6)}`;
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

async function seedIfEmpty() {
  const menuCount = await get(db, "SELECT COUNT(*) as c FROM menu");
  if (menuCount.c === 0) {
    const menuSeed = [
      ["m-burrata", "Charred Burrata", "Small Plates", 14, 8, 1],
      ["m-pasta", "Hand-cut Pappardelle", "Mains", 22, 14, 1],
      ["m-halibut", "Miso Poached Halibut", "Mains", 28, 16, 1],
      ["m-salad", "Smoked Citrus Salad", "Greens", 12, 6, 1],
      ["m-brulee", "Cold Brew Crème Brûlée", "Dessert", 11, 10, 0],
    ];
    for (const item of menuSeed) {
      await run(
        db,
        "INSERT INTO menu (id, name, category, price, prep_time, available) VALUES (?,?,?,?,?,?)",
        item
      );
    }
  }

  const resCount = await get(db, "SELECT COUNT(*) as c FROM reservations");
  if (resCount.c === 0) {
    const today = new Date();
    today.setSeconds(0, 0);
    const base = today.getTime();
    const reservations = [
      ["r-anna", "Anna Price", 2, 4, base + 18 * 60 * 60 * 1000, "booked", "Anniversary, quiet corner"],
      ["r-omid", "Omid R.", 5, 7, base + 19.5 * 60 * 60 * 1000, "seated", ""],
      ["r-liz", "Liz & Kai", 3, 2, base + 20.25 * 60 * 60 * 1000, "completed", "Vegan dessert"],
    ];
    for (const r of reservations) {
      await run(
        db,
        `INSERT INTO reservations (id, name, party_size, table_number, time_ms, status, notes)
         VALUES (?,?,?,?,?,?,?)`,
        r
      );
    }
  }

  const ordersCount = await get(db, "SELECT COUNT(*) as c FROM orders");
  if (ordersCount.c === 0) {
    const now = Date.now();
    const orders = [
      {
        id: "o-101",
        table_number: 7,
        reservation_id: "r-omid",
        status: "fired",
        tax_rate: 8.5,
        created_at: now - 25 * 60 * 1000,
        items: [
          { menu_id: "m-burrata", qty: 2 },
          { menu_id: "m-pasta", qty: 3 },
        ],
      },
      {
        id: "o-102",
        table_number: 2,
        reservation_id: "r-liz",
        status: "paid",
        tax_rate: 8.5,
        created_at: now - 80 * 60 * 1000,
        items: [
          { menu_id: "m-halibut", qty: 2 },
          { menu_id: "m-brulee", qty: 3 },
        ],
      },
    ];

    for (const o of orders) {
      await run(
        db,
        `INSERT INTO orders (id, table_number, reservation_id, status, tax_rate, created_at)
         VALUES (?,?,?,?,?,?)`,
        [o.id, o.table_number, o.reservation_id, o.status, o.tax_rate, o.created_at]
      );
      for (const item of o.items) {
        await run(db, "INSERT INTO order_items (order_id, menu_id, qty) VALUES (?,?,?)", [
          o.id,
          item.menu_id,
          item.qty,
        ]);
      }
    }
  }
}

function mapMenu(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price,
    prepTime: row.prep_time,
    available: !!row.available,
  };
}

function mapReservation(row) {
  return {
    id: row.id,
    name: row.name,
    partySize: row.party_size,
    table: row.table_number,
    time: row.time_ms,
    status: row.status,
    notes: row.notes || "",
  };
}

function mapOrder(row, items) {
  return {
    id: row.id,
    table: row.table_number,
    reservationId: row.reservation_id || "",
    status: row.status,
    taxRate: row.tax_rate,
    createdAt: row.created_at,
    items,
  };
}

app.get("/api/menu", async (req, res) => {
  try {
    const rows = await all(db, "SELECT * FROM menu ORDER BY category, name");
    res.json(rows.map(mapMenu));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/menu", async (req, res) => {
  const { name, category, price, prepTime = 10, available = true } = req.body;
  const id = req.body.id || uid("m");
  if (!name || !category || price === undefined) return res.status(400).json({ error: "Missing fields" });
  try {
    await run(
      db,
      "INSERT INTO menu (id, name, category, price, prep_time, available) VALUES (?,?,?,?,?,?)",
      [id, name, category, price, prepTime, available ? 1 : 0]
    );
    const row = await get(db, "SELECT * FROM menu WHERE id = ?", [id]);
    res.status(201).json(mapMenu(row));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/menu/:id", async (req, res) => {
  const { id } = req.params;
  const { name, category, price, prepTime = 10, available = true } = req.body;
  try {
    await run(
      db,
      "UPDATE menu SET name=?, category=?, price=?, prep_time=?, available=? WHERE id=?",
      [name, category, price, prepTime, available ? 1 : 0, id]
    );
    const row = await get(db, "SELECT * FROM menu WHERE id=?", [id]);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(mapMenu(row));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/menu/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await run(db, "DELETE FROM order_items WHERE menu_id=?", [id]);
    await run(db, "DELETE FROM menu WHERE id=?", [id]);
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/reservations", async (req, res) => {
  try {
    const rows = await all(db, "SELECT * FROM reservations ORDER BY time_ms ASC");
    res.json(rows.map(mapReservation));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/reservations", async (req, res) => {
  const { name, partySize, table, time, status, notes = "" } = req.body;
  const id = req.body.id || uid("r");
  if (!name || !partySize || !table || !time || !status)
    return res.status(400).json({ error: "Missing fields" });
  try {
    await run(
      db,
      `INSERT INTO reservations (id, name, party_size, table_number, time_ms, status, notes)
       VALUES (?,?,?,?,?,?,?)`,
      [id, name, partySize, table, time, status, notes]
    );
    const row = await get(db, "SELECT * FROM reservations WHERE id=?", [id]);
    res.status(201).json(mapReservation(row));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/reservations/:id", async (req, res) => {
  const { id } = req.params;
  const { name, partySize, table, time, status, notes = "" } = req.body;
  try {
    await run(
      db,
      `UPDATE reservations
       SET name=?, party_size=?, table_number=?, time_ms=?, status=?, notes=?
       WHERE id=?`,
      [name, partySize, table, time, status, notes, id]
    );
    const row = await get(db, "SELECT * FROM reservations WHERE id=?", [id]);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(mapReservation(row));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/reservations/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await run(db, "UPDATE orders SET reservation_id=NULL WHERE reservation_id=?", [id]);
    await run(db, "DELETE FROM reservations WHERE id=?", [id]);
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function fetchOrderItems(orderId) {
  return all(db, "SELECT menu_id, qty FROM order_items WHERE order_id=?", [orderId]);
}

app.get("/api/orders", async (req, res) => {
  try {
    const rows = await all(db, "SELECT * FROM orders ORDER BY created_at DESC");
    const result = [];
    for (const row of rows) {
      const items = await fetchOrderItems(row.id);
      result.push(
        mapOrder(
          row,
          items.map((i) => ({ menuId: i.menu_id, qty: i.qty }))
        )
      );
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/orders", async (req, res) => {
  const { table, reservationId = "", status, taxRate = 0, items = [] } = req.body;
  const id = req.body.id || uid("o");
  if (!table || !status || !items.length) return res.status(400).json({ error: "Missing fields" });
  const createdAt = Date.now();
  try {
    await run(
      db,
      `INSERT INTO orders (id, table_number, reservation_id, status, tax_rate, created_at)
       VALUES (?,?,?,?,?,?)`,
      [id, table, reservationId || null, status, taxRate, createdAt]
    );
    for (const item of items) {
      await run(db, "INSERT INTO order_items (order_id, menu_id, qty) VALUES (?,?,?)", [
        id,
        item.menuId,
        item.qty,
      ]);
    }
    const row = await get(db, "SELECT * FROM orders WHERE id=?", [id]);
    const itemRows = await fetchOrderItems(id);
    res.status(201).json(
      mapOrder(
        row,
        itemRows.map((i) => ({ menuId: i.menu_id, qty: i.qty }))
      )
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/orders/:id", async (req, res) => {
  const { id } = req.params;
  const { table, reservationId = "", status, taxRate = 0, items = [] } = req.body;
  try {
    await run(
      db,
      `UPDATE orders
       SET table_number=?, reservation_id=?, status=?, tax_rate=?
       WHERE id=?`,
      [table, reservationId || null, status, taxRate, id]
    );
    await run(db, "DELETE FROM order_items WHERE order_id=?", [id]);
    for (const item of items) {
      await run(db, "INSERT INTO order_items (order_id, menu_id, qty) VALUES (?,?,?)", [
        id,
        item.menuId,
        item.qty,
      ]);
    }
    const row = await get(db, "SELECT * FROM orders WHERE id=?", [id]);
    if (!row) return res.status(404).json({ error: "Not found" });
    const itemRows = await fetchOrderItems(id);
    res.json(
      mapOrder(
        row,
        itemRows.map((i) => ({ menuId: i.menu_id, qty: i.qty }))
      )
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/orders/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await run(db, "DELETE FROM order_items WHERE order_id=?", [id]);
    await run(db, "DELETE FROM orders WHERE id=?", [id]);
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/health", async (_req, res) => {
  const menuCount = await get(db, "SELECT COUNT(*) as c FROM menu");
  res.json({ ok: true, menu: menuCount.c });
});

seedIfEmpty().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
