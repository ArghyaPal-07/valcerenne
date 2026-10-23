const db = require('../config/db');

exports.submitContactMessage = async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: 'All contact fields are required.' });
    }

    await db.query(
      'INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)',
      [name.trim(), email.toLowerCase().trim(), subject.trim(), message.trim()]
    );

    res.status(201).json({
      success: true,
      message: 'Your message has been saved. Client services can review your enquiry.'
    });
  } catch (err) {
    next(err);
  }
};

exports.subscribeNewsletter = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'A valid email address is required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const [existing] = await db.query('SELECT id FROM newsletter_subscribers WHERE email = ?', [cleanEmail]);

    if (existing && existing.length > 0) {
      return res.json({ success: true, message: 'You are already subscribed to our newsletter!' });
    }

    await db.query('INSERT INTO newsletter_subscribers (email) VALUES (?)', [cleanEmail]);

    res.status(201).json({
      success: true,
      message: 'Thank you. Your newsletter preference has been saved.'
    });
  } catch (err) {
    next(err);
  }
};
