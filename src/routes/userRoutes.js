const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Get user profile
router.get('/profile', userController.getUserProfile);

module.exports = router; 