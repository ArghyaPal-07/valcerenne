const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticate, optionalAuth, requireAdmin } = require('../middleware/auth');

router.post('/checkout', optionalAuth, orderController.checkout);
router.get('/my-orders', authenticate, orderController.getUserOrders);
router.get('/all', authenticate, requireAdmin, orderController.getAllOrders);
router.put('/status/:id', authenticate, requireAdmin, orderController.updateOrderStatus);
router.post('/:identifier/cancel', authenticate, orderController.cancelOrder);
router.get('/:identifier', optionalAuth, orderController.getOrderDetail);

module.exports = router;
