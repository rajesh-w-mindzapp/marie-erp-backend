const db = require('../config/db');
const logger = require('../config/logger');

const createDefaultCategories = async (userId) => {
  const defaultCategories = [
    { name: 'Vegetables', color: 'green' },
    { name: 'Meats', color: 'violet Superman' },
    { name: 'Seafoods', color: 'blue' }
  ];

  logger.info('Creating default categories for user', {
    userId,
    categoryCount: defaultCategories.length
  });

  for (const category of defaultCategories) {
    await db.query(
      'INSERT INTO categories (name, color, user_id) VALUES (?, ?, ?)',
      [category.name, category.color, userId]
    );

    logger.debug('Default category created successfully', {
      userId,
      categoryName: category.name,
      color: category.color
    });
  }

  logger.info('All default categories created successfully', {
    userId,
    categoryCount: defaultCategories.length
  });
};

exports.getCategories = async (req, res) => {
  try {
    const userId = req.query.userId || req.user?.id;

    logger.info('Get categories requested', {
      userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (!userId) {
      logger.warn('Get categories failed - missing userId', { ip: req.ip });
      return res.status(400).json({ message: 'User ID is required' });
    }

    const [countResults] = await db.query('SELECT COUNT(*) as count FROM categories WHERE user_id = ?', [userId]);
    const categoryCount = countResults[0].count;

    logger.debug('Category count check completed', { userId, categoryCount });

    if (categoryCount === 0) {
      await createDefaultCategories(userId);
    }

    const [results] = await db.query(
      'SELECT * FROM categories WHERE user_id = ? ORDER BY name ASC',
      [userId]
    );

    logger.info('Categories retrieved successfully', {
      userId,
      categoryCount: results.length,
      ip: req.ip
    });

    res.json(results);
  } catch (error) {
    logger.error('Unexpected error in getCategories', {
      error: error.message,
      userId: req.query?.userId || req.user?.id,
      ip: req.ip,
      stack: error.stack
    });
    res.status(500).json({ message: 'Error fetching categories' });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, color, user_id } = req.body;

    logger.info('Create category requested', {
      name,
      color,
      userId: user_id,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    const [existing] = await db.query(
      'SELECT * FROM categories WHERE user_id = ? AND name = ?',
      [user_id, name]
    );

    if (existing.length > 0) {
      logger.warn('Create category failed - category already exists', {
        name,
        userId: user_id,
        ip: req.ip
      });
      return res.status(400).json({ message: 'Category with this name already exists' });
    }

    const [result] = await db.query(
      'INSERT INTO categories (name, color, user_id) VALUES (?, ?, ?)',
      [name, color, user_id]
    );

    const categoryId = result.insertId;
    logger.info('Category created successfully', {
      categoryId,
      name,
      color,
      userId: user_id,
      ip: req.ip
    });

    const [newCategory] = await db.query('SELECT * FROM categories WHERE id = ?', [categoryId]);
    res.status(201).json(newCategory[0]);
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

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId || req.user?.id;

    logger.info('Delete category requested', {
      categoryId: id,
      userId,
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

    const [results] = await db.query(
      'SELECT * FROM categories WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (results.length === 0) {
      logger.warn('Delete category failed - category not found', {
        categoryId: id,
        userId,
        ip: req.ip
      });
      return res.status(404).json({ message: 'Category not found' });
    }

    const category = results[0];
    if (['Vegetables', 'Meats', 'Seafoods'].includes(category.name)) {
      logger.warn('Delete category failed - attempting to delete default category', {
        categoryId: id,
        categoryName: category.name,
        userId,
        ip: req.ip
      });
      return res.status(400).json({ message: 'Cannot delete default categories' });
    }

    await db.query('DELETE FROM categories WHERE id = ? AND user_id = ?', [id, userId]);

    logger.info('Category deleted successfully', {
      categoryId: id,
      categoryName: category.name,
      userId,
      ip: req.ip
    });

    res.json({ message: 'Category deleted successfully' });
  } catch (error) {
    logger.error('Unexpected error in deleteCategory', {
      error: error.message,
      categoryId: req.params?.id,
      userId: req.query?.userId || req.user?.id,
      ip: req.ip,
      stack: error.stack
    });
    res.status(500).json({ message: 'Error deleting category' });
  }
};

exports.getCategoryNameById = async (req, res) => {
  try {
    const { categoryId } = req.params;

    logger.info('Get category name by ID requested', {
      categoryId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    const [rows] = await db.query('SELECT name FROM categories WHERE id = ?', [categoryId]);

    if (rows.length === 0) {
      logger.warn('Category name not found', { categoryId, ip: req.ip });
      return res.status(404).json({ message: 'Category not found' });
    }

    const categoryName = rows[0].name;
    logger.info('Category name retrieved successfully', {
      categoryId,
      categoryName,
      ip: req.ip
    });

    res.status(200).json({ name: categoryName });
  } catch (error) {
    logger.error('Unexpected error in getCategoryNameById', {
      error: error.message,
      categoryId: req.params?.categoryId,
      ip: req.ip,
      stack: error.stack
    });
    res.status(500).json({ message: 'Error fetching category name' });
  }
};