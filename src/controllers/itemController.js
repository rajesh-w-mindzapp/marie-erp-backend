const db = require('../config/db');
const { connect } = require('../routes/authRouter');

// Create a new item
exports.createItem = async (req, res) => {
  try {
    const { name, barcode, category_id, user_id, price } = req.body;
    
    // Validate required fields
    if (!name || !barcode || !category_id || !user_id) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // First check if barcode already exists for this user
    db.query(
      'SELECT * FROM items WHERE barcode = ? AND user_id = ?',
      [barcode, user_id],
      (err, existingItems) => {
        if (err) {
          console.error('Error checking existing barcode:', err);
          return res.status(500).json({ message: 'Error checking barcode' });
        }

        if (existingItems.length > 0) {
          return res.status(409).json({ 
            message: 'Item with this barcode already exists',
            existingItem: existingItems[0]
          });
        }

        // Check if category exists and belongs to user
        db.query(
          'SELECT * FROM categories WHERE id = ? AND user_id = ?',
          [category_id, user_id],
          (err, results) => {
            if (err) {
              console.error('Error checking category:', err);
              return res.status(500).json({ message: 'Error creating item' });
            }

            if (results.length === 0) {
              return res.status(404).json({ message: 'Category not found or does not belong to user' });
            }

            // Insert new item
            db.query(
              'INSERT INTO items (name, barcode, category_id, user_id, price) VALUES (?, ?, ?, ?, ?)',
              [name, barcode, category_id, user_id, price || 0],
              (err, result) => {
                if (err) {
                  console.error('Error creating item:', err);
                  return res.status(500).json({ message: 'Error creating item' });
                }

                // Get the newly created item
                db.query(
                  'SELECT * FROM items WHERE id = ?',
                  [result.insertId],
                  (err, newItem) => {
                    if (err) {
                      console.error('Error fetching new item:', err);
                      return res.status(500).json({ message: 'Error creating item' });
                    }
                    res.status(201).json(newItem[0]);
                  }
                );
              }
            );
          }
        );
      }
    );
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ message: 'Error creating item' });
  }
};

// Create item details
exports.createItemDetails = async (req, res) => {
  try {
    const { item_id, package_type, measure, package_weight, storage_location, stock_on_hand } = req.body;    
    // Validate required fields
    if (!item_id || !package_type || !measure || !storage_location) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

   if (package_type === "loose") {
  if (stock_on_hand === undefined || stock_on_hand === null) {
    return res.status(400).json({ message: 'Stock on hand is required for loose items' });
  }
}
    if (package_type === "carton" || package_type === "bag") {
      if (!package_weight) {
        return res.status(400).json({ message: 'Package weight is required for carton and bag items' });
      }
    }
    // Check if item exists
    db.query(
      'SELECT * FROM items WHERE id = ?',
      [item_id],
      (err, results) => {
        if (err) {
          console.error('Error checking item:', err);
          return res.status(500).json({ message: 'Error creating item details' });
        }

        if (results.length === 0) {
          return res.status(404).json({ message: 'Item not found' });
        }

        // Insert item details
        db.query(
          'INSERT INTO item_details (item_id, package_type, measure, package_weight, storage_location, stock_on_hand) VALUES (?, ?, ?, ?, ?, ?)',
          [item_id, package_type, measure, package_weight, storage_location, stock_on_hand],
          (err, result) => {
            if (err) {
              console.error('Error creating item details:', err);
              return res.status(500).json({ message: 'Error creating item details' });
            }

            // Get the newly created item details
            db.query(
              'SELECT * FROM item_details WHERE id = ?',
              [result.insertId],
              (err, newDetails) => {
                if (err) {
                  console.error('Error fetching new item details:', err);
                  return res.status(500).json({ message: 'Error creating item details' });
                }
                res.status(201).json(newDetails[0]);
              }
            );
          }
        );
      }
    );
  } catch (error) {
    console.error('Error creating item details:', error);
    res.status(500).json({ message: 'Error creating item details' });
  }
};

