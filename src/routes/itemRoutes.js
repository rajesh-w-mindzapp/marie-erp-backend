const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');

// Create a new item
router.post('/create', itemController.createItem);

// Create item details
router.post('/details/create', itemController.createItemDetails);

// Get items by category
router.get('/category/:categoryId', itemController.getCategoryItems);

// Delete an item and all related data
router.delete('/:itemId/:userId', itemController.deleteItem);
router.get('/last-item',itemController.getLastItemId);
router.get('/itemdetails/:userId/:itemId',itemController.getItemDetails)
router.put('/wastageUpdate/:itemId/:newPrice',itemController.updateItemPrice)

module.exports = router; 