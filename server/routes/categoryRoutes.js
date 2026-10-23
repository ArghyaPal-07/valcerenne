const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');

router.get('/', categoryController.getCategories);
router.get('/:slug', categoryController.getCategoryBySlug);

module.exports = router;
