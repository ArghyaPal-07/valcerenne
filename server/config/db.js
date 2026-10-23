const path = require('path');
const fs = require('fs');

let dbInstance = null;
const dbClient = process.env.DB_CLIENT || 'sqlite'; // 'sqlite' or 'mysql'

function getSeedSql() {
  try {
    return require('../../database/seed-data');
  } catch (e) {
    return '';
  }
}

function getSchemaSql() {
  return `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('customer', 'admin')) DEFAULT 'customer',
      phone TEXT,
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      image_url TEXT,
      parent_id INTEGER,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      sku TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      short_description TEXT,
      price REAL NOT NULL,
      compare_price REAL,
      cost_price REAL,
      is_featured INTEGER DEFAULT 0,
      is_new INTEGER DEFAULT 0,
      rating_avg REAL DEFAULT 0.00,
      review_count INTEGER DEFAULT 0,
      stock_qty INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      is_primary INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      color TEXT,
      size TEXT,
      sku_suffix TEXT,
      stock_qty INTEGER DEFAULT 0,
      price_override REAL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      description TEXT,
      discount_type TEXT CHECK(discount_type IN ('percentage', 'fixed')) DEFAULT 'percentage',
      discount_value REAL NOT NULL,
      min_order_amount REAL DEFAULT 0.00,
      max_discount REAL,
      start_date TEXT,
      end_date TEXT,
      usage_limit INTEGER,
      times_used INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS carts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      session_token TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cart_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      variant_id INTEGER,
      quantity INTEGER NOT NULL DEFAULT 1,
      price REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS wishlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, product_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address_line1 TEXT NOT NULL,
      address_line2 TEXT,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'United States',
      is_default_shipping INTEGER DEFAULT 0,
      is_default_billing INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      user_id INTEGER,
      coupon_id INTEGER,
      subtotal REAL NOT NULL,
      discount_amount REAL DEFAULT 0.00,
      tax_amount REAL DEFAULT 0.00,
      shipping_fee REAL DEFAULT 0.00,
      total_amount REAL NOT NULL,
      order_status TEXT CHECK(order_status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')) DEFAULT 'pending',
      payment_status TEXT CHECK(payment_status IN ('pending', 'paid', 'failed', 'refunded')) DEFAULT 'pending',
      payment_method TEXT DEFAULT 'card',
      shipping_address TEXT NOT NULL,
      billing_address TEXT,
      notes TEXT,
      tracking_number TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      variant_id INTEGER,
      product_title TEXT NOT NULL,
      variant_info TEXT,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      title TEXT NOT NULL,
      comment TEXT NOT NULL,
      is_verified_purchase INTEGER DEFAULT 0,
      helpful_votes INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'unread',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_prod_cat ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_prod_price ON products(price);
    CREATE INDEX IF NOT EXISTS idx_prod_feat ON products(is_featured);
    CREATE INDEX IF NOT EXISTS idx_img_prod ON product_images(product_id);
    CREATE INDEX IF NOT EXISTS idx_var_prod ON product_variants(product_id);
    CREATE INDEX IF NOT EXISTS idx_rev_prod ON reviews(product_id);
    CREATE INDEX IF NOT EXISTS idx_ord_user ON orders(user_id);
  `;
}

