const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/wishlistController');
const { authenticate, optionalAuth } = require('../middleware/auth');

router.get('/', authenticate, wishlistController.getWishlist);
router.post('/', authenticate, wishlistController.addToWishlist);
router.post('/add', authenticate, wishlistController.addToWishlist);
router.delete('/:productId', authenticate, wishlistController.removeFromWishlist);
router.delete('/', authenticate, wishlistController.removeFromWishlist);
router.get('/check/:productId', optionalAuth, wishlistController.checkWishlistStatus);

module.exports = router;
