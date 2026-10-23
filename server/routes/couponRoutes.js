const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');

router.post('/validate', couponController.validateCoupon);
router.get('/available', couponController.getAvailableCoupons);

module.exports = router;