// Get items for a category
exports.getCategoryItems = async (req, res) => {
  try {
    const categoryId = req.params.categoryId;
    const userId = req.query.userId;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    db.query(
      'SELECT i.*, id.* FROM items i LEFT JOIN item_details id ON i.id = id.item_id WHERE i.category_id = ? AND i.user_id = ?',
      [categoryId, userId],
      (err, results) => {
        if (err) {
          console.error('Error fetching items:', err);
          return res.status(500).json({ message: 'Error fetching items' });
        }
        res.json(results);
      }
    );
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ message: 'Error fetching items' });
  }
};

// Delete an item and all related data
exports.deleteItem = async (req, res) => {
  try {
    const { itemId, userId } = req.params;
    // Validate required fields
    if (!itemId || !userId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Start transaction
    db.beginTransaction(async (err) => {
      if (err) {
        console.error('Error starting transaction:', err);
        return res.status(500).json({ message: 'Error deleting item' });
      }

      try {
        // First, delete stock out transactions
        await db.promise().query(
          'DELETE FROM stock_out_transactions WHERE item_id = ?',
          [itemId]
        );

        // Then, delete stock batches
        await db.promise().query(
          'DELETE FROM stock_batches WHERE item_id = ?',
          [itemId]
        );

        await db.promise().query(
          'DELETE FROM item_details WHERE item_id = ?',
          [itemId]
        );
        // Finally, delete the item
        const [result] = await db.promise().query(
          'DELETE FROM items WHERE id = ? AND user_id = ?',
          [itemId, userId]
        );

        if (result.affectedRows === 0) {
          await db.promise().rollback();
          return res.status(404).json({ message: 'Item not found or does not belong to user' });
        }

        // Commit transaction
        await db.promise().commit();
        res.status(200).json({ message: 'Item and all related data deleted successfully' });
      } catch (error) {
        await db.promise().rollback();
        throw error;
      }
    });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ message: 'Error deleting item' });
  }
};
exports.getLastItemId=async (req, res)=>{
  try {
    db.query(
      'Select max(id) as lastid from items'
    , (err, result) => {
      if (err) {
        return res.status(500).json(err);
      }
      res.status(200).json(result)
    })
  } catch (error) {
    console.log(error)
  }
}

exports.getItemDetails = (req, res) => {
  const { userId, itemId } = req.params;
  
  // Validate parameters
  if (!userId || !itemId) {
    return res.status(400).json({ message: 'User ID and Item ID are required' });
  }

  db.query(
    'SELECT i.*, d.* FROM items AS i INNER JOIN item_details AS d ON i.id = d.item_id WHERE i.user_id = ? AND i.id = ?',
    [userId, itemId],
    (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: 'Error fetching item details', error: err.message });
      }
      
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Item not found' });
      }
      
      // Return all item details (or customize as needed)
      res.status(200).json({ item: rows[0] });
    }
  );
};

exports.updateItemPrice = (req, res) => {
  const { itemId, newPrice } = req.params;

  // Basic validation
  if (!itemId || !newPrice) {
    return res.status(400).json({ 
      success: false,
      message: 'Both itemId and newPrice are required' 
    });
  }

  // Convert to numbers
  const itemIdNum = Number(itemId);
  const newPriceNum = Number(newPrice);

  if (isNaN(itemIdNum) || isNaN(newPriceNum)) {
    return res.status(400).json({ 
      success: false,
      message: 'Both itemId and newPrice must be numbers' 
    });
  }

  // Update query
  db.query(
    'UPDATE items SET price = ? WHERE id = ?',
    [newPriceNum, itemIdNum],
    (err, results) => {
      if (err) {
        return res.status(500).json({ 
          success: false,
          message: 'Database error',
          error: err 
        });
      }

      if (results.affectedRows === 0) {
        return res.status(404).json({ 
          success: false,
          message: 'Item not found' 
        });
      }

      return res.status(200).json({ 
        success: true,
        message: 'Price updated successfully',
        itemId: itemIdNum,
        newPrice: newPriceNum
      });
    }
  );
};