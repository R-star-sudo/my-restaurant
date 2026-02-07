const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "vibe.db");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function openDb() {
  ensureDataDir();
  const db = new sqlite3.Database(DB_PATH);
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS menu (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      prep_time INTEGER DEFAULT 10,
      available INTEGER DEFAULT 1
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      party_size INTEGER NOT NULL,
      table_number INTEGER NOT NULL,
      time_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      notes TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      table_number INTEGER NOT NULL,
      reservation_id TEXT,
      status TEXT NOT NULL,
      tax_rate REAL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (reservation_id) REFERENCES reservations(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      menu_id TEXT NOT NULL,
      qty INTEGER NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (menu_id) REFERENCES menu(id)
    )`);
  });
  return db;
}

module.exports = {
  openDb,
  DB_PATH,
};
