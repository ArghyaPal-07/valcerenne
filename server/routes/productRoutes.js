const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

router.get('/', productController.getProducts);
router.get('/featured', productController.getFeaturedProducts);
router.get('/related/:id', productController.getRelatedProducts);
router.get('/:identifier', productController.getProductBySlugOrId);

module.exports = router;
