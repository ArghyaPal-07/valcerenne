const db = require('../config/db');

// Get products with filters, sorting, and pagination
exports.getProducts = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 12));
    const offset = (page - 1) * limit;

    const {
      category,
      search,
      min_price,
      max_price,
      rating,
      in_stock,
      featured,
      is_new,
      sort
    } = req.query;

    let conditions = ['1=1'];
    let params = [];

    // Category filter (slug, id, or aliases like gadgets/electronics, sneakers/footwear)
    if (category) {
      if (isNaN(category)) {
        const catClean = category.toLowerCase().trim();
        if (catClean === 'gadgets' || catClean === 'electronics' || catClean === 'tech') {
          conditions.push("(c.slug IN ('gadgets', 'electronics') OR c.id = 1 OR c.name LIKE '%Gadget%' OR c.name LIKE '%Tech%')");
        } else if (catClean === 'sneakers' || catClean === 'shoes' || catClean === 'footwear') {
          conditions.push("(c.slug IN ('footwear', 'sneakers') OR c.id = 4 OR c.name LIKE '%Footwear%' OR c.name LIKE '%Sneaker%')");
        } else {
          conditions.push('(c.slug = ? OR c.id = ? OR c.slug LIKE ? OR c.name LIKE ?)');
          params.push(catClean, catClean, `%${catClean}%`, `%${catClean}%`);
        }
      } else {
        conditions.push('p.category_id = ?');
        params.push(parseInt(category, 10));
      }
    }

    // Search filter
    if (search && search.trim()) {
      const searchPattern = `%${search.trim()}%`;
      conditions.push('(p.title LIKE ? OR p.description LIKE ? OR p.short_description LIKE ? OR p.sku LIKE ? OR c.name LIKE ?)');
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    // Price range
    if (min_price !== undefined && min_price !== '') {
      conditions.push('p.price >= ?');
      params.push(parseFloat(min_price));
    }
    if (max_price !== undefined && max_price !== '') {
      conditions.push('p.price <= ?');
      params.push(parseFloat(max_price));
    }

    // Minimum rating
    if (rating) {
      conditions.push('p.rating_avg >= ?');
      params.push(parseFloat(rating));
    }

    // Stock availability
    if (in_stock === 'true' || in_stock === '1') {
      conditions.push('p.stock_qty > 0');
    }

    // Featured / New
    if (featured === 'true' || featured === '1') {
      conditions.push('p.is_featured = 1');
    }
    if (is_new === 'true' || is_new === '1') {
      conditions.push('p.is_new = 1');
    }

    // Sorting
    let orderBy = 'p.is_featured DESC, p.id ASC';
    if (sort === 'price_asc') {
      orderBy = 'p.price ASC';
    } else if (sort === 'price_desc') {
      orderBy = 'p.price DESC';
    } else if (sort === 'rating_desc') {
      orderBy = 'p.rating_avg DESC, p.review_count DESC';
    } else if (sort === 'newest') {
      orderBy = 'p.created_at DESC, p.id DESC';
    } else if (sort === 'title_asc') {
      orderBy = 'p.title ASC';
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countSql = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ${whereClause}
    `;
    const [countRows] = await db.query(countSql, params);
    const total = countRows[0].total;

    // Get products with primary image & category info
    const dataSql = `
      SELECT 
        p.id, p.category_id, p.title, p.slug, p.sku, 
        p.short_description, p.price, p.compare_price, 
        p.is_featured, p.is_new, p.rating_avg, p.review_count, p.stock_qty,
        c.name as category_name, c.slug as category_slug,
        COALESCE((
          SELECT image_url 
          FROM product_images 
          WHERE product_id = p.id 
          ORDER BY is_primary DESC, sort_order ASC, id ASC 
          LIMIT 1
        ), 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80') as primary_image
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const queryParams = [...params, limit, offset];
    const [products] = await db.query(dataSql, queryParams);

    res.json({
      success: true,
      data: products,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
};

// Get single product details by slug or id
exports.getProductBySlugOrId = async (req, res, next) => {
  try {
    const { identifier } = req.params;

    let productQuery;
    let params;

    if (!isNaN(identifier)) {
      productQuery = `
        SELECT p.*, c.name as category_name, c.slug as category_slug
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = ? OR p.slug = ?
        LIMIT 1
      `;
      params = [parseInt(identifier, 10), identifier];
    } else {
      productQuery = `
        SELECT p.*, c.name as category_name, c.slug as category_slug
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.slug = ?
        LIMIT 1
      `;
      params = [identifier];
    }

    const [rows] = await db.query(productQuery, params);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const product = rows[0];

    // Fetch images
    const [images] = await db.query(
      'SELECT id, image_url, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC',
      [product.id]
    );

    const finalImages = images && images.length > 0 ? images : [
      { id: 0, image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80', is_primary: 1, sort_order: 1 }
    ];

    // Fetch variants
    const [variants] = await db.query(
      'SELECT id, color, size, sku_suffix, stock_qty, price_override FROM product_variants WHERE product_id = ? ORDER BY id ASC',
      [product.id]
    );

    // Fetch verified reviews
    const [reviews] = await db.query(
      `SELECT r.id, r.rating, r.title, r.comment, r.is_verified_purchase, r.helpful_votes, r.created_at,
              u.full_name as user_name, u.avatar_url as user_avatar
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       WHERE r.product_id = ?
       ORDER BY r.created_at DESC`,
      [product.id]
    );

    res.json({
      success: true,
      data: {
        ...product,
        images: finalImages,
        variants,
        reviews
      }
    });
  } catch (err) {
    next(err);
  }
};

// Get featured / trending products
exports.getFeaturedProducts = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 8;
    const sql = `
      SELECT 
        p.id, p.category_id, p.title, p.slug, p.sku, 
        p.short_description, p.price, p.compare_price, 
        p.is_featured, p.is_new, p.rating_avg, p.review_count, p.stock_qty,
        c.name as category_name, c.slug as category_slug,
        COALESCE((
          SELECT image_url 
          FROM product_images 
          WHERE product_id = p.id 
          ORDER BY is_primary DESC, sort_order ASC 
          LIMIT 1
        ), 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80') as primary_image
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_featured = 1
      ORDER BY p.rating_avg DESC, p.id ASC
      LIMIT ?
    `;

    const [products] = await db.query(sql, [limit]);
    res.json({ success: true, data: products });
  } catch (err) {
    next(err);
  }
};

// Get related products for a product
exports.getRelatedProducts = async (req, res, next) => {
  try {
    const { id } = req.params;
    const [target] = await db.query('SELECT category_id FROM products WHERE id = ?', [id]);
    if (!target || target.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const categoryId = target[0].category_id;
    const sql = `
      SELECT 
        p.id, p.category_id, p.title, p.slug, p.sku, 
        p.short_description, p.price, p.compare_price, 
        p.is_featured, p.is_new, p.rating_avg, p.review_count, p.stock_qty,
        c.name as category_name, c.slug as category_slug,
        COALESCE((
          SELECT image_url 
          FROM product_images 
          WHERE product_id = p.id 
          ORDER BY is_primary DESC, sort_order ASC 
          LIMIT 1
        ), 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80') as primary_image
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.category_id = ? AND p.id != ?
      ORDER BY p.rating_avg DESC
      LIMIT 4
    `;

    const [products] = await db.query(sql, [categoryId, id]);
    res.json({ success: true, data: products });
  } catch (err) {
    next(err);
  }
};
