const express = require('express');
const categoryRoutes = express.Router();
const categoryController = require('../controllers/categoryController');

// Get all categories for the authenticated user
categoryRoutes.get('/getAll', categoryController.getCategories);

// Create a new category
categoryRoutes.post('/create', categoryController.createCategory);

// Delete a category
categoryRoutes.delete('/:id', categoryController.deleteCategory);

categoryRoutes.get('/categoryName/:categoryId',categoryController.getCategoryNameById);

module.exports = categoryRoutes; 