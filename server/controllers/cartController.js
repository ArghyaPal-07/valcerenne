const db = require('../config/db');

// Helper to get or create a cart
async function getOrCreateCart(userId, sessionToken) {
  let cart = null;

  if (userId) {
    const [rows] = await db.query('SELECT * FROM carts WHERE user_id = ? LIMIT 1', [userId]);
    if (rows && rows.length > 0) {
      cart = rows[0];
    } else {
      const [res] = await db.query('INSERT INTO carts (user_id) VALUES (?)', [userId]);
      cart = { id: res.insertId, user_id: userId, session_token: null };
    }
  } else if (sessionToken) {
    const [rows] = await db.query('SELECT * FROM carts WHERE session_token = ? LIMIT 1', [sessionToken]);
    if (rows && rows.length > 0) {
      cart = rows[0];
    } else {
      const [res] = await db.query('INSERT INTO carts (session_token) VALUES (?)', [sessionToken]);
      cart = { id: res.insertId, user_id: null, session_token: sessionToken };
    }
  }

  return cart;
}

// Get cart items with full details
exports.getCart = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const sessionToken = req.headers['x-session-token'] || req.query.session_token || req.body.session_token;

    if (!userId && !sessionToken) {
      return res.json({
        success: true,
        message: 'Cart fetched',
        data: { items: [], subtotal: 0, totalItems: 0 }
      });
    }

    const cart = await getOrCreateCart(userId, sessionToken);
    if (!cart) {
      return res.json({
        success: true,
        message: 'Cart fetched',
        data: { items: [], subtotal: 0, totalItems: 0 }
      });
    }

    const sql = `
      SELECT 
        ci.id as item_id, ci.cart_id, ci.product_id, ci.variant_id, 
        ci.quantity, ci.price,
        p.title as product_title, p.slug as product_slug, p.stock_qty as product_stock,
        pv.color as variant_color, pv.size as variant_size, pv.stock_qty as variant_stock,
        COALESCE((
          SELECT image_url 
          FROM product_images 
          WHERE product_id = p.id 
          ORDER BY is_primary DESC, sort_order ASC, id ASC 
          LIMIT 1
        ), 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80') as image_url
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      LEFT JOIN product_variants pv ON ci.variant_id = pv.id
      WHERE ci.cart_id = ?
      ORDER BY ci.id DESC
    `;

    const [items] = await db.query(sql, [cart.id]);

    let subtotal = 0;
    let totalItems = 0;

    const formattedItems = items.map(item => {
      const itemSubtotal = parseFloat(item.price) * item.quantity;
      subtotal += itemSubtotal;
      totalItems += item.quantity;
      return {
        ...item,
        subtotal: parseFloat(itemSubtotal.toFixed(2))
      };
    });

    res.json({
      success: true,
      message: 'Cart fetched successfully',
      data: {
        cartId: cart.id,
        items: formattedItems,
        subtotal: parseFloat(subtotal.toFixed(2)),
        totalItems
      }
    });
  } catch (err) {
    next(err);
  }
};

