const express = require('express');
const stockRoutes = express.Router();
const stockController = require('../controllers/stockController');

// Create a new stock batch (stock in)
stockRoutes.post('/batch/create', stockController.createStockBatch);

// Create stock out transaction
stockRoutes.post('/out', stockController.createStockOut);

// Get stock batches for an item
stockRoutes.get('/batches/:itemId', stockController.getItemBatches);

module.exports = stockRoutes; 