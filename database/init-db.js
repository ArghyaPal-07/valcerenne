require('dotenv').config();
const path = require('path');
const fs = require('fs');

async function initDatabase() {
  const dbClient = process.env.DB_CLIENT || 'sqlite';
  const forceReseed = process.argv.includes('--force') || process.env.FORCE_RESEED === 'true';
  console.log(`[InitDB] Initializing database using driver: ${dbClient} (force reseed: ${forceReseed})`);

  if (dbClient === 'sqlite') {
    const { DatabaseSync } = require('node:sqlite');
    const dbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, 'ecommerce.sqlite');
    
    // Ensure dir
    if (!fs.existsSync(path.dirname(dbPath))) {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }

    if (forceReseed && fs.existsSync(dbPath)) {
      try {
        fs.unlinkSync(dbPath);
        console.log('[InitDB] Deleted old SQLite database file for clean re-seed.');
      } catch (e) {}
    }

    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA journal_mode = WAL;');

    // 15 Relational Tables for SQLite
    const schema = `
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

    db.exec(schema);

    // Check if products already exist
    const countCheck = db.prepare('SELECT COUNT(*) as count FROM products').all()[0];
    if (countCheck.count === 0) {
      console.log('[InitDB] Seeding SQLite database with initial data...');
      
      const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf-8');
      
      // Clean comments and execute individual insert statements
      const cleanLines = seedSql
        .split(/\r?\n/)
        .map(line => {
          const commentIdx = line.indexOf('--');
          return commentIdx >= 0 ? line.substring(0, commentIdx) : line;
        })
        .join('\n');

      const statements = cleanLines
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      db.exec('BEGIN TRANSACTION;');
      try {
        for (const statement of statements) {
          if (statement.trim()) {
            db.exec(statement + ';');
          }
        }
        db.exec('COMMIT;');
        console.log('[InitDB] Seed data loaded successfully.');
      } catch (err) {
        db.exec('ROLLBACK;');
        console.error('[InitDB] Error seeding database:', err);
        throw err;
      }
    } else {
      console.log(`[InitDB] Database already seeded (${countCheck.count} products found).`);
    }

  } else {
    // MySQL init
    const mysql = require('mysql2/promise');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'kickup_ecommerce',
      multipleStatements: true,
      ...require('../server/config/mysql-tls')()
    });

    console.log('[InitDB] Connected to MySQL. Running schema...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8').replace(/^CREATE DATABASE[^;]+;|^USE [^;]+;/gm, '');
    await connection.query(schemaSql);

    console.log('[InitDB] Running seed data...');
    const [[existing]] = await connection.query('SELECT COUNT(*) AS count FROM products');
    if (!existing.count && process.env.NODE_ENV !== 'production') {
      const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf-8');
      await connection.query(seedSql);
    } else console.log('[InitDB] Existing catalogue preserved; production demo seeding is disabled.');

    await connection.end();
    console.log('[InitDB] MySQL initialized and seeded successfully.');
  }
}

if (require.main === module) {
  initDatabase()
    .then(() => {
      console.log('[InitDB] Database setup complete!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[InitDB] Initialization error:', err);
      process.exit(1);
    });
}

module.exports = initDatabase;
