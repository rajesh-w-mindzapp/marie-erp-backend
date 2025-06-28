const db = require('../config/db');
const logger = require('../config/logger');

// Create default categories for a user
const createDefaultCategories = async (userId) => {
  const defaultCategories = [
    { name: 'Vegetables', color: 'green' },
    { name: 'Meats', color: 'violet' },
    { name: 'Seafoods', color: 'blue' },
  ];

  logger.info('Creating default categories for user', {
    userId: userId,
    categoryCount: defaultCategories.length
  });

  for (const category of defaultCategories) {
    await new Promise((resolve, reject) => {
      db.query(
        'INSERT INTO categories (name, color, user_id) VALUES (?, ?, ?)',
        [category.name, category.color, userId],
        (err) => {
          if (err) {
            logger.error('Error creating default category', {
              error: err.message,
              userId: userId,
              categoryName: category.name,
              stack: err.stack
            });
            reject(err);
          } else {
            logger.debug('Default category created successfully', {
              userId: userId,
              categoryName: category.name,
              color: category.color
            });
            resolve();
          }
        }
      );
    });
  }

  logger.info('All default categories created successfully', {
    userId: userId,
    categoryCount: defaultCategories.length
  });
};

// Get all categories for a user
exports.getCategories = async (req, res) => {
  try {
    const userId = req.query.userId || req.user.id;
    
    logger.info('Get categories requested', {
      userId: userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    if (!userId) {
      logger.warn('Get categories failed - missing userId', {
        ip: req.ip
      });
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Check if user has any categories
    db.query(
      'SELECT COUNT(*) as count FROM categories WHERE user_id = ?',
      [userId],
      async (err, results) => {
        if (err) {
          logger.error('Database error checking categories count', {
            error: err.message,
            userId: userId,
            ip: req.ip,
            stack: err.stack
          });
          return res.status(500).json({ message: 'Error fetching categories' });
        }

        const categoryCount = results[0].count;
        logger.debug('Category count check completed', {
          userId: userId,
          categoryCount: categoryCount
        });

        // If user has no categories, create default ones
        if (categoryCount === 0) {
          try {
            await createDefaultCategories(userId);
          } catch (error) {
            logger.error('Error creating default categories', {
              error: error.message,
              userId: userId,
              ip: req.ip,
              stack: error.stack
            });
            return res.status(500).json({ message: 'Error creating default categories' });
          }
        }

        // Get all categories for the user
        db.query(
          'SELECT * FROM categories WHERE user_id = ? ORDER BY name ASC',
          [userId],
          (err, results) => {
            if (err) {
              logger.error('Database error fetching categories', {
                error: err.message,
                userId: userId,
                ip: req.ip,
                stack: err.stack
              });
              return res.status(500).json({ message: 'Error fetching categories' });
            }

            logger.info('Categories retrieved successfully', {
              userId: userId,
              categoryCount: results.length,
              ip: req.ip
            });

            res.json(results);
          }
        );
      }
    );
  } catch (error) {
    logger.error('Unexpected error in getCategories', {
      error: error.message,
      userId: req.query.userId || req.user?.id,
      ip: req.ip,
      stack: error.stack
    });
    res.status(500).json({ message: 'Error fetching categories' });
  }
};

// Create a new category
exports.createCategory = async (req, res) => {
  try {
    const { name, color, user_id } = req.body;
    
    logger.info('Create category requested', {
      name: name,
      color: color,
      userId: user_id,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    // Check if category with same name already exists for this user
    db.query(
      'SELECT * FROM categories WHERE user_id = ? AND name = ?',
      [user_id, name],
      (err, results) => {
        if (err) {
          logger.error('Database error checking existing category', {
            error: err.message,
            name: name,
            userId: user_id,
            ip: req.ip,
            stack: err.stack
          });
          return res.status(500).json({ message: 'Error creating category' });
        }

        if (results.length > 0) {
          logger.warn('Create category failed - category already exists', {
            name: name,
            userId: user_id,
            ip: req.ip
          });
          return res.status(400).json({ message: 'Category with this name already exists' });
        }

        // Insert new category
        db.query(
          'INSERT INTO categories (name, color, user_id) VALUES (?, ?, ?)',
          [name, color, user_id],
          (err, result) => {
            if (err) {
              logger.error('Database error creating category', {
                error: err.message,
                name: name,
                color: color,
                userId: user_id,
                ip: req.ip,
                stack: err.stack
              });
              return res.status(500).json({ message: 'Error creating category' });
            }

            const categoryId = result.insertId;
            logger.info('Category created successfully', {
              categoryId: categoryId,
              name: name,
              color: color,
              userId: user_id,
              ip: req.ip
            });

            // Get the newly created category
            db.query(
              'SELECT * FROM categories WHERE id = ?',
              [categoryId],
              (err, newCategory) => {
                if (err) {
                  logger.error('Database error fetching new category', {
                    error: err.message,
                    categoryId: categoryId,
                    ip: req.ip,
                    stack: err.stack
                  });
                  return res.status(500).json({ message: 'Error creating category' });
                }
                res.status(201).json(newCategory[0]);
              }
            );
          }
        );
      }
    );
  } catch (error) {
    logger.error('Unexpected error in createCategory', {
      error: error.message,
      name: req.body?.name,
      userId: req.body?.user_id,
      ip: req.ip,
      stack: error.stack
    });
    res.status(500).json({ message: 'Error creating category' });
  }
};

// Delete a category
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId || req.user.id;
    
    logger.info('Delete category requested', {
      categoryId: id,
      userId: userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    if (!userId) {
      logger.warn('Delete category failed - missing userId', {
        categoryId: id,
        ip: req.ip
      });
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Check if category exists and belongs to user
    db.query(
      'SELECT * FROM categories WHERE id = ? AND user_id = ?',
      [id, userId],
      (err, results) => {
        if (err) {
          logger.error('Database error checking category for deletion', {
            error: err.message,
            categoryId: id,
            userId: userId,
            ip: req.ip,
            stack: err.stack
          });
          return res.status(500).json({ message: 'Error deleting category' });
        }

        if (results.length === 0) {
          logger.warn('Delete category failed - category not found', {
            categoryId: id,
            userId: userId,
            ip: req.ip
          });
          return res.status(404).json({ message: 'Category not found' });
        }

        const category = results[0];
        // Don't allow deletion of default categories
        if (['Vegetables', 'Meats', 'Seafoods'].includes(category.name)) {
          logger.warn('Delete category failed - attempting to delete default category', {
            categoryId: id,
            categoryName: category.name,
            userId: userId,
            ip: req.ip
          });
          return res.status(400).json({ message: 'Cannot delete default categories' });
        }

        // Delete the category
        db.query(
          'DELETE FROM categories WHERE id = ? AND user_id = ?',
          [id, userId],
          (err) => {
            if (err) {
              logger.error('Database error deleting category', {
                error: err.message,
                categoryId: id,
                categoryName: category.name,
                userId: userId,
                ip: req.ip,
                stack: err.stack
              });
              return res.status(500).json({ message: 'Error deleting category' });
            }

            logger.info('Category deleted successfully', {
              categoryId: id,
              categoryName: category.name,
              userId: userId,
              ip: req.ip
            });

            res.json({ message: 'Category deleted successfully' });
          }
        );
      }
    );
  } catch (error) {
    logger.error('Unexpected error in deleteCategory', {
      error: error.message,
      categoryId: req.params?.id,
      userId: req.query.userId || req.user?.id,
      ip: req.ip,
      stack: error.stack
    });
    res.status(500).json({ message: 'Error deleting category' });
  }
};

exports.getCategoryNameById = (req, res) => {
  const { categoryId } = req.params;

  logger.info('Get category name by ID requested', {
    categoryId: categoryId,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  try {
    db.query('SELECT name FROM categories WHERE id = ?', [categoryId], (err, rows) => {
      if (err) {
        logger.error('Database error fetching category name', {
          error: err.message,
          categoryId: categoryId,
          ip: req.ip,
          stack: err.stack
        });
        return res.status(500).json({ message: 'Error fetching Category name'})
      }

      if (rows.length === 0) {
        logger.warn('Category name not found', {
          categoryId: categoryId,
          ip: req.ip
        });
        return res.status(404).json({ message: 'Category not found' });
      }

      const categoryName = rows[0].name;
      logger.info('Category name retrieved successfully', {
        categoryId: categoryId,
        categoryName: categoryName,
        ip: req.ip
      });

      res.status(200).json({ name: categoryName });

    });

  } catch (error) {
    logger.error('Unexpected error in getCategoryNameById', {
      error: error.message,
      categoryId: categoryId,
      ip: req.ip,
      stack: error.stack
    });
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
