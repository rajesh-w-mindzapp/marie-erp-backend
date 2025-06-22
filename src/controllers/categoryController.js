const db = require('../config/db');

// Create default categories for a user
const createDefaultCategories = async (userId) => {
  const defaultCategories = [
    { name: 'Vegetables', color: 'green' },
    { name: 'Meats', color: 'violet' },
    { name: 'Seafoods', color: 'blue' },
  ];

  for (const category of defaultCategories) {
    await new Promise((resolve, reject) => {
      db.query(
        'INSERT INTO categories (name, color, user_id) VALUES (?, ?, ?)',
        [category.name, category.color, userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }
};

// Get all categories for a user
exports.getCategories = async (req, res) => {
  try {
    const userId = req.query.userId || req.user.id;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Check if user has any categories
    db.query(
      'SELECT COUNT(*) as count FROM categories WHERE user_id = ?',
      [userId],
      async (err, results) => {
        if (err) {
          console.error('Error checking categories:', err);
          return res.status(500).json({ message: 'Error fetching categories' });
        }

        // If user has no categories, create default ones
        if (results[0].count === 0) {
          try {
            await createDefaultCategories(userId);
          } catch (error) {
            console.error('Error creating default categories:', error);
            return res.status(500).json({ message: 'Error creating default categories' });
          }
        }

        // Get all categories for the user
        db.query(
          'SELECT * FROM categories WHERE user_id = ? ORDER BY name ASC',
          [userId],
          (err, results) => {
            if (err) {
              console.error('Error fetching categories:', err);
              return res.status(500).json({ message: 'Error fetching categories' });
            }
            res.json(results);
          }
        );
      }
    );
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Error fetching categories' });
  }
};

// Create a new category
exports.createCategory = async (req, res) => {
  try {
    const { name, color, user_id } = req.body;
    
    // Check if category with same name already exists for this user
    db.query(
      'SELECT * FROM categories WHERE user_id = ? AND name = ?',
      [user_id, name],
      (err, results) => {
        if (err) {
          console.error('Error checking existing category:', err);
          return res.status(500).json({ message: 'Error creating category' });
        }

        if (results.length > 0) {
          return res.status(400).json({ message: 'Category with this name already exists' });
        }

        // Insert new category
        db.query(
          'INSERT INTO categories (name, color, user_id) VALUES (?, ?, ?)',
          [name, color, user_id],
          (err, result) => {
            if (err) {
              console.error('Error creating category:', err);
              return res.status(500).json({ message: 'Error creating category' });
            }

            // Get the newly created category
            db.query(
              'SELECT * FROM categories WHERE id = ?',
              [result.insertId],
              (err, newCategory) => {
                if (err) {
                  console.error('Error fetching new category:', err);
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
    console.error('Error creating category:', error);
    res.status(500).json({ message: 'Error creating category' });
  }
};

// Delete a category
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId || req.user.id;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Check if category exists and belongs to user
    db.query(
      'SELECT * FROM categories WHERE id = ? AND user_id = ?',
      [id, userId],
      (err, results) => {
        if (err) {
          console.error('Error checking category:', err);
          return res.status(500).json({ message: 'Error deleting category' });
        }

        if (results.length === 0) {
          return res.status(404).json({ message: 'Category not found' });
        }

        const category = results[0];
        // Don't allow deletion of default categories
        if (['Vegetables', 'Meats', 'Seafoods'].includes(category.name)) {
          return res.status(400).json({ message: 'Cannot delete default categories' });
        }

        // Delete the category
        db.query(
          'DELETE FROM categories WHERE id = ? AND user_id = ?',
          [id, userId],
          (err) => {
            if (err) {
              console.error('Error deleting category:', err);
              return res.status(500).json({ message: 'Error deleting category' });
            }
            res.json({ message: 'Category deleted successfully' });
          }
        );
      }
    );
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ message: 'Error deleting category' });
  }
};
exports.getCategoryNameById = (req, res) => {
  const { categoryId } = req.params;

    try {
    db.query('SELECT name FROM categories WHERE id = ?', [categoryId], (err, rows) => {
      if (err) {
        return res.status(500).json({ message: 'Error fetching Category name'})
      }

      if (rows.length === 0) {
        return res.status(404).json({ message: 'Category not found' });
      }
      res.status(200).json({ name: rows[0].name });

    });

  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
