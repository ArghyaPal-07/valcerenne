const db = require('../config/db');

exports.getWishlist = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const sql = `
      SELECT 
        w.id as wishlist_id, w.created_at as added_at,
        p.id, p.title, p.slug, p.price, p.compare_price, p.rating_avg, p.review_count, p.stock_qty,
        c.name as category_name,
        COALESCE((
          SELECT image_url 
          FROM product_images 
          WHERE product_id = p.id 
          ORDER BY is_primary DESC, sort_order ASC, id ASC
          LIMIT 1
        ), 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80') as primary_image
      FROM wishlists w
      JOIN products p ON w.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE w.user_id = ?
      ORDER BY w.created_at DESC
    `;

    const [items] = await db.query(sql, [userId]);
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
};

exports.addToWishlist = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const productId = req.body.product_id || req.body.productId || req.body.id;

    if (!productId) {
      return res.status(400).json({ success: false, message: 'Product ID is required.' });
    }

    const [existing] = await db.query('SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?', [userId, productId]);
    if (existing && existing.length > 0) {
      return res.json({ success: true, message: 'Added to favourites ✓', inWishlist: true });
    }

    await db.query('INSERT INTO wishlists (user_id, product_id) VALUES (?, ?)', [userId, productId]);
    res.status(201).json({ success: true, message: 'Added to favourites ✓', inWishlist: true });
  } catch (err) {
    next(err);
  }
};

exports.removeFromWishlist = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const productId = req.params.productId || req.body.productId || req.body.product_id || req.body.id;

    if (!productId) {
      return res.status(400).json({ success: false, message: 'Product ID is required for removal.' });
    }

    await db.query('DELETE FROM wishlists WHERE user_id = ? AND product_id = ?', [userId, productId]);
    res.json({ success: true, message: 'Removed from favourites', inWishlist: false });
  } catch (err) {
    next(err);
  }
};

exports.checkWishlistStatus = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.json({ inWishlist: false });
    }

    const productId = req.params.productId || req.query.productId;
    const [rows] = await db.query('SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?', [req.user.id, productId]);
    res.json({ inWishlist: rows && rows.length > 0 });
  } catch (err) {
    next(err);
  }
};
