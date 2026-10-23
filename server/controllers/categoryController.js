const db = require('../config/db');

exports.getCategories = async (req, res, next) => {
  try {
    const sql = `
      SELECT c.*, COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON c.id = p.category_id
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.name ASC
    `;
    const [categories] = await db.query(sql);
    res.json({ success: true, data: categories });
  } catch (err) {
    next(err);
  }
};

exports.getCategoryBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;
    const cleanSlug = slug.toLowerCase().trim();

    let sql = 'SELECT * FROM categories WHERE slug = ? LIMIT 1';
    let params = [cleanSlug];

    if (cleanSlug === 'gadgets' || cleanSlug === 'electronics' || cleanSlug === 'tech') {
      sql = "SELECT * FROM categories WHERE slug IN ('gadgets', 'electronics') OR id = 1 LIMIT 1";
      params = [];
    } else if (cleanSlug === 'sneakers' || cleanSlug === 'footwear' || cleanSlug === 'shoes') {
      sql = "SELECT * FROM categories WHERE slug IN ('footwear', 'sneakers') OR id = 4 LIMIT 1";
      params = [];
    }

    const [categories] = await db.query(sql, params);
    if (!categories || categories.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }
    res.json({ success: true, data: categories[0] });
  } catch (err) {
    next(err);
  }
};
