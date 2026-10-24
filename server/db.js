import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------------------------------------------------------
// 1. SUPABASE CLIENT INITIALIZATION
// -----------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_KEY &&
  SUPABASE_URL.startsWith('http') &&
  !SUPABASE_URL.includes('your-project')
);

let supabase = null;
if (isSupabaseConfigured) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    console.log(`[Supabase Database] Initialized successfully. Connected to ${SUPABASE_URL}`);
  } catch (err) {
    console.error(`[Supabase Database] Initialization error:`, err.message);
  }
} else {
  console.info(`[Database Engine] Running SQLite storage engine (Supabase keys not yet configured in .env).`);
}

// -----------------------------------------------------------------------------
// 2. LOCAL SQLITE INITIALIZATION (Fallback & Offline Development)
// -----------------------------------------------------------------------------
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'database.sqlite');
const sqliteDb = new DatabaseSync(dbPath);

sqliteDb.exec('PRAGMA journal_mode = WAL;');
sqliteDb.exec('PRAGMA foreign_keys = ON;');

sqliteDb.exec(`
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

// -----------------------------------------------------------------------------
// 3. UNIFIED DATABASE SERVICE (Supabase with Seamless SQLite Fallback)
// -----------------------------------------------------------------------------
export const dbService = {
  getDatabaseEngine() {
    return isSupabaseConfigured && supabase ? 'supabase' : 'sqlite';
  },

  getSupabaseClient() {
    return supabase;
  },

  // --- USERS & CLIENT ACCOUNTS ---

  async getUserByEmail(email) {
    if (!email) return null;
    const cleanEmail = email.trim().toLowerCase();

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .ilike('email', cleanEmail)
          .maybeSingle();

        if (error) {
          console.warn('[Supabase getUserByEmail Warning]:', error.message);
        } else if (data) {
          return {
            id: data.id,
            name: data.name,
            client_ref: data.client_ref,
            email: data.email,
            password_hash: data.password_hash,
            role: data.role,
            created_at: data.created_at
          };
        }
      } catch (err) {
        console.warn('[Supabase Fallback to SQLite]:', err.message);
      }
    }

    const stmt = sqliteDb.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(cleanEmail) || null;
  },

  async getUserById(id) {
    if (!id) return null;

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, client_ref, email, role, created_at')
          .eq('id', id)
          .maybeSingle();

        if (error) {
          console.warn('[Supabase getUserById Warning]:', error.message);
        } else if (data) {
          return {
            id: data.id,
            name: data.name,
            client_ref: data.client_ref,
            email: data.email,
            role: data.role,
            created_at: data.created_at
          };
        }
      } catch (err) {
        console.warn('[Supabase Fallback to SQLite]:', err.message);
      }
    }

    const stmt = sqliteDb.prepare('SELECT id, name, client_ref, email, role, created_at FROM users WHERE id = ?');
    return stmt.get(id) || null;
  },

  async getAdminCount() {
    if (isSupabaseConfigured && supabase) {
      try {
        const { count, error } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'admin');

        if (!error && typeof count === 'number') {
          return count;
        }
      } catch (err) {
        console.warn('[Supabase getAdminCount Warning]:', err.message);
      }
    }

    const stmt = sqliteDb.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
    const res = stmt.get();
    return res ? res.count : 0;
  },

  async getUserCount() {
    if (isSupabaseConfigured && supabase) {
      try {
        const { count, error } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true });

        if (!error && typeof count === 'number') {
          return count;
        }
      } catch (err) {
        console.warn('[Supabase getUserCount Warning]:', err.message);
      }
    }

    const stmt = sqliteDb.prepare('SELECT COUNT(*) AS count FROM users');
    const res = stmt.get();
    return res ? res.count : 0;
  },

  async getAllClients() {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select(`
            id, name, client_ref, email, role, created_at,
            domains:domains(id)
          `)
          .order('created_at', { ascending: false });

        if (!error && data) {
          return data.map(u => ({
            id: u.id,
            name: u.name,
            client_ref: u.client_ref,
            email: u.email,
            role: u.role,
            created_at: u.created_at,
            domain_count: Array.isArray(u.domains) ? u.domains.length : 0
          }));
        }
      } catch (err) {
        console.warn('[Supabase getAllClients Fallback]:', err.message);
      }
    }

    const stmt = sqliteDb.prepare(`
      SELECT u.id, u.name, u.client_ref, u.email, u.role, u.created_at,
             COUNT(d.id) AS domain_count
      FROM users u
      LEFT JOIN domains d ON d.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    return stmt.all();
  },

  async createUser({ id, name, clientRef, email, passwordHash, role, createdAt }) {
    const cleanEmail = email.trim().toLowerCase();
    const now = createdAt || new Date().toISOString().split('T')[0];

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .upsert({
            id,
            name: name && name.trim() ? name.trim() : clientRef,
            client_ref: clientRef,
            email: cleanEmail,
            password_hash: passwordHash || '',
            role: role || 'user',
            created_at: now
          })
          .select('id, name, client_ref, email, role, created_at')
          .single();

        if (error) {
          console.error('[Supabase createUser Error]:', error.message);
          throw error;
        }

        // Also keep local sqlite in sync for dual reliability
        try {
          const syncStmt = sqliteDb.prepare(`
            INSERT OR REPLACE INTO users (id, name, client_ref, email, password_hash, role, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);
          syncStmt.run(id, name, clientRef, cleanEmail, passwordHash || '', role || 'user', now);
        } catch (_) {}

        return data;
      } catch (err) {
        console.warn('[Supabase createUser fallback to SQLite]:', err.message);
      }
    }

    const stmt = sqliteDb.prepare(`
      INSERT OR REPLACE INTO users (id, name, client_ref, email, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, name, clientRef, cleanEmail, passwordHash || '', role, now);
    return this.getUserById(id);
  },

  async deleteUser(id) {
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('users').delete().eq('id', id);
        if (error) console.warn('[Supabase deleteUser Warning]:', error.message);
      } catch (err) {
        console.warn('[Supabase deleteUser error]:', err.message);
      }
    }

    const stmt = sqliteDb.prepare('DELETE FROM users WHERE id = ?');
    return stmt.run(id);
  },

  // --- DOMAINS & TENANT CLIENT ISOLATION ---

  /**
   * STRICT CLIENT ISOLATION:
   * Returns ONLY the domains submitted by userId.
   */
  async getDomainsByUserId(userId) {
    if (!userId) return [];

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('domains')
          .select('id, client_ref, user_email, name, category, price, note, status, date_added')
          .eq('user_id', userId)
          .order('date_added', { ascending: false });

        if (!error && data) {
          return data.map(d => ({
            id: d.id,
            clientRef: d.client_ref,
            userEmail: d.user_email,
            name: d.name,
            category: d.category,
            price: Number(d.price),
            note: d.note || '',
            status: d.status,
            dateAdded: d.date_added
          }));
        }
      } catch (err) {
        console.warn('[Supabase getDomainsByUserId error]:', err.message);
      }
    }

    const stmt = sqliteDb.prepare(`
      SELECT id, client_ref AS clientRef, user_email AS userEmail, name, category, price, note, status, date_added AS dateAdded
      FROM domains
      WHERE user_id = ?
      ORDER BY date_added DESC, id DESC
    `);
    return stmt.all(userId);
  },

  /**
   * ADMINISTRATOR CROSS-TENANT VIEW:
   * Returns all domains across all clients.
   */
  async getAllDomains() {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('domains')
          .select('id, user_id, client_ref, user_email, name, category, price, note, status, date_added')
          .order('date_added', { ascending: false });

        if (!error && data) {
          return data.map(d => ({
            id: d.id,
            userId: d.user_id,
            clientRef: d.client_ref,
            userEmail: d.user_email,
            name: d.name,
            category: d.category,
            price: Number(d.price),
            note: d.note || '',
            status: d.status,
            dateAdded: d.date_added
          }));
        }
      } catch (err) {
        console.warn('[Supabase getAllDomains error]:', err.message);
      }
    }

    const stmt = sqliteDb.prepare(`
      SELECT id, user_id AS userId, client_ref AS clientRef, user_email AS userEmail, name, category, price, note, status, date_added AS dateAdded
      FROM domains
      ORDER BY date_added DESC, id DESC
    `);
    return stmt.all();
  },

  async getDomainById(id) {
    if (!id) return null;

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('domains')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (!error && data) return data;
      } catch (err) {
        console.warn('[Supabase getDomainById error]:', err.message);
      }
    }

    const stmt = sqliteDb.prepare('SELECT * FROM domains WHERE id = ?');
    return stmt.get(id);
  },

  async createDomain({ id, userId, clientRef, userEmail, name, category, price, note, status, dateAdded }) {
    const cleanEmail = (userEmail || '').trim().toLowerCase();
    const now = dateAdded || new Date().toISOString().split('T')[0];

    if (isSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('domains')
          .insert({
            id,
            user_id: userId,
            client_ref: clientRef,
            user_email: cleanEmail,
            name,
            category,
            price: Number(price),
            note: note || '',
            status: status || 'Available',
            date_added: now
          })
          .select()
          .single();

        if (error) throw error;

        // Also keep local SQLite in sync
        try {
          const syncStmt = sqliteDb.prepare(`
            INSERT OR REPLACE INTO domains (id, user_id, client_ref, user_email, name, category, price, note, status, date_added)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          syncStmt.run(id, userId, clientRef, cleanEmail, name, category, Number(price), note || '', status || 'Available', now);
        } catch (_) {}

        return {
          id: data.id,
          userId: data.user_id,
          clientRef: data.client_ref,
          userEmail: data.user_email,
          name: data.name,
          category: data.category,
          price: Number(data.price),
          note: data.note || '',
          status: data.status,
          dateAdded: data.date_added
        };
      } catch (err) {
        console.warn('[Supabase createDomain fallback]:', err.message);
      }
    }

    const stmt = sqliteDb.prepare(`
      INSERT INTO domains (id, user_id, client_ref, user_email, name, category, price, note, status, date_added)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, userId, clientRef, cleanEmail, name, category, Number(price), note || '', status || 'Available', now);

    return {
      id,
      userId,
      clientRef,
      userEmail: cleanEmail,
      name,
      category,
      price: Number(price),
      note: note || '',
      status: status || 'Available',
      dateAdded: now
    };
  },

  async createBatchDomains(domainsList) {
    if (!Array.isArray(domainsList) || domainsList.length === 0) return [];

    if (isSupabaseConfigured && supabase) {
      try {
        const rows = domainsList.map(d => ({
          id: d.id,
          user_id: d.userId,
          client_ref: d.clientRef,
          user_email: d.userEmail.trim().toLowerCase(),
          name: d.name,
          category: d.category,
          price: Number(d.price),
          note: d.note || '',
          status: d.status || 'Available',
          date_added: d.dateAdded
        }));

        const { error } = await supabase.from('domains').insert(rows);
        if (error) throw error;

        // Sync local SQLite
        try {
          const insertStmt = sqliteDb.prepare(`
            INSERT OR REPLACE INTO domains (id, user_id, client_ref, user_email, name, category, price, note, status, date_added)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          sqliteDb.exec('BEGIN TRANSACTION;');
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
          sqliteDb.exec('COMMIT;');
        } catch (_) {}

        return domainsList;
      } catch (err) {
        console.warn('[Supabase createBatchDomains fallback]:', err.message);
      }
    }

    const insertStmt = sqliteDb.prepare(`
      INSERT INTO domains (id, user_id, client_ref, user_email, name, category, price, note, status, date_added)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    sqliteDb.exec('BEGIN TRANSACTION;');
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
      sqliteDb.exec('COMMIT;');
      return domainsList;
    } catch (err) {
      sqliteDb.exec('ROLLBACK;');
      throw err;
    }
  },

  async updateDomain(id, { name, category, price, note, status }) {
    if (isSupabaseConfigured && supabase) {
      try {
        const payload = {};
        if (name !== undefined) payload.name = name;
        if (category !== undefined) payload.category = category;
        if (price !== undefined) payload.price = Number(price);
        if (note !== undefined) payload.note = note;
        if (status !== undefined) payload.status = status;

        const { data, error } = await supabase
          .from('domains')
          .update(payload)
          .eq('id', id)
          .select()
          .maybeSingle();

        if (!error && data) {
          // Sync local
          try {
            const current = this.getDomainById(id);
            if (current) {
              const stmt = sqliteDb.prepare(`
                UPDATE domains SET name = ?, category = ?, price = ?, note = ?, status = ? WHERE id = ?
              `);
              stmt.run(
                name !== undefined ? name : current.name,
                category !== undefined ? category : current.category,
                price !== undefined ? Number(price) : current.price,
                note !== undefined ? note : current.note,
                status !== undefined ? status : current.status,
                id
              );
            }
          } catch (_) {}
          return data;
        }
      } catch (err) {
        console.warn('[Supabase updateDomain fallback]:', err.message);
      }
    }

    const current = await this.getDomainById(id);
    if (!current) return null;

    const stmt = sqliteDb.prepare(`
      UPDATE domains
      SET name = ?, category = ?, price = ?, note = ?, status = ?
      WHERE id = ?
    `);
    stmt.run(
      name !== undefined ? name : current.name,
      category !== undefined ? category : current.category,
      price !== undefined ? Number(price) : current.price,
      note !== undefined ? note : current.note,
      status !== undefined ? status : current.status,
      id
    );
    return this.getDomainById(id);
  },

  async deleteDomain(id) {
    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.from('domains').delete().eq('id', id);
        if (error) console.warn('[Supabase deleteDomain warning]:', error.message);
      } catch (err) {
        console.warn('[Supabase deleteDomain error]:', err.message);
      }
    }

    const stmt = sqliteDb.prepare('DELETE FROM domains WHERE id = ?');
    return stmt.run(id);
  }
};
