const bcrypt = require('bcryptjs');
const db = require('../config/db');

// Update user profile
exports.updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { full_name, phone, avatar_url } = req.body;

    if (!full_name) {
      return res.status(400).json({ success: false, message: 'Full name is required.' });
    }

    await db.query(
      'UPDATE users SET full_name = ?, phone = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [full_name.trim(), phone || null, avatar_url || null, userId]
    );

    const [updated] = await db.query(
      'SELECT id, full_name, email, role, phone, avatar_url FROM users WHERE id = ?',
      [userId]
    );

    res.json({
      success: true,
      message: 'Profile updated successfully!',
      user: updated[0]
    });
  } catch (err) {
    next(err);
  }
};

// Change user password
exports.changePassword = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, message: 'Current and new password are required.' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
    }

    const [rows] = await db.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const isMatch = bcrypt.compareSync(current_password, rows[0].password_hash);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }

    const newHash = bcrypt.hashSync(new_password, 10);
    await db.query('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [newHash, userId]);

    res.json({ success: true, message: 'Password changed successfully!' });
  } catch (err) {
    next(err);
  }
};

// Get all saved addresses
exports.getAddresses = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [addresses] = await db.query(
      'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default_shipping DESC, is_default_billing DESC, id DESC',
      [userId]
    );
    res.json({ success: true, data: addresses });
  } catch (err) {
    next(err);
  }
};

// Create a new address
exports.createAddress = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      full_name,
      phone,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country = 'United States',
      is_default_shipping = false,
      is_default_billing = false
    } = req.body;

    if (!full_name || !phone || !address_line1 || !city || !state || !postal_code) {
      return res.status(400).json({ success: false, message: 'All required address fields must be filled.' });
    }

    if (is_default_shipping) {
      await db.query('UPDATE addresses SET is_default_shipping = 0 WHERE user_id = ?', [userId]);
    }
    if (is_default_billing) {
      await db.query('UPDATE addresses SET is_default_billing = 0 WHERE user_id = ?', [userId]);
    }

    const [resInsert] = await db.query(
      `INSERT INTO addresses (
        user_id, full_name, phone, address_line1, address_line2, 
        city, state, postal_code, country, is_default_shipping, is_default_billing
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        full_name.trim(),
        phone.trim(),
        address_line1.trim(),
        address_line2 ? address_line2.trim() : null,
        city.trim(),
        state.trim(),
        postal_code.trim(),
        country.trim(),
        is_default_shipping ? 1 : 0,
        is_default_billing ? 1 : 0
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Address saved successfully!',
      data: { id: resInsert.insertId }
    });
  } catch (err) {
    next(err);
  }
};

// Update an address
exports.updateAddress = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const {
      full_name,
      phone,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country = 'United States',
      is_default_shipping = false,
      is_default_billing = false
    } = req.body;

    if (is_default_shipping) {
      await db.query('UPDATE addresses SET is_default_shipping = 0 WHERE user_id = ?', [userId]);
    }
    if (is_default_billing) {
      await db.query('UPDATE addresses SET is_default_billing = 0 WHERE user_id = ?', [userId]);
    }

    await db.query(
      `UPDATE addresses SET 
        full_name = ?, phone = ?, address_line1 = ?, address_line2 = ?,
        city = ?, state = ?, postal_code = ?, country = ?,
        is_default_shipping = ?, is_default_billing = ?
       WHERE id = ? AND user_id = ?`,
      [
        full_name,
        phone,
        address_line1,
        address_line2 || null,
        city,
        state,
        postal_code,
        country,
        is_default_shipping ? 1 : 0,
        is_default_billing ? 1 : 0,
        id,
        userId
      ]
    );

    res.json({ success: true, message: 'Address updated successfully.' });
  } catch (err) {
    next(err);
  }
};

// Delete address
exports.deleteAddress = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    await db.query('DELETE FROM addresses WHERE id = ? AND user_id = ?', [id, userId]);
    res.json({ success: true, message: 'Address deleted successfully.' });
  } catch (err) {
    next(err);
  }
};