// Add item to cart
exports.addToCart = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const sessionToken = req.headers['x-session-token'] || req.body.session_token || req.query.session_token;
    
    // Support all naming conventions: product_id, productId, or id
    const productId = req.body.product_id || req.body.productId || req.body.id;
    const variantId = req.body.variant_id || req.body.variantId || null;
    const quantity = Number(req.body.quantity ?? 1);
    if(!Number.isInteger(quantity)||quantity<1) return res.status(400).json({success:false,message:'Quantity must be a positive integer.'});

    if (!productId) {
      return res.status(400).json({ success: false, message: 'Product ID is required.' });
    }

    if (!userId && !sessionToken) {
      return res.status(400).json({ success: false, message: 'Session token or authentication is required.' });
    }

    // Verify product exists and get price
    const [pRows] = await db.query('SELECT * FROM products WHERE id = ?', [productId]);
    if (!pRows || pRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }
    const product = pRows[0];

    let effectivePrice = product.price;
    let availableStock = product.stock_qty;

    const [variantCount] = await db.query('SELECT COUNT(*) AS count FROM product_variants WHERE product_id = ?', [productId]);
    if(variantCount[0].count && !variantId) return res.status(400).json({success:false,message:'Please choose a product variant.'});
    if (variantId) {
      const [vRows] = await db.query('SELECT * FROM product_variants WHERE id = ? AND product_id = ?', [variantId, productId]);
      if (!vRows || !vRows.length) return res.status(400).json({success:false,message:'Invalid product variant.'});
      if (vRows && vRows.length > 0) {
        if (vRows[0].price_override) {
          effectivePrice = vRows[0].price_override;
        }
        if (vRows[0].stock_qty !== undefined && vRows[0].stock_qty !== null) {
          availableStock = vRows[0].stock_qty;
        }
      }
    }

    if (availableStock < quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${availableStock} units available in stock.`
      });
    }

    const cart = await getOrCreateCart(userId, sessionToken);

    // Check if already in cart
    let existingItemQuery = 'SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?';
    let existingParams = [cart.id, productId];

    if (variantId) {
      existingItemQuery += ' AND variant_id = ?';
      existingParams.push(variantId);
    } else {
      existingItemQuery += ' AND variant_id IS NULL';
    }

    const [existingItems] = await db.query(existingItemQuery, existingParams);

    if (existingItems && existingItems.length > 0) {
      const currentItem = existingItems[0];
      const newQty = currentItem.quantity + quantity;

      if (newQty > availableStock) {
        return res.status(400).json({
          success: false,
          message: `Cannot add more. You have ${currentItem.quantity} in cart and only ${availableStock} exist in stock.`
        });
      }

      await db.query('UPDATE cart_items SET quantity = ?, price = ? WHERE id = ?', [
        newQty,
        effectivePrice,
        currentItem.id
      ]);
    } else {
      await db.query(
        'INSERT INTO cart_items (cart_id, product_id, variant_id, quantity, price) VALUES (?, ?, ?, ?, ?)',
        [cart.id, productId, variantId || null, quantity, effectivePrice]
      );
    }

    // Return updated cart
    return exports.getCart(req, res, next);
  } catch (err) {
    next(err);
  }
};

// Update cart item quantity
exports.updateCartItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cart = await getOrCreateCart(req.user?.id, req.headers['x-session-token']);
    const [owned] = await db.query('SELECT id FROM cart_items WHERE id=? AND cart_id=?', [id, cart?.id || -1]);
    if(!owned.length) return res.status(404).json({success:false,message:'Cart item not found.'});
    const quantity = Number(req.body.quantity);

    if (!Number.isInteger(quantity) || quantity < 0) {
      return res.status(400).json({ success: false, message: 'Invalid quantity.' });
    }

    if (quantity === 0) {
      await db.query('DELETE FROM cart_items WHERE id = ?', [id]);
    } else {
      // Validate stock
      const [itemRows] = await db.query(
        `SELECT ci.*, p.stock_qty as p_stock, pv.stock_qty as v_stock
         FROM cart_items ci
         JOIN products p ON ci.product_id = p.id
         LEFT JOIN product_variants pv ON ci.variant_id = pv.id
         WHERE ci.id = ?`,
        [id]
      );

      if (!itemRows || itemRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Cart item not found.' });
      }

      const item = itemRows[0];
      const maxStock = item.variant_id && item.v_stock !== null ? item.v_stock : item.p_stock;

      if (quantity > maxStock) {
        return res.status(400).json({
          success: false,
          message: `Cannot update quantity. Only ${maxStock} available in stock.`
        });
      }

      await db.query('UPDATE cart_items SET quantity = ? WHERE id = ?', [quantity, id]);
    }

    return exports.getCart(req, res, next);
  } catch (err) {
    next(err);
  }
};

// Remove single item from cart
exports.removeCartItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cart = await getOrCreateCart(req.user?.id, req.headers['x-session-token']);
    const [owned] = await db.query('SELECT id FROM cart_items WHERE id=? AND cart_id=?', [id, cart?.id || -1]);
    if(!owned.length) return res.status(404).json({success:false,message:'Cart item not found.'});
    await db.query('DELETE FROM cart_items WHERE id = ?', [id]);
    return exports.getCart(req, res, next);
  } catch (err) {
    next(err);
  }
};

// Clear entire cart
exports.clearCart = async (req, res, next) => {
  try {
    const userId = req.user ? req.user.id : null;
    const sessionToken = req.headers['x-session-token'] || req.body.session_token;

    const cart = await getOrCreateCart(userId, sessionToken);
    if (cart) {
      await db.query('DELETE FROM cart_items WHERE cart_id = ?', [cart.id]);
    }

    res.json({
      success: true,
      message: 'Cart cleared successfully.',
      data: { items: [], subtotal: 0, totalItems: 0 }
    });
  } catch (err) {
    next(err);
  }
};

// Merge guest cart items into authenticated user cart
exports.mergeGuestCart = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const sessionToken = req.body.session_token || req.headers['x-session-token'];

    if (!sessionToken) {
      return exports.getCart(req, res, next);
    }

    const [guestCarts] = await db.query('SELECT * FROM carts WHERE session_token = ? LIMIT 1', [sessionToken]);
    if (!guestCarts || guestCarts.length === 0) {
      return exports.getCart(req, res, next);
    }

    const guestCart = guestCarts[0];
    const userCart = await getOrCreateCart(userId, null);

    const [guestItems] = await db.query('SELECT * FROM cart_items WHERE cart_id = ?', [guestCart.id]);

    for (const gItem of guestItems) {
      let existingQuery = 'SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?';
      let params = [userCart.id, gItem.product_id];

      if (gItem.variant_id) {
        existingQuery += ' AND variant_id = ?';
        params.push(gItem.variant_id);
      } else {
        existingQuery += ' AND variant_id IS NULL';
      }

      const [existing] = await db.query(existingQuery, params);

      if (existing && existing.length > 0) {
        await db.query('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?', [
          gItem.quantity,
          existing[0].id
        ]);
      } else {
        await db.query(
          'INSERT INTO cart_items (cart_id, product_id, variant_id, quantity, price) VALUES (?, ?, ?, ?, ?)',
          [userCart.id, gItem.product_id, gItem.variant_id, gItem.quantity, gItem.price]
        );
      }
    }

    // Delete guest cart items & cart
    await db.query('DELETE FROM cart_items WHERE cart_id = ?', [guestCart.id]);
    await db.query('DELETE FROM carts WHERE id = ?', [guestCart.id]);

    return exports.getCart(req, res, next);
  } catch (err) {
    next(err);
  }
};
