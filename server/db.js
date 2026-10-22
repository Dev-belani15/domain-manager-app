import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'database.sqlite');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for concurrency
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    client_ref TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS domains (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    client_ref TEXT NOT NULL,
    user_email TEXT NOT NULL COLLATE NOCASE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    note TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Available' CHECK(status IN ('Available', 'Pending', 'Sold')),
    date_added TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_domains_user_id ON domains(user_id);
  CREATE INDEX IF NOT EXISTS idx_domains_price ON domains(price);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`);

export const dbService = {
  // Users
  getUserByEmail(email) {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email.trim().toLowerCase());
  },

  getUserById(id) {
    const stmt = db.prepare('SELECT id, name, client_ref, email, role, created_at FROM users WHERE id = ?');
    return stmt.get(id);
  },

  getAdminCount() {
    const stmt = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
    const res = stmt.get();
    return res ? res.count : 0;
  },

  getUserCount() {
    const stmt = db.prepare('SELECT COUNT(*) AS count FROM users');
    const res = stmt.get();
    return res ? res.count : 0;
  },

  getAllClients() {
    const stmt = db.prepare(`
      SELECT u.id, u.name, u.client_ref, u.email, u.role, u.created_at,
             COUNT(d.id) AS domain_count
      FROM users u
      LEFT JOIN domains d ON d.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    return stmt.all();
  },

  createUser({ id, name, clientRef, email, passwordHash, role, createdAt }) {
    const stmt = db.prepare(`
      INSERT INTO users (id, name, client_ref, email, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, name, clientRef, email.trim().toLowerCase(), passwordHash, role, createdAt);
    return this.getUserById(id);
  },

  deleteUser(id) {
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    return stmt.run(id);
  },

  // Domains - Client Isolation
  getDomainsByUserId(userId) {
    const stmt = db.prepare(`
      SELECT id, client_ref AS clientRef, user_email AS userEmail, name, category, price, note, status, date_added AS dateAdded
      FROM domains
      WHERE user_id = ?
      ORDER BY date_added DESC, id DESC
    `);
    return stmt.all(userId);
  },

  // Domains - Admin View
  getAllDomains() {
    const stmt = db.prepare(`
      SELECT id, user_id AS userId, client_ref AS clientRef, user_email AS userEmail, name, category, price, note, status, date_added AS dateAdded
      FROM domains
      ORDER BY date_added DESC, id DESC
    `);
    return stmt.all();
  },

  getDomainById(id) {
    const stmt = db.prepare('SELECT * FROM domains WHERE id = ?');
    return stmt.get(id);
  },

  createDomain({ id, userId, clientRef, userEmail, name, category, price, note, status, dateAdded }) {
    const stmt = db.prepare(`
      INSERT INTO domains (id, user_id, client_ref, user_email, name, category, price, note, status, date_added)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      userId,
      clientRef,
      userEmail.trim().toLowerCase(),
      name,
      category,
      price,
      note || '',
      status || 'Available',
      dateAdded
    );
    return {
      id,
      clientRef,
      userEmail,
      name,
      category,
      price,
      note: note || '',
      status: status || 'Available',
      dateAdded
    };
  },

  createBatchDomains(domainsList) {
    const insertStmt = db.prepare(`
      INSERT INTO domains (id, user_id, client_ref, user_email, name, category, price, note, status, date_added)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.exec('BEGIN TRANSACTION;');
    try {
      for (const d of domainsList) {
        insertStmt.run(
          d.id,
          d.userId,
          d.clientRef,
          d.userEmail.trim().toLowerCase(),
          d.name,
          d.category,
          d.price,
          d.note || '',
          d.status || 'Available',
          d.dateAdded
        );
      }
      db.exec('COMMIT;');
      return domainsList;
    } catch (err) {
      db.exec('ROLLBACK;');
      throw err;
    }
  },

  updateDomain(id, { name, category, price, note, status }) {
    const current = this.getDomainById(id);
    if (!current) return null;

    const stmt = db.prepare(`
      UPDATE domains
      SET name = ?, category = ?, price = ?, note = ?, status = ?
      WHERE id = ?
    `);
    stmt.run(
      name !== undefined ? name : current.name,
      category !== undefined ? category : current.category,
      price !== undefined ? price : current.price,
      note !== undefined ? note : current.note,
      status !== undefined ? status : current.status,
      id
    );
    return this.getDomainById(id);
  },

  deleteDomain(id) {
    const stmt = db.prepare('DELETE FROM domains WHERE id = ?');
    return stmt.run(id);
  }
};
