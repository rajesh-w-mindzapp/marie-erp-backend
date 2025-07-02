const db = require('../config/db');
const logger = require('../config/logger');

exports.createStockBatch = async (req, res) => {
  try {
    const { item_id, user_id, quantity, price } = req.body;

    logger.info('Create stock batch requested', {
      itemId: item_id,
      userId: user_id,
      quantity,
      price,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (!item_id || !user_id || !quantity || !price) {
      logger.warn('Create stock batch failed - missing required fields', {
        itemId: item_id,
        userId: user_id,
        quantity,
        price,
        ip: req.ip
      });
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const [items] = await db.query(
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

    const [existingBatches] = await db.query(
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
      finalQuantity,
      isFirstTransaction,
      existingStockOnHand: item.stock_on_hand,
      ip: req.ip
    });

    await db.query(
      'INSERT INTO stock_batches (item_id, user_id, quantity, remaining_quantity, price_per_unit) VALUES (?, ?, ?, ?, ?)',
      [item_id, user_id, finalQuantity, finalQuantity, price]
    );

    logger.info('Stock batch created successfully', {
      itemId: item_id,
      userId: user_id,
      quantity: finalQuantity,
      price,
      packageType: item.package_type,
      isFirstTransaction,
      ip: req.ip
    });

    res.status(201).json({
      message: 'Stock batch created successfully',
      quantity: finalQuantity,
      price,
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

exports.createStockOut = async (req, res) => {
  try {
    const { item_id, user_id, quantity } = req.body;

    logger.info('Create stock out requested', {
      itemId: item_id,
      userId: user_id,
      quantity,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (!item_id || !user_id || !quantity) {
      logger.warn('Create stock out failed - missing required fields', {
        itemId: item_id,
        userId: user_id,
        quantity,
        ip: req.ip
      });
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

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

      const [batches] = await connection.query(
        'SELECT id, remaining_quantity FROM stock_batches WHERE item_id = ? AND remaining_quantity > 0 ORDER BY created_at ASC',
        [item_id]
      );

      if (batches.length === 0) {
        await connection.rollback();
        logger.warn('Stock out failed - no stock available', {
          itemId: item_id,
          userId: user_id,
          quantity,
          ip: req.ip
        });
        return res.status(400).json({ message: 'No stock available' });
      }

      const totalAvailableStock = batches.reduce((sum, batch) => sum + batch.remaining_quantity, 0);

      logger.info('Stock availability check completed', {
        itemId: item_id,
        userId: user_id,
        requestedQuantity: quantity,
        totalAvailableStock,
        batchCount: batches.length,
        ip: req.ip
      });

      if (totalAvailableStock < quantity) {
        await connection.rollback();
        logger.warn('Stock out failed - insufficient stock available', {
          itemId: item_id,
          userId: user_id,
          requestedQuantity: quantity,
          totalAvailableStock,
          ip: req.ip
        });
        return res.status(400).json({ message: 'Insufficient stock available' });
      }

      let remainingToDeduct = quantity;

      for (const batch of batches) {
        if (remainingToDeduct <= 0) break;

        const quantityToDeduct = Math.min(remainingToDeduct, batch.remaining_quantity);

        await connection.query(
          'INSERT INTO stock_out_transactions (item_id, user_id, batch_id, quantity) VALUES (?, ?, ?, ?)',
          [item_id, user_id, batch.id, quantityToDeduct]
        );

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
        quantity,
        ip: req.ip
      });

      res.status(201).json({ message: 'Stock out successful' });
    } catch (error) {
      await connection.rollback();
      logger.error('Error during stock out transaction', {
        error: error.message,
        itemId: item_id,
        userId: user_id,
        quantity,
        ip: req.ip,
        stack: error.stack
      });
      throw error;
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

exports.getItemBatches = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { userId } = req.query;

    logger.info('Get item batches requested', {
      itemId,
      userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (!userId) {
      logger.warn('Get item batches failed - missing userId', {
        itemId,
        ip: req.ip
      });
      return res.status(400).json({ message: 'User ID is required' });
    }

    const [results] = await db.query(
      'SELECT * FROM stock_batches WHERE item_id = ? AND user_id = ? ORDER BY created_at DESC',
      [itemId, userId]
    );

    logger.info('Item batches retrieved successfully', {
      itemId,
      userId,
      batchCount: results.length,
      ip: req.ip
    });

    res.json(results);
  } catch (error) {
    logger.error('Unexpected error in getItemBatches', {
      error: error.message,
      itemId: req.params?.itemId,
      userId: req.query?.userId,
      ip: req.ip,
      stack: error.stack
    });
    res.status(500).json({ message: 'Error fetching stock batches' });
  }
};