function initSqliteDatabase() {
  // Determine DB Path (use /tmp on Vercel)
  const isVercel = Boolean(process.env.VERCEL);
  const dbPath = isVercel
    ? path.join('/tmp', 'ecommerce.sqlite')
    : (process.env.SQLITE_DB_PATH || path.join(__dirname, '../../database/ecommerce.sqlite'));

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  let sqliteDb = null;
  let driverType = 'node:sqlite';

  try {
    const { DatabaseSync } = require('node:sqlite');
    sqliteDb = new DatabaseSync(dbPath);
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    sqliteDb.exec('PRAGMA journal_mode = WAL;');
  } catch (err) {
    console.warn('[DB] node:sqlite not available, falling back to sql.js WASM...');
    driverType = 'sql.js';
  }

  if (driverType === 'node:sqlite' && sqliteDb) {
    // Auto-seed if empty
    sqliteDb.exec(getSchemaSql());
    const countCheck = sqliteDb.prepare('SELECT COUNT(*) as count FROM products').all()[0];
    if (countCheck.count === 0) {
      console.log('[DB] Auto-seeding SQLite database...');
      const seedSql = getSeedSql();
      if (seedSql) {
        const cleanLines = seedSql
          .split(/\r?\n/)
          .map(line => {
            const idx = line.indexOf('--');
            return idx >= 0 ? line.substring(0, idx) : line;
          })
          .join('\n');

        const statements = cleanLines
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0);

        sqliteDb.exec('BEGIN TRANSACTION;');
        try {
          for (const st of statements) {
            sqliteDb.exec(st + ';');
          }
          sqliteDb.exec('COMMIT;');
          console.log('[DB] Auto-seed complete!');
        } catch (e) {
          sqliteDb.exec('ROLLBACK;');
          console.error('[DB] Auto-seed error:', e);
        }
      }
    }

    return {
      client: 'sqlite',
      raw: sqliteDb,
      async query(sql, params = []) {
        const cleanSql = sql.trim();
        const firstWord = cleanSql.split(/\s+/)[0].toUpperCase();

        const normalizedParams = Array.isArray(params) ? params.map(p => {
          if (p === undefined) return null;
          if (typeof p === 'boolean') return p ? 1 : 0;
          if (typeof p === 'object' && p !== null && !(p instanceof Date)) return JSON.stringify(p);
          return p;
        }) : [];

        if (['SELECT', 'PRAGMA', 'EXPLAIN', 'WITH'].includes(firstWord)) {
          const stmt = sqliteDb.prepare(cleanSql);
          const rows = stmt.all(...normalizedParams);
          return [rows];
        } else {
          const stmt = sqliteDb.prepare(cleanSql);
          const info = stmt.run(...normalizedParams);
          return [{
            insertId: Number(info.lastInsertRowid),
            affectedRows: info.changes,
            changes: info.changes
          }];
        }
      },
      async execute(sql, params = []) {
        return this.query(sql, params);
      },
      async transaction(callback) {
        sqliteDb.exec('BEGIN TRANSACTION');
        try {
          const result = await callback();
          sqliteDb.exec('COMMIT');
          return result;
        } catch (err) {
          sqliteDb.exec('ROLLBACK');
          throw err;
        }
      }
    };
  }

  // sql.js fallback
  const initSqlJs = require('sql.js');
  let wasmDb = null;
  let wasmInTransaction = false;
  const wasmReadyPromise = (async () => {
    const SQL = await initSqlJs();
    let fileBuffer = null;
    if (fs.existsSync(dbPath)) {
      fileBuffer = fs.readFileSync(dbPath);
    }
    wasmDb = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
    wasmDb.exec('PRAGMA foreign_keys = ON;');
    wasmDb.exec(getSchemaSql());

    const check = wasmDb.exec('SELECT COUNT(*) as count FROM products');
    const count = check[0]?.values[0][0] || 0;
    if (count === 0) {
      const seedSql = getSeedSql();
      if (seedSql) wasmDb.exec(seedSql);
    }
  })();

  function persistWasmDb() {
    if (wasmDb) {
      try {
        const data = wasmDb.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
      } catch (e) {}
    }
  }

  return {
    client: 'sqlite-wasm',
    async query(sql, params = []) {
      await wasmReadyPromise;
      const cleanSql = sql.trim();
      const firstWord = cleanSql.split(/\s+/)[0].toUpperCase();

      const normalizedParams = Array.isArray(params) ? params.map(p => {
        if (p === undefined) return null;
        if (typeof p === 'boolean') return p ? 1 : 0;
        if (typeof p === 'object' && p !== null && !(p instanceof Date)) return JSON.stringify(p);
        return p;
      }) : [];

      if (['SELECT', 'PRAGMA', 'EXPLAIN', 'WITH'].includes(firstWord)) {
        const res = wasmDb.exec(cleanSql, normalizedParams);
        if (!res || res.length === 0) return [[]];
        const columns = res[0].columns;
        const rows = res[0].values.map(row => {
          const obj = {};
          columns.forEach((col, idx) => {
            obj[col] = row[idx];
          });
          return obj;
        });
        return [rows];
      } else {
        wasmDb.run(cleanSql, normalizedParams);
        if (!wasmInTransaction) persistWasmDb();
        const lastId = wasmDb.exec('SELECT last_insert_rowid()')[0]?.values[0][0] || 0;
        return [{ insertId: lastId, affectedRows: 1, changes: 1 }];
      }
    },
    async execute(sql, params = []) {
      return this.query(sql, params);
    },
    async transaction(callback) {
      await wasmReadyPromise;
      wasmDb.run('BEGIN TRANSACTION');
      wasmInTransaction = true;
      try {
        const result = await callback();
        wasmDb.run('COMMIT');
        wasmInTransaction = false;
        persistWasmDb();
        return result;
      } catch (err) {
        wasmDb.run('ROLLBACK');
        wasmInTransaction = false;
        persistWasmDb();
        throw err;
      }
    }
  };
}

if (dbClient === 'sqlite') {
  dbInstance = initSqliteDatabase();
} else {
  // MySQL configuration
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kickup_ecommerce',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: true,
    ...require('./mysql-tls')()
  });

  dbInstance = {
    client: 'mysql',
    raw: pool,
    async query(sql, params = []) {
      return pool.query(sql, params);
    },
    async execute(sql, params = []) {
      return pool.execute(sql, params);
    },
    async transaction(callback) {
      const conn = await pool.getConnection();
      await conn.beginTransaction();
      try {
        const result = await callback(conn);
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }
  };
}

if (dbClient === 'sqlite') {
  const runTransaction = dbInstance.transaction.bind(dbInstance);
  let checkoutQueue = Promise.resolve();
  dbInstance.transaction = callback => {
    const operation = checkoutQueue.then(() => runTransaction(callback));
    checkoutQueue = operation.catch(() => {});
    return operation;
  };
}
module.exports = dbInstance;
