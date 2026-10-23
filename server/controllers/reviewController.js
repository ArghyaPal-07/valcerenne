const db = require('../config/db');

// Get all reviews for a product
exports.getProductReviews = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const sql = `
      SELECT r.*, u.full_name as user_name, u.avatar_url as user_avatar
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.product_id = ?
      ORDER BY r.helpful_votes DESC, r.created_at DESC
    `;

    const [reviews] = await db.query(sql, [productId]);
    res.json({ success: true, data: reviews });
  } catch (err) {
    next(err);
  }
};

// Create a review
exports.createReview = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { product_id, rating, title, comment } = req.body;

    const numRating = parseInt(rating, 10);
    if (!product_id || !numRating || numRating < 1 || numRating > 5 || !title || !comment) {
      return res.status(400).json({
        success: false,
        message: 'Product ID, rating (1-5), title, and review comment are required.'
      });
    }

    // Check if user has already reviewed this product
    const [existing] = await db.query(
      'SELECT id FROM reviews WHERE user_id = ? AND product_id = ? LIMIT 1',
      [userId, product_id]
    );

    if (existing && existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this product.'
      });
    }

    // Check if verified purchase (product in user's order items)
    const [purchaseCheck] = await db.query(
      `SELECT oi.id 
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE o.user_id = ? AND oi.product_id = ?
       LIMIT 1`,
      [userId, product_id]
    );
    const isVerified = purchaseCheck && purchaseCheck.length > 0 ? 1 : 0;

    const [result] = await db.query(
      'INSERT INTO reviews (product_id, user_id, rating, title, comment, is_verified_purchase) VALUES (?, ?, ?, ?, ?, ?)',
      [product_id, userId, numRating, title.trim(), comment.trim(), isVerified]
    );

    // Recalculate average rating & review count for the product
    const [stats] = await db.query(
      'SELECT COUNT(*) as count, AVG(rating) as avg_rating FROM reviews WHERE product_id = ?',
      [product_id]
    );

    const count = stats[0].count || 0;
    const avgRating = parseFloat(stats[0].avg_rating || 0).toFixed(2);

    await db.query(
      'UPDATE products SET rating_avg = ?, review_count = ? WHERE id = ?',
      [avgRating, count, product_id]
    );

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully!',
      data: {
        id: result.insertId,
        rating: numRating,
        title,
        comment,
        is_verified_purchase: isVerified
      }
    });
  } catch (err) {
    next(err);
  }
};

// Vote review as helpful
exports.voteHelpful = async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query('UPDATE reviews SET helpful_votes = helpful_votes + 1 WHERE id = ?', [id]);
    res.json({ success: true, message: 'Thank you for your feedback!' });
  } catch (err) {
    next(err);
  }
};
