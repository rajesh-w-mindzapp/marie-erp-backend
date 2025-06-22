const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');

// Get transactions between dates for an item
router.get('/', transactionController.getItemTransactions);

module.exports = router; 