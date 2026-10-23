const db = require("../config/db");

// Only COD is available until a verified payment-provider webhook is implemented.
exports.checkout = async (req, res, next) => {
  const fail = (message, status = 400) => {
    const err = new Error(message);
    err.status = status;
    throw err;
  };
  try {
    const {
      shipping_address,
      billing_address,
      payment_method = "cod",
      coupon_code,
      notes,
    } = req.body;
    if (payment_method !== "cod")
      return res
        .status(503)
        .json({
          success: false,
          message:
            "Online payments are not configured. Please choose cash on delivery.",
        });
    const required = [
      "full_name",
      "phone",
      "address_line1",
      "city",
      "state",
      "postal_code",
      "country",
    ];
    if (
      !shipping_address ||
      required.some(
        (key) =>
          typeof shipping_address[key] !== "string" ||
          !shipping_address[key].trim(),
      )
    )
      fail("Please provide a complete shipping address.");
    const userId = req.user?.id || null;
    const sessionToken = req.headers["x-session-token"];
    const data = await db.transaction(async (connection) => {
      const tx = connection || db;
      const [carts] = await tx.query(
        userId
          ? "SELECT * FROM carts WHERE user_id = ? LIMIT 1"
          : "SELECT * FROM carts WHERE session_token = ? LIMIT 1",
        [userId || sessionToken || ""],
      );
      const cart = carts[0];
      if (!cart) fail("No active cart found.");
      const lock = db.client === "mysql" ? " FOR UPDATE" : "";
      const [items] = await tx.query(
        `SELECT ci.*, p.title, p.stock_qty AS p_stock, p.price AS base_price, pv.stock_qty AS v_stock, pv.price_override, pv.color, pv.size FROM cart_items ci JOIN products p ON p.id=ci.product_id LEFT JOIN product_variants pv ON pv.id=ci.variant_id AND pv.product_id=ci.product_id WHERE ci.cart_id = ?${lock}`,
        [cart.id],
      );
      if (!items.length) fail("Your cart is empty.");
      for (const item of items) {
        if (!Number.isInteger(item.quantity) || item.quantity < 1)
          fail("Invalid quantity.");
        if (
          item.p_stock < item.quantity ||
          (item.variant_id &&
            (item.v_stock === null || item.v_stock < item.quantity))
        )
          fail(`Insufficient stock for "${item.title}".`);
        item.unitPrice = Number(item.price_override ?? item.base_price);
      }
      const subtotal = Number(
        items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0).toFixed(2),
      );
      let discountAmount = 0,
        couponId = null,
        freeShipping = false;
      if (coupon_code) {
        if (typeof coupon_code !== "string") fail("Invalid coupon.");
        const [coupons] = await tx.query(
          `SELECT * FROM coupons WHERE UPPER(code)=UPPER(?) AND is_active=1${lock}`,
          [coupon_code.trim()],
        );
        const coupon = coupons[0],
          today = new Date().toISOString().slice(0, 10);
        const dateOnly = (value) =>
          value instanceof Date
            ? value.toISOString().slice(0, 10)
            : String(value).slice(0, 10);
        if (
          !coupon ||
          (coupon.start_date && dateOnly(coupon.start_date) > today) ||
          (coupon.end_date && dateOnly(coupon.end_date) < today) ||
          (coupon.usage_limit && coupon.times_used >= coupon.usage_limit) ||
          subtotal < Number(coupon.min_order_amount)
        )
          fail("This coupon is not valid for your order.");
        couponId = coupon.id;
        freeShipping = coupon.code.toUpperCase() === "FREESHIP";
        if (!freeShipping) {
          discountAmount =
            coupon.discount_type === "percentage"
              ? (subtotal * Number(coupon.discount_value)) / 100
              : Math.min(subtotal, Number(coupon.discount_value));
          if (coupon.max_discount)
            discountAmount = Math.min(
              discountAmount,
              Number(coupon.max_discount),
            );
        }
      }
      discountAmount = Number(discountAmount.toFixed(2));
      const taxAmount = Number(
        (Math.max(0, subtotal - discountAmount) * 0.08).toFixed(2),
      );
      const shippingFee = subtotal >= 999 || freeShipping ? 0 : 149;
      const totalAmount = Number(
        (subtotal - discountAmount + taxAmount + shippingFee).toFixed(2),
      );
      const orderNumber = `VC-${new Date().getFullYear()}-${require("crypto").randomBytes(8).toString("hex").toUpperCase()}`;
      const [order] = await tx.query(
        `INSERT INTO orders (order_number,user_id,coupon_id,subtotal,discount_amount,tax_amount,shipping_fee,total_amount,order_status,payment_status,payment_method,shipping_address,billing_address,notes,tracking_number) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          orderNumber,
          userId,
          couponId,
          subtotal,
          discountAmount,
          taxAmount,
          shippingFee,
          totalAmount,
          "pending",
          "pending",
          "cod",
          JSON.stringify(shipping_address),
          JSON.stringify(billing_address || shipping_address),
          userId
            ? notes || null
            : JSON.stringify({
                customerNotes: notes || null,
                guestSessionHash: require("crypto")
                  .createHash("sha256")
                  .update(sessionToken || "")
                  .digest("hex"),
              }),
          null,
        ],
      );
      for (const item of items) {
        const [stock] = await tx.query(
          "UPDATE products SET stock_qty=stock_qty-? WHERE id=? AND stock_qty>=?",
          [item.quantity, item.product_id, item.quantity],
        );
        if (!stock.affectedRows)
          fail(`Insufficient stock for "${item.title}".`);
        if (item.variant_id) {
          const [variant] = await tx.query(
            "UPDATE product_variants SET stock_qty=stock_qty-? WHERE id=? AND stock_qty>=?",
            [item.quantity, item.variant_id, item.quantity],
          );
          if (!variant.affectedRows)
            fail("Selected variant is no longer available.");
        }
        await tx.query(
          "INSERT INTO order_items (order_id,product_id,variant_id,product_title,variant_info,unit_price,quantity,subtotal) VALUES (?,?,?,?,?,?,?,?)",
          [
            order.insertId,
            item.product_id,
            item.variant_id || null,
            item.title,
            [item.color, item.size].filter(Boolean).join(" / ") || null,
            item.unitPrice,
            item.quantity,
            Number((item.unitPrice * item.quantity).toFixed(2)),
          ],
        );
      }
      if (couponId)
        await tx.query(
          "UPDATE coupons SET times_used=times_used+1 WHERE id=?",
          [couponId],
        );
      await tx.query(
        "INSERT INTO order_history (order_id,status,notes) VALUES (?,?,?)",
        [
          order.insertId,
          "pending",
          "Cash on delivery order received. Payment pending; delivery confirmation to follow.",
        ],
      );
      await tx.query("DELETE FROM cart_items WHERE cart_id=?", [cart.id]);
      return {
        orderId: order.insertId,
        orderNumber,
        trackingNumber: null,
        totalAmount,
        subtotal,
        discountAmount,
        taxAmount,
        shippingFee,
        orderStatus: "pending",
        paymentStatus: "pending",
      };
    });
    res
      .status(201)
      .json({
        success: true,
        message: "Order received. Payment is due on delivery.",
        data,
      });
  } catch (err) {
    next(err);
  }
};

// Get orders for current user
exports.getUserOrders = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [orders] = await db.query(
      `SELECT o.*, 
              (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as total_items
       FROM orders o
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC`,
      [userId],
    );

    const parsedOrders = orders.map((o) => ({
      ...o,
      shipping_address:
        typeof o.shipping_address === "string"
          ? JSON.parse(o.shipping_address)
          : o.shipping_address,
      billing_address:
        typeof o.billing_address === "string"
          ? JSON.parse(o.billing_address)
          : o.billing_address,
    }));

    res.json({ success: true, data: parsedOrders });
  } catch (err) {
    next(err);
  }
};

// Get single order detail by order_number or id
exports.getOrderDetail = async (req, res, next) => {
  try {
    const { identifier } = req.params;
    const userId = req.user ? req.user.id : null;
    const isAdmin = req.user && req.user.role === "admin";

    let orderQuery =
      "SELECT * FROM orders WHERE id = ? OR order_number = ? LIMIT 1";
    const [orders] = await db.query(orderQuery, [identifier, identifier]);

    if (!orders || orders.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found." });
    }

    const order = orders[0];

    // Authorization check if not admin and order belongs to registered user
    if (!isAdmin && order.user_id && order.user_id !== userId) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized to view this order." });
    }

    if (!isAdmin && !order.user_id) {
      let metadata;
      try {
        metadata = JSON.parse(order.notes || "{}");
      } catch {}
      const sessionHash = require("crypto")
        .createHash("sha256")
        .update(req.headers["x-session-token"] || "")
        .digest("hex");
      if (
        !metadata?.guestSessionHash ||
        metadata.guestSessionHash !== sessionHash
      )
        return res
          .status(403)
          .json({
            success: false,
            message: "Please use the shopping session that placed this order.",
          });
      order.notes = metadata.customerNotes;
    }

    // Fetch items with image
    const [items] = await db.query(
      `SELECT oi.*, 
              (
                SELECT image_url 
                FROM product_images 
                WHERE product_id = oi.product_id 
                ORDER BY is_primary DESC, sort_order ASC 
                LIMIT 1
              ) as product_image,
              p.slug as product_slug
       FROM order_items oi
       LEFT JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = ?`,
      [order.id],
    );

    // Fetch timeline history
    const [history] = await db.query(
      "SELECT * FROM order_history WHERE order_id = ? ORDER BY created_at ASC",
      [order.id],
    );

    res.json({
      success: true,
      data: {
        ...order,
        shipping_address:
          typeof order.shipping_address === "string"
            ? JSON.parse(order.shipping_address)
            : order.shipping_address,
        billing_address:
          typeof order.billing_address === "string"
            ? JSON.parse(order.billing_address)
            : order.billing_address,
        items,
        history,
        timeline: history,
      },
    });
  } catch (err) {
    next(err);
  }
};

// Customer/Admin: Cancel order & restore inventory
exports.cancelOrder = async (req, res, next) => {
  try {
    const { identifier } = req.params;
    const userId = req.user ? req.user.id : null;
    const isAdmin = req.user && req.user.role === "admin";

    const [orders] = await db.query(
      "SELECT * FROM orders WHERE id = ? OR order_number = ? LIMIT 1",
      [identifier, identifier],
    );

    if (!orders || orders.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found." });
    }

    const order = orders[0];

    if (!isAdmin && order.user_id !== userId) {
      return res
        .status(403)
        .json({
          success: false,
          message: "Unauthorized to cancel this order.",
        });
    }

    if (order.order_status === "cancelled") {
      return res
        .status(400)
        .json({ success: false, message: "Order is already cancelled." });
    }

    if (
      order.order_status === "shipped" ||
      order.order_status === "delivered"
    ) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Cannot cancel an order that has already been shipped or delivered.",
        });
    }

    // 1. Update order status
    await db.query(
      "UPDATE orders SET order_status = 'cancelled', payment_status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE payment_status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [order.id],
    );

    // 2. Fetch order items to restore stock
    const [items] = await db.query(
      "SELECT * FROM order_items WHERE order_id = ?",
      [order.id],
    );
    for (const item of items) {
      await db.query(
        "UPDATE products SET stock_qty = stock_qty + ? WHERE id = ?",
        [item.quantity, item.product_id],
      );
      if (item.variant_id) {
        await db.query(
          "UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?",
          [item.quantity, item.variant_id],
        );
      }
    }

    // 3. Log into order history
    await db.query(
      "INSERT INTO order_history (order_id, status, notes) VALUES (?, ?, ?)",
      [
        order.id,
        "cancelled",
        "Order cancelled by customer. Inventory restored.",
      ],
    );

    res.json({
      success: true,
      message: "Order has been successfully cancelled and stock restored.",
      data: {
        order_id: order.id,
        order_number: order.order_number,
        order_status: "cancelled",
        payment_status: "refunded",
      },
    });
  } catch (err) {
    next(err);
  }
};

// Admin: Get all orders
exports.getAllOrders = async (req, res, next) => {
  try {
    const [orders] = await db.query(
      `SELECT o.*, u.full_name as user_name, u.email as user_email,
              (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as total_items
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       ORDER BY o.created_at DESC`,
    );

    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
};

// Admin: Update order status
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { order_status, notes, tracking_number } = req.body;

    const validStatuses = [
      "pending",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
    ];
    if (!validStatuses.includes(order_status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid order status." });
    }

    let updateSql = "UPDATE orders SET order_status = ?";
    let params = [order_status];

    if (tracking_number) {
      updateSql += ", tracking_number = ?";
      params.push(tracking_number);
    }
    updateSql += " WHERE id = ?";
    params.push(id);

    await db.query(updateSql, params);

    // Log history
    await db.query(
      "INSERT INTO order_history (order_id, status, notes) VALUES (?, ?, ?)",
      [id, order_status, notes || `Status updated to ${order_status}`],
    );

    res.json({ success: true, message: "Order status updated successfully." });
  } catch (err) {
    next(err);
  }
};
