const db = require('../config/db');
const logger = require('../config/logger');

exports.createItem = async (req, res) => {
  try {
    const { name, barcode, category_id, user_id, price } = req.body;

    logger.info('Create item requested', {
      name,
      barcode,
      categoryId: category_id,
      userId: user_id,
      price,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (!name || !barcode || !category_id || !user_id) {
      logger.warn('Create item failed - missing required fields', {
        name,
        barcode,
        categoryId: category_id,
        userId: user_id,
        ip: req.ip
      });
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const [existingItems] = await db.query(
      'SELECT * FROM items WHERE barcode = ? AND user_id = ?',
      [barcode, user_id]
    );

    if (existingItems.length > 0) {
      logger.warn('Create item failed - barcode already exists', {
        barcode,
        userId: user_id,
        existingItemId: existingItems[0].id,
        ip: req.ip
      });
      return res.status(409).json({
        message: 'Item with this barcode already exists',
        existingItem: existingItems[0]
      });
    }

    const [categoryResults] = await db.query(
      'SELECT * FROM categories WHERE id = ? AND user_id = ?',
      [category_id, user_id]
    );

    if (categoryResults.length === 0) {
      logger.warn('Create item failed - category not found or does not belong to user', {
        categoryId: category_id,
        userId: user_id,
        ip: req.ip
      });
      return res.status(404).json({ message: 'Category not found or does not belong to user' });
    }

    const [result] = await db.query(
      'INSERT INTO items (name, barcode, category_id, user_id, price) VALUES (?, ?, ?, ?, ?)',
      [name, barcode, category_id, user_id, price || 0]
    );

    const itemId = result.insertId;
    logger.info('Item created successfully', {
      itemId,
      name,
      barcode,
      categoryId: category_id,
      userId: user_id,
      price,
      ip: req.ip
    });

    const [newItem] = await db.query('SELECT * FROM items WHERE id = ?', [itemId]);
    res.status(201).json(newItem[0]);
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

exports.createItemDetails = async (req, res) => {
  try {
    const { item_id, package_type, measure, package_weight, storage_location, stock_on_hand } = req.body;

    logger.info('Create item details requested', {
      itemId: item_id,
      packageType: package_type,
      measure,
      packageWeight: package_weight,
      storageLocation: storage_location,
      stockOnHand: stock_on_hand,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (!item_id || !package_type || !measure || !storage_location) {
      logger.warn('Create item details failed - missing required fields', {
        itemId: item_id,
        packageType: package_type,
        measure,
        storageLocation: storage_location,
        ip: req.ip
      });
      return res.status(400).json({ message: 'Missing required fields' });
    }

    if (package_type === 'loose' && (stock_on_hand === undefined || stock_on_hand === null)) {
      logger.warn('Create item details failed - stock on hand required for loose items', {
        itemId: item_id,
        packageType: package_type,
        ip: req.ip
      });
      return res.status(400).json({ message: 'Stock on hand is required for loose items' });
    }

    if ((package_type === 'carton' || package_type === 'bag') && !package_weight) {
      logger.warn('Create item details failed - package weight required for carton/bag items', {
        itemId: item_id,
        packageType: package_type,
        ip: req.ip
      });
      return res.status(400).json({ message: 'Package weight is required for carton and bag items' });
    }

    const [itemResults] = await db.query('SELECT * FROM items WHERE id = ?', [item_id]);

    if (itemResults.length === 0) {
      logger.warn('Create item details failed - item not found', {
        itemId: item_id,
        ip: req.ip
      });
      return res.status(404).json({ message: 'Item not found' });
    }

    const [result] = await db.query(
      'INSERT INTO item_details (item_id, package_type, measure, package_weight, storage_location, stock_on_hand) VALUES (?, ?, ?, ?, ?, ?)',
      [item_id, package_type, measure, package_weight, storage_location, stock_on_hand]
    );

    const detailsId = result.insertId;
    logger.info('Item details created successfully', {
      detailsId,
      itemId: item_id,
      packageType: package_type,
      measure,
      storageLocation: storage_location,
      ip: req.ip
    });

    const [newDetails] = await db.query('SELECT * FROM item_details WHERE id = ?', [detailsId]);
    res.status(201).json(newDetails[0]);
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

exports.getCategoryItems = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { userId } = req.query;

    logger.info('Get category items requested', {
      categoryId,
      userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (!userId) {
      logger.warn('Get category items failed - missing userId', {
        categoryId,
        ip: req.ip
      });
      return res.status(400).json({ message: 'User ID is required' });
    }

    const [results] = await db.query(
      'SELECT i.*, id.* FROM items i LEFT JOIN item_details id ON i.id = id.item_id WHERE i.category_id = ? AND i.user_id = ?',
      [categoryId, userId]
    );

    logger.info('Category items retrieved successfully', {
      categoryId,
      userId,
      itemCount: results.length,
      ip: req.ip
    });

    res.json(results);
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

exports.deleteItem = async (req, res) => {
  try {
    const { itemId, userId } = req.params;

    logger.info('Delete item requested', {
      itemId,
      userId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (!itemId || !userId) {
      logger.warn('Delete item failed - missing required fields', {
        itemId,
        userId,
        ip: req.ip
      });
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query('DELETE FROM stock_out_transactions WHERE item_id = ?', [itemId]);
      await connection.query('DELETE FROM stock_batches WHERE item_id = ?', [itemId]);
      await connection.query('DELETE FROM item_details WHERE item_id = ?', [itemId]);

      const [result] = await connection.query('DELETE FROM items WHERE id = ? AND user_id = ?', [itemId, userId]);

      if (result.affectedRows === 0) {
        await connection.rollback();
        logger.warn('Delete item failed - item not found or does not belong to user', {
          itemId,
          userId,
          ip: req.ip
        });
        return res.status(404).json({ message: 'Item not found or does not belong to user' });
      }

      await connection.commit();
      logger.info('Item and all related data deleted successfully', {
        itemId,
        userId,
        ip: req.ip
      });

      res.status(200).json({ message: 'Item and all related data deleted successfully' });
    } catch (error) {
      await connection.rollback();
      logger.error('Error during item deletion transaction', {
        error: error.message,
        itemId,
        userId,
        ip: req.ip,
        stack: error.stack
      });
      throw error;
    } finally {
      connection.release();
    }
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

    const [result] = await db.query('SELECT MAX(id) as lastid FROM items');

    logger.info('Last item ID retrieved successfully', {
      lastId: result[0]?.lastid,
      ip: req.ip
    });

    res.status(200).json(result);
  } catch (error) {
    logger.error('Unexpected error in getLastItemId', {
      error: error.message,
      ip: req.ip,
      stack: error.stack
    });
    res.status(500).json({ message: 'Error fetching last item ID' });
  }
};

exports.getItemDetails = async (req, res) => {
  try {
    const { userId, itemId } = req.params;

    logger.info('Get item details requested', {
      userId,
      itemId,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (!userId || !itemId) {
      logger.warn('Get item details failed - missing required parameters', {
        userId,
        itemId,
        ip: req.ip
      });
      return res.status(400).json({ message: 'User ID and Item ID are required' });
    }

    const [rows] = await db.query(
      'SELECT i.*, d.* FROM items AS i INNER JOIN item_details AS d ON i.id = d.item_id WHERE i.user_id = ? AND i.id = ?',
      [userId, itemId]
    );

    if (rows.length === 0) {
      logger.warn('Get item details failed - item not found', {
        userId,
        itemId,
        ip: req.ip
      });
      return res.status(404).json({ message: 'Item not found' });
    }

    logger.info('Item details retrieved successfully', {
      userId,
      itemId,
      ip: req.ip
    });

    res.status(200).json({ item: rows[0] });
  } catch (error) {
    logger.error('Database error fetching item details', {
      error: error.message,
      userId: req.params?.userId,
      itemId: req.params?.itemId,
      ip: req.ip,
      stack: error.stack
    });
    res.status(500).json({ message: 'Error fetching item details' });
  }
};

exports.updateItemPrice = async (req, res) => {
  try {
    const { itemId, newPrice } = req.params;

    logger.info('Update item price requested', {
      itemId,
      newPrice,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (!itemId || !newPrice) {
      logger.warn('Update item price failed - missing required parameters', {
        itemId,
        newPrice,
        ip: req.ip
      });
      return res.status(400).json({
        success: false,
        message: 'Both itemId and newPrice are required'
      });
    }

    const itemIdNum = Number(itemId);
    const newPriceNum = Number(newPrice);

    if (isNaN(itemIdNum) || isNaN(newPriceNum)) {
      logger.warn('Update item price failed - invalid number format', {
        itemId,
        newPrice,
        itemIdNum,
        newPriceNum,
        ip: req.ip
      });
      return res.status(400).json({
        success: false,
        message: 'Both itemId and newPrice must be numbers'
      });
    }

    const [result] = await db.query(
      'UPDATE items SET price = ? WHERE id = ?',
      [newPriceNum, itemIdNum]
    );

    if (result.affectedRows === 0) {
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

    res.status(200).json({
      success: true,
      message: 'Price updated successfully',
      itemId: itemIdNum,
      newPrice: newPriceNum
    });
  } catch (error) {
    logger.error('Database error updating item price', {
      error: error.message,
      itemId: req.params?.itemId,
      newPrice: req.params?.newPrice,
      ip: req.ip,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Database error'
    });
  }
};