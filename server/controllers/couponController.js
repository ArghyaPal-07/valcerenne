const db = require('../config/db');

exports.validateCoupon = async (req, res, next) => {
  try {
    const { code, cart_subtotal } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, message: 'Coupon code is required.' });
    }

    const subtotal = parseFloat(cart_subtotal) || 0;

    const [rows] = await db.query('SELECT * FROM coupons WHERE UPPER(code) = UPPER(?) AND is_active = 1', [code.trim()]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invalid or inactive coupon code.' });
    }

    const coupon = rows[0];
    const today = new Date().toISOString().split('T')[0];

    // Check expiration
    if (coupon.start_date && today < coupon.start_date) {
      return res.status(400).json({ success: false, message: 'This coupon is not active yet.' });
    }
    if (coupon.end_date && today > coupon.end_date) {
      return res.status(400).json({ success: false, message: 'This coupon has expired.' });
    }

    // Check usage limit
    if (coupon.usage_limit && coupon.times_used >= coupon.usage_limit) {
      return res.status(400).json({ success: false, message: 'This coupon usage limit has been reached.' });
    }

    // Check minimum spend
    if (coupon.min_order_amount && subtotal < parseFloat(coupon.min_order_amount)) {
      return res.status(400).json({
        success: false,
        message: `Minimum order amount of ₹${parseFloat(coupon.min_order_amount).toFixed(2)} required for this coupon.`
      });
    }

    // Compute discount
    let discountAmount = 0;
    if (coupon.discount_type === 'percentage') {
      discountAmount = (subtotal * parseFloat(coupon.discount_value)) / 100;
      if (coupon.max_discount && discountAmount > parseFloat(coupon.max_discount)) {
        discountAmount = parseFloat(coupon.max_discount);
      }
    } else {
      discountAmount = Math.min(subtotal, parseFloat(coupon.discount_value));
    }

    res.json({
      success: true,
      message: `Coupon "${coupon.code}" applied successfully!`,
      data: {
        coupon_id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discount_type: coupon.discount_type,
        max_discount: coupon.max_discount,
        discount_value: parseFloat(coupon.discount_value),
        discount_amount: parseFloat(discountAmount.toFixed(2))
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.getAvailableCoupons = async (req, res, next) => {
  try {
    const [coupons] = await db.query(
      'SELECT id, code, description, discount_type, discount_value, min_order_amount, max_discount FROM coupons WHERE is_active = 1'
    );
    res.json({ success: true, data: coupons });
  } catch (err) {
    next(err);
  }
};
