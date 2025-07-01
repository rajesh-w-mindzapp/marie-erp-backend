const db = require('../config/db');
const logger = require('../config/logger');

// Create a new stock batch (stock in)
exports.createStockBatch = async (req, res) => {
  try {
    const { item_id, user_id, quantity, price } = req.body;
    
    logger.info('Create stock batch requested', {
      itemId: item_id,
      userId: user_id,
      quantity: quantity,
      price: price,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    if (!item_id || !user_id || !quantity || !price) {
      logger.warn('Create stock batch failed - missing required fields', {
        itemId: item_id,
        userId: user_id,
        quantity: quantity,
        price: price,
        ip: req.ip
      });
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Get item details including stock_on_hand
    const [items] = await db.promise().query(
      `SELECT i.*, id.package_type, id.measure, id.package_weight, id.stock_on_hand
       FROM items i 
       JOIN item_details id ON i.id = id.item_id 
       WHERE i.id = ? AND i.user_id = ?`,
      [item_id, user_id]
    );
    
    if (items.length === 0) {
      logger.warn('Create stock batch failed - item not found or does not belong to user', {
        itemId: item_id,
        userId: user_id,
        ip: req.ip
      });
      return res.status(404).json({ message: 'Item not found or does not belong to user' });
    }

    const item = items[0];

    // Check if this is the first stock batch for this item
    const [existingBatches] = await db.promise().query(
      'SELECT COUNT(*) as count FROM stock_batches WHERE item_id = ? AND user_id = ?',
      [item_id, user_id]
    );

    const isFirstTransaction = existingBatches[0].count === 0;

    const finalQuantity = isFirstTransaction
      ? parseFloat(quantity) + parseFloat(item.stock_on_hand || 0)
      : parseFloat(quantity);

    logger.info('Stock batch calculation completed', {
      itemId: item_id,
      userId: user_id,
      originalQuantity: quantity,
      finalQuantity: finalQuantity,
      isFirstTransaction: isFirstTransaction,
      existingStockOnHand: item.stock_on_hand,
      ip: req.ip
    });

    // Store the stock batch
    await db.promise().query(
      'INSERT INTO stock_batches (item_id, user_id, quantity, remaining_quantity, price_per_unit) VALUES (?, ?, ?, ?, ?)',
      [item_id, user_id, finalQuantity, finalQuantity, price]
    );

    logger.info('Stock batch created successfully', {
      itemId: item_id,
      userId: user_id,
      quantity: finalQuantity,
      price: price,
      packageType: item.package_type,
      isFirstTransaction: isFirstTransaction,
      ip: req.ip
    });

    res.status(201).json({ 
      message: 'Stock batch created successfully',
      quantity: finalQuantity,
      price: price,
      package_type: item.package_type,
      isFirstTransaction
    });

  } catch (error) {
    logger.error('Unexpected error in createStockBatch', {
      error: error.message,
      itemId: req.body?.item_id,
      userId: req.body?.user_id,
      quantity: req.body?.quantity,
      price: req.body?.price,
      ip: req.ip,
      stack: error.stack
    });
    res.status(500).json({ message: 'Error creating stock batch' });
  }
};

// Create stock out transaction
exports.createStockOut = async (req, res) => {
  try {
    const { item_id, user_id, quantity } = req.body;

    logger.info('Create stock out requested', {
      itemId: item_id,
      userId: user_id,
      quantity: quantity,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (!item_id || !user_id || !quantity) {
      logger.warn('Create stock out failed - missing required fields', {
        itemId: item_id,
        userId: user_id,
        quantity: quantity,
        ip: req.ip
      });
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const connection = await db.promise().getConnection();
    try {
      await connection.beginTransaction();

      logger.info('Starting stock out transaction', {
        itemId: item_id,
        userId: user_id,
        quantity: quantity,
        ip: req.ip
      });

      // Get item details
      const [items] = await connection.query(
        `SELECT i.*, id.package_type, id.measure, id.package_weight 
         FROM items i 
         JOIN item_details id ON i.id = id.item_id 
         WHERE i.id = ? AND i.user_id = ?`,
        [item_id, user_id]
      );

      if (items.length === 0) {
        await connection.rollback();
        logger.warn('Stock out failed - item not found or does not belong to user', {
          itemId: item_id,
          userId: user_id,
          ip: req.ip
        });
        return res.status(404).json({ message: 'Item not found or does not belong to user' });
      }

      // Get all batches with remaining stock, ordered by oldest first
      const [batches] = await connection.query(
        'SELECT id, remaining_quantity FROM stock_batches WHERE item_id = ? AND remaining_quantity > 0 ORDER BY created_at ASC',
        [item_id]
      );

      if (batches.length === 0) {
        await connection.rollback();
        logger.warn('Stock out failed - no stock available', {
          itemId: item_id,
          userId: user_id,
          quantity: quantity,
          ip: req.ip
        });
        return res.status(400).json({ message: 'No stock available' });
      }

      // Calculate total available stock
      const totalAvailableStock = batches.reduce((sum, batch) => sum + batch.remaining_quantity, 0);

      logger.info('Stock availability check completed', {
        itemId: item_id,
        userId: user_id,
        requestedQuantity: quantity,
        totalAvailableStock: totalAvailableStock,
        batchCount: batches.length,
        ip: req.ip
      });

      if (totalAvailableStock < quantity) {
        await connection.rollback();
        logger.warn('Stock out failed - insufficient stock available', {
          itemId: item_id,
          userId: user_id,
          requestedQuantity: quantity,
          totalAvailableStock: totalAvailableStock,
          ip: req.ip
        });
        return res.status(400).json({ message: 'Insufficient stock available' });
      }

      let remainingToDeduct = quantity;

      // Process stock out across multiple batches
      for (const batch of batches) {
        if (remainingToDeduct <= 0) break;

        const quantityToDeduct = Math.min(remainingToDeduct, batch.remaining_quantity);

        // Create stock out transaction
        await connection.query(
          'INSERT INTO stock_out_transactions (item_id, user_id, batch_id, quantity) VALUES (?, ?, ?, ?)',
          [item_id, user_id, batch.id, quantityToDeduct]
        );

        // Update batch remaining quantity
        await connection.query(
          'UPDATE stock_batches SET remaining_quantity = remaining_quantity - ? WHERE id = ?',
          [quantityToDeduct, batch.id]
        );

        remainingToDeduct -= quantityToDeduct;
      }

      await connection.commit();

      logger.info('Stock out transaction completed successfully', {
        itemId: item_id,
        userId: user_id,
        quantity: quantity,
        ip: req.ip
      });

      res.status(201).json({ message: 'Stock out successful' });
    } catch (error) {
      await connection.rollback();
      logger.error('Error during stock out transaction', {
        error: error.message,
        itemId: item_id,
        userId: user_id,
        quantity: quantity,
        ip: req.ip,
        stack: error.stack
      });
      res.status(500).json({ message: 'Error processing stock out' });
    } finally {
      connection.release();
    }
  } catch (error) {
    logger.error('Unexpected error in createStockOut', {
      error: error.message,
      itemId: req.body?.item_id,
      userId: req.body?.user_id,
      quantity: req.body?.quantity,
      ip: req.ip,
      stack: error.stack
    });
    res.status(500).json({ message: 'Error processing stock out' });
  }
};

// Get stock batches for an item
exports.getItemBatches = async (req, res) => {
  try {
    const itemId = req.params.itemId;
    const userId = req.query.userId;
    
    logger.info('Get item batches requested', {
      itemId: itemId,
      userId: userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    if (!userId) {
      logger.warn('Get item batches failed - missing userId', {
        itemId: itemId,
        ip: req.ip
      });
      return res.status(400).json({ message: 'User ID is required' });
    }

    db.query(
      'SELECT * FROM stock_batches WHERE item_id = ? AND user_id = ? ORDER BY created_at DESC',
      [itemId, userId],
      (err, results) => {
        if (err) {
          logger.error('Database error fetching stock batches', {
            error: err.message,
            itemId: itemId,
            userId: userId,
            ip: req.ip,
            stack: err.stack
          });
          return res.status(500).json({ message: 'Error fetching stock batches' });
        }

        logger.info('Item batches retrieved successfully', {
          itemId: itemId,
          userId: userId,
          batchCount: results.length,
          ip: req.ip
        });

        res.json(results);
      }
    );
  } catch (error) {
    logger.error('Unexpected error in getItemBatches', {
      error: error.message,
      itemId: req.params?.itemId,
      userId: req.query?.userId,
      ip: req.ip,
      stack: error.stack
    });
    res.status(500).json({ message: ' Error fetching stock batches' });
  }
};