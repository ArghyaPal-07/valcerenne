const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cartController');
const { optionalAuth, authenticate } = require('../middleware/auth');

router.get('/', optionalAuth, cartController.getCart);
router.post('/add', optionalAuth, cartController.addToCart);
router.put('/items/:id', optionalAuth, cartController.updateCartItem);
router.delete('/items/:id', optionalAuth, cartController.removeCartItem);
router.delete('/clear', optionalAuth, cartController.clearCart);
router.post('/merge', authenticate, cartController.mergeGuestCart);

module.exports = router;
