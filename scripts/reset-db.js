const fs = require("fs");
const { DB_PATH, openDb } = require("../db");

if (fs.existsSync(DB_PATH)) {
  fs.unlinkSync(DB_PATH);
  console.log("Removed existing DB:", DB_PATH);
}

const db = openDb();
db.serialize(() => {
  db.run("DELETE FROM menu");
  db.run("DELETE FROM reservations");
  db.run("DELETE FROM orders");
  db.run("DELETE FROM order_items");
});
db.close(() => {
  console.log("Empty DB created. It will reseed on next server start.");
});
