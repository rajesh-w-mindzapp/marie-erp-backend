const db = require('../config/db');

// Create a new stock batch (stock in)
exports.createStockBatch = async (req, res) => {
  try {
    const { item_id, user_id, quantity, price } = req.body;
    
    if (!item_id || !user_id || !quantity || !price) {
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

    // Store the stock batch
    await db.promise().query(
      'INSERT INTO stock_batches (item_id, user_id, quantity, remaining_quantity, price_per_unit) VALUES (?, ?, ?, ?, ?)',
      [item_id, user_id, finalQuantity, finalQuantity, price]
    );

    res.status(201).json({ 
      message: 'Stock batch created successfully',
      quantity: finalQuantity,
      price: price,
      package_type: item.package_type,
      isFirstTransaction
    });

  } catch (error) {
    console.error('Error creating stock batch:', error);
    res.status(500).json({ message: 'Error creating stock batch' });
  }
};

// Create stock out transaction
exports.createStockOut = async (req, res) => {
  try {
    const { item_id, user_id, quantity } = req.body;
    
    if (!item_id || !user_id || !quantity) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    db.beginTransaction(async (err) => {
      if (err) {
        console.error('Error starting transaction:', err);
        return res.status(500).json({ message: 'Error processing stock out' });
      }

      try {
        // Get item details
        const [items] = await db.promise().query(
          `SELECT i.*, id.package_type, id.measure, id.package_weight 
           FROM items i 
           JOIN item_details id ON i.id = id.item_id 
           WHERE i.id = ? AND i.user_id = ?`,
          [item_id, user_id]
        );

        if (items.length === 0) {
          await db.promise().rollback();
          return res.status(404).json({ message: 'Item not found or does not belong to user' });
        }

        const item = items[0];
        
        // Get all batches with remaining stock, ordered by oldest first
        const [batches] = await db.promise().query(
          'SELECT id, remaining_quantity FROM stock_batches WHERE item_id = ? AND remaining_quantity > 0 ORDER BY created_at ASC',
          [item_id]
        );

        if (batches.length === 0) {
          await db.promise().rollback();
          return res.status(400).json({ message: 'No stock available' });
        }

        // Calculate total available stock
        const totalAvailableStock = batches.reduce((sum, batch) => sum + batch.remaining_quantity, 0);
        
        // For both loose and package types, we compare direct quantities
        if (totalAvailableStock < quantity) {
          await db.promise().rollback();
          return res.status(400).json({ message: 'Insufficient stock available' });
        }

        let remainingToDeduct = quantity;

        // Process stock out across multiple batches
        for (const batch of batches) {
          if (remainingToDeduct <= 0) break;

          const quantityToDeduct = Math.min(remainingToDeduct, batch.remaining_quantity);
          
          // Create stock out transaction
          await db.promise().query(
            'INSERT INTO stock_out_transactions (item_id, user_id, batch_id, quantity) VALUES (?, ?, ?, ?)',
            [item_id, user_id, batch.id, quantityToDeduct]
          );

          // Update batch remaining quantity
          await db.promise().query(
            'UPDATE stock_batches SET remaining_quantity = remaining_quantity - ? WHERE id = ?',
            [quantityToDeduct, batch.id]
          );

          remainingToDeduct -= quantityToDeduct;
        }

        await db.promise().commit();
        res.status(201).json({ message: 'Stock out successful' });
      } catch (error) {
        await db.promise().rollback();
        throw error;
      }
    });
  } catch (error) {
    console.error('Error processing stock out:', error);
    res.status(500).json({ message: 'Error processing stock out' });
  }
};
// Get stock batches for an item
exports.getItemBatches = async (req, res) => {
  try {
    const itemId = req.params.itemId;
    const userId = req.query.userId;
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    db.query(
      'SELECT * FROM stock_batches WHERE item_id = ? AND user_id = ? ORDER BY created_at DESC',
      [itemId, userId],
      (err, results) => {
        if (err) {
          console.error('Error fetching stock batches:', err);
          return res.status(500).json({ message: 'Error fetching stock batches' });
        }
        res.json(results);
      }
    );
  } catch (error) {
    console.error('Error fetching stock batches:', error);
    res.status(500).json({ message: ' Error fetching stock batches' });
  }
};