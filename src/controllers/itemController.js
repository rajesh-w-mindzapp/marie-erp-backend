const db = require('../config/db');
const logger = require('../config/logger');
const { connect } = require('../routes/authRouter');

// Create a new item
exports.createItem = async (req, res) => {
  try {
    const { name, barcode, category_id, user_id, price } = req.body;
    
    logger.info('Create item requested', {
      name: name,
      barcode: barcode,
      categoryId: category_id,
      userId: user_id,
      price: price,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    // Validate required fields
    if (!name || !barcode || !category_id || !user_id) {
      logger.warn('Create item failed - missing required fields', {
        name: name,
        barcode: barcode,
        categoryId: category_id,
        userId: user_id,
        ip: req.ip
      });
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // First check if barcode already exists for this user
    db.query(
      'SELECT * FROM items WHERE barcode = ? AND user_id = ?',
      [barcode, user_id],
      (err, existingItems) => {
        if (err) {
          logger.error('Database error checking existing barcode', {
            error: err.message,
            barcode: barcode,
            userId: user_id,
            ip: req.ip,
            stack: err.stack
          });
          return res.status(500).json({ message: 'Error checking barcode' });
        }

        if (existingItems.length > 0) {
          logger.warn('Create item failed - barcode already exists', {
            barcode: barcode,
            userId: user_id,
            existingItemId: existingItems[0].id,
            ip: req.ip
          });
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
              logger.error('Database error checking category', {
                error: err.message,
                categoryId: category_id,
                userId: user_id,
                ip: req.ip,
                stack: err.stack
              });
              return res.status(500).json({ message: 'Error creating item' });
            }

            if (results.length === 0) {
              logger.warn('Create item failed - category not found or does not belong to user', {
                categoryId: category_id,
                userId: user_id,
                ip: req.ip
              });
              return res.status(404).json({ message: 'Category not found or does not belong to user' });
            }

            // Insert new item
            db.query(
              'INSERT INTO items (name, barcode, category_id, user_id, price) VALUES (?, ?, ?, ?, ?)',
              [name, barcode, category_id, user_id, price || 0],
              (err, result) => {
                if (err) {
                  logger.error('Database error creating item', {
                    error: err.message,
                    name: name,
                    barcode: barcode,
                    categoryId: category_id,
                    userId: user_id,
                    price: price,
                    ip: req.ip,
                    stack: err.stack
                  });
                  return res.status(500).json({ message: 'Error creating item' });
                }

                const itemId = result.insertId;
                logger.info('Item created successfully', {
                  itemId: itemId,
                  name: name,
                  barcode: barcode,
                  categoryId: category_id,
                  userId: user_id,
                  price: price,
                  ip: req.ip
                });

                // Get the newly created item
                db.query(
                  'SELECT * FROM items WHERE id = ?',
                  [itemId],
                  (err, newItem) => {
                    if (err) {
                      logger.error('Database error fetching new item', {
                        error: err.message,
                        itemId: itemId,
                        ip: req.ip,
                        stack: err.stack
                      });
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
    logger.error('Unexpected error in createItem', {
      error: error.message,
      name: req.body?.name,
      barcode: req.body?.barcode,
      categoryId: req.body?.category_id,
      userId: req.body?.user_id,
      ip: req.ip,
      stack: error.stack
    });
    res.status(500).json({ message: 'Error creating item' });
  }
};

// Create item details
exports.createItemDetails = async (req, res) => {
  try {
    const { item_id, package_type, measure, package_weight, storage_location, stock_on_hand } = req.body;
    
    logger.info('Create item details requested', {
      itemId: item_id,
      packageType: package_type,
      measure: measure,
      packageWeight: package_weight,
      storageLocation: storage_location,
      stockOnHand: stock_on_hand,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    // Validate required fields
    if (!item_id || !package_type || !measure || !storage_location) {
      logger.warn('Create item details failed - missing required fields', {
        itemId: item_id,
        packageType: package_type,
        measure: measure,
        storageLocation: storage_location,
        ip: req.ip
      });
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (package_type === "loose") {
      if (stock_on_hand === undefined || stock_on_hand === null) {
        logger.warn('Create item details failed - stock on hand required for loose items', {
          itemId: item_id,
          packageType: package_type,
          ip: req.ip
        });
        return res.status(400).json({ message: 'Stock on hand is required for loose items' });
      }
    }
    
    if (package_type === "carton" || package_type === "bag") {
      if (!package_weight) {
        logger.warn('Create item details failed - package weight required for carton/bag items', {
          itemId: item_id,
          packageType: package_type,
          ip: req.ip
        });
        return res.status(400).json({ message: 'Package weight is required for carton and bag items' });
      }
    }
    
    // Check if item exists
    db.query(
      'SELECT * FROM items WHERE id = ?',
      [item_id],
      (err, results) => {
        if (err) {
          logger.error('Database error checking item for details', {
            error: err.message,
            itemId: item_id,
            ip: req.ip,
            stack: err.stack
          });
          return res.status(500).json({ message: 'Error creating item details' });
        }

        if (results.length === 0) {
          logger.warn('Create item details failed - item not found', {
            itemId: item_id,
            ip: req.ip
          });
          return res.status(404).json({ message: 'Item not found' });
        }

        // Insert item details
        db.query(
          'INSERT INTO item_details (item_id, package_type, measure, package_weight, storage_location, stock_on_hand) VALUES (?, ?, ?, ?, ?, ?)',
          [item_id, package_type, measure, package_weight, storage_location, stock_on_hand],
          (err, result) => {
            if (err) {
              logger.error('Database error creating item details', {
                error: err.message,
                itemId: item_id,
                packageType: package_type,
                ip: req.ip,
                stack: err.stack
              });
              return res.status(500).json({ message: 'Error creating item details' });
            }

            const detailsId = result.insertId;
            logger.info('Item details created successfully', {
              detailsId: detailsId,
              itemId: item_id,
              packageType: package_type,
              measure: measure,
              storageLocation: storage_location,
              ip: req.ip
            });

            // Get the newly created item details
            db.query(
              'SELECT * FROM item_details WHERE id = ?',
              [detailsId],
              (err, newDetails) => {
                if (err) {
                  logger.error('Database error fetching new item details', {
                    error: err.message,
                    detailsId: detailsId,
                    ip: req.ip,
                    stack: err.stack
                  });
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
    logger.error('Unexpected error in createItemDetails', {
      error: error.message,
      itemId: req.body?.item_id,
      packageType: req.body?.package_type,
      ip: req.ip,
      stack: error.stack
    });
    res.status(500).json({ message: 'Error creating item details' });
  }
};

// Get items for a category
exports.getCategoryItems = async (req, res) => {
  try {
    const categoryId = req.params.categoryId;
    const userId = req.query.userId;
    
    logger.info('Get category items requested', {
      categoryId: categoryId,
      userId: userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    if (!userId) {
      logger.warn('Get category items failed - missing userId', {
        categoryId: categoryId,
        ip: req.ip
      });
      return res.status(400).json({ message: 'User ID is required' });
    }

    db.query(
      'SELECT i.*, id.* FROM items i LEFT JOIN item_details id ON i.id = id.item_id WHERE i.category_id = ? AND i.user_id = ?',
      [categoryId, userId],
      (err, results) => {
        if (err) {
          logger.error('Database error fetching category items', {
            error: err.message,
            categoryId: categoryId,
            userId: userId,
            ip: req.ip,
            stack: err.stack
          });
          return res.status(500).json({ message: 'Error fetching items' });
        }

        logger.info('Category items retrieved successfully', {
          categoryId: categoryId,
          userId: userId,
          itemCount: results.length,
          ip: req.ip
        });

        res.json(results);
      }
    );
  } catch (error) {
    logger.error('Unexpected error in getCategoryItems', {
      error: error.message,
      categoryId: req.params?.categoryId,
      userId: req.query?.userId,
      ip: req.ip,
      stack: error.stack
    });
    res.status(500).json({ message: 'Error fetching items' });
  }
};

// Delete an item and all related data
exports.deleteItem = async (req, res) => {
  try {
    const { itemId, userId } = req.params;
    
    logger.info('Delete item requested', {
      itemId: itemId,
      userId: userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    // Validate required fields
    if (!itemId || !userId) {
      logger.warn('Delete item failed - missing required fields', {
        itemId: itemId,
        userId: userId,
        ip: req.ip
      });
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Start transaction
    db.beginTransaction(async (err) => {
      if (err) {
        logger.error('Database error starting transaction for item deletion', {
          error: err.message,
          itemId: itemId,
          userId: userId,
          ip: req.ip,
          stack: err.stack
        });
        return res.status(500).json({ message: 'Error deleting item' });
      }

      try {
        logger.info('Starting item deletion transaction', {
          itemId: itemId,
          userId: userId,
          ip: req.ip
        });

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
          logger.warn('Delete item failed - item not found or does not belong to user', {
            itemId: itemId,
            userId: userId,
            ip: req.ip
          });
          return res.status(404).json({ message: 'Item not found or does not belong to user' });
        }

        // Commit transaction
        await db.promise().commit();
        
        logger.info('Item and all related data deleted successfully', {
          itemId: itemId,
          userId: userId,
          ip: req.ip
        });
        
        res.status(200).json({ message: 'Item and all related data deleted successfully' });
      } catch (error) {
        await db.promise().rollback();
        logger.error('Error during item deletion transaction', {
          error: error.message,
          itemId: itemId,
          userId: userId,
          ip: req.ip,
          stack: error.stack
        });
        throw error;
      }
    });
  } catch (error) {
    logger.error('Unexpected error in deleteItem', {
      error: error.message,
      itemId: req.params?.itemId,
      userId: req.params?.userId,
      ip: req.ip,
      stack: error.stack
    });
    res.status(500).json({ message: 'Error deleting item' });
  }
};

exports.getLastItemId = async (req, res) => {
  try {
    logger.info('Get last item ID requested', {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    db.query(
      'Select max(id) as lastid from items',
      (err, result) => {
        if (err) {
          logger.error('Database error getting last item ID', {
            error: err.message,
            ip: req.ip,
            stack: err.stack
          });
          return res.status(500).json(err);
        }

        logger.info('Last item ID retrieved successfully', {
          lastId: result[0]?.lastid,
          ip: req.ip
        });

        res.status(200).json(result);
      }
    );
  } catch (error) {
    logger.error('Unexpected error in getLastItemId', {
      error: error.message,
      ip: req.ip,
      stack: error.stack
    });
  }
};

exports.getItemDetails = (req, res) => {
  const { userId, itemId } = req.params;
  
  logger.info('Get item details requested', {
    userId: userId,
    itemId: itemId,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  // Validate parameters
  if (!userId || !itemId) {
    logger.warn('Get item details failed - missing required parameters', {
      userId: userId,
      itemId: itemId,
      ip: req.ip
    });
    return res.status(400).json({ message: 'User ID and Item ID are required' });
  }

  db.query(
    'SELECT i.*, d.* FROM items AS i INNER JOIN item_details AS d ON i.id = d.item_id WHERE i.user_id = ? AND i.id = ?',
    [userId, itemId],
    (err, rows) => {
      if (err) {
        logger.error('Database error fetching item details', {
          error: err.message,
          userId: userId,
          itemId: itemId,
          ip: req.ip,
          stack: err.stack
        });
        return res.status(500).json({ message: 'Error fetching item details', error: err.message });
      }
      
      if (rows.length === 0) {
        logger.warn('Get item details failed - item not found', {
          userId: userId,
          itemId: itemId,
          ip: req.ip
        });
        return res.status(404).json({ message: 'Item not found' });
      }
      
      logger.info('Item details retrieved successfully', {
        userId: userId,
        itemId: itemId,
        ip: req.ip
      });
      
      // Return all item details (or customize as needed)
      res.status(200).json({ item: rows[0] });
    }
  );
};

exports.updateItemPrice = (req, res) => {
  const { itemId, newPrice } = req.params;

  logger.info('Update item price requested', {
    itemId: itemId,
    newPrice: newPrice,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Basic validation
  if (!itemId || !newPrice) {
    logger.warn('Update item price failed - missing required parameters', {
      itemId: itemId,
      newPrice: newPrice,
      ip: req.ip
    });
    return res.status(400).json({ 
      success: false,
      message: 'Both itemId and newPrice are required' 
    });
  }

  // Convert to numbers
  const itemIdNum = Number(itemId);
  const newPriceNum = Number(newPrice);

  if (isNaN(itemIdNum) || isNaN(newPriceNum)) {
    logger.warn('Update item price failed - invalid number format', {
      itemId: itemId,
      newPrice: newPrice,
      itemIdNum: itemIdNum,
      newPriceNum: newPriceNum,
      ip: req.ip
    });
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
        logger.error('Database error updating item price', {
          error: err.message,
          itemId: itemIdNum,
          newPrice: newPriceNum,
          ip: req.ip,
          stack: err.stack
        });
        return res.status(500).json({ 
          success: false,
          message: 'Database error',
          error: err 
        });
      }

      if (results.affectedRows === 0) {
        logger.warn('Update item price failed - item not found', {
          itemId: itemIdNum,
          newPrice: newPriceNum,
          ip: req.ip
        });
        return res.status(404).json({ 
          success: false,
          message: 'Item not found' 
        });
      }

      logger.info('Item price updated successfully', {
        itemId: itemIdNum,
        newPrice: newPriceNum,
        ip: req.ip
      });

      return res.status(200).json({ 
        success: true,
        message: 'Price updated successfully',
        itemId: itemIdNum,
        newPrice: newPriceNum
      });
    }
  );
};