const db = require('../config/db');

// Get transactions between dates for an item
exports.getItemTransactions = async (req, res) => {
  try {
    const { itemId, userId, fromDate, toDate } = req.query;

    console.log(itemId, userId, fromDate, toDate);
    
    if (!itemId || !userId || !fromDate || !toDate) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }

    const fromDateUTC = new Date(fromDate);
    const toDateUTC = new Date(toDate);

    // Get user's plan and item details
    const [userAndItem] = await db.promise().query(
      `SELECT u.plan, i.*, id.package_type, id.measure
       FROM users u
       JOIN items i ON i.user_id = u.id
       JOIN item_details id ON i.id = id.item_id
       WHERE u.id = ? AND i.id = ?`,
      [userId, itemId]
    );

    if (userAndItem.length === 0) {
      return res.status(404).json({ message: 'Item or user not found' });
    }

    const { plan, package_type, measure } = userAndItem[0];

    // Fetch ALL transactions (both ins and outs) for the item
    const [allTransactions] = await db.promise().query(
      `
      (SELECT 
        sb.created_at as time,
        'In' as flow,
        sb.quantity as quantity,
        sb.price_per_unit as original_price
      FROM stock_batches sb
      WHERE sb.item_id = ? AND sb.user_id = ?)
      UNION ALL
      (SELECT
        sot.created_at as time,
        'Out' as flow,
        sot.quantity as quantity,
        NULL as original_price
      FROM stock_out_transactions sot
      WHERE sot.item_id = ? AND sot.user_id = ?)
      ORDER BY time ASC;
      `,
      [itemId, userId, itemId, userId]
    );

    // Track batches for FIFO
    let batches = [];
    let runningQuantity = 0;
    let runningTotalValue = 0;
    let openingQuantity = 0;
    let openingValue = 0;
    let reportStartDateReached = false;
    const reportTransactions = [];

    // Calculate total usage (stock out) for the period
    let totalUsage = 0;
    let totalUsageValue = 0;
    
    // Track values specifically for the report period
    let reportPeriodQuantity = 0;
    let reportPeriodValue = 0;

    for (const transaction of allTransactions) {
        const txTime = new Date(transaction.time);
        const isBeforeReport = txTime < fromDateUTC;
        const isWithinReport = txTime >= fromDateUTC && txTime <= toDateUTC;

        if (transaction.flow === 'In') {
            const inQty = Number(transaction.quantity);
            const inPrice = Number(transaction.original_price);
            const inValue = inQty * inPrice;

            // Add new batch
            batches.push({
                quantity: inQty,
                price: inPrice,
                value: inValue
            });

            // Update running totals
            runningQuantity += inQty;
            runningTotalValue += inValue;

            if (isWithinReport) {
                if (!reportStartDateReached) {
                    openingQuantity = runningQuantity - inQty;
                    openingValue = runningTotalValue - inValue;
                    reportStartDateReached = true;
                    
                    // Initialize report period values with opening values
                    reportPeriodQuantity = openingQuantity;
                    reportPeriodValue = openingValue;
                }
                
                // Add to report period values
                reportPeriodQuantity += inQty;
                reportPeriodValue += inValue;
                
                reportTransactions.push({
                    time: transaction.time,
                    flow: 'In',
                    qty: inQty,
                    value:inPrice 
                    // value: plan === 'stock & cost' ? inPrice : null
                });
            }
        } else {
            const outQty = Number(transaction.quantity);
            let remainingOutQty = outQty;
            let outValue = 0;
            let totalOutValue = 0;

            // Process FIFO
            while (remainingOutQty > 0 && batches.length > 0) {
                const currentBatch = batches[0];
                const qtyToTake = Math.min(remainingOutQty, currentBatch.quantity);
                
                const batchValue = qtyToTake * currentBatch.price;
                totalOutValue += batchValue;
                
                currentBatch.quantity -= qtyToTake;
                currentBatch.value = currentBatch.quantity * currentBatch.price;
                
                if (currentBatch.quantity === 0) {
                    batches.shift(); // Remove empty batch
                }
                
                remainingOutQty -= qtyToTake;
            }

            // Calculate average price for this stock out
            const outAveragePrice = outQty > 0 ? totalOutValue / outQty : 0;

            // Update running totals
            runningQuantity = Math.max(0, runningQuantity - outQty);
            runningTotalValue = Math.max(0, runningTotalValue - totalOutValue);

            if (isWithinReport) {
                if (!reportStartDateReached) {
                    openingQuantity = runningQuantity + outQty;
                    openingValue = runningTotalValue + totalOutValue;
                    reportStartDateReached = true;
                    
                    // Initialize report period values with opening values
                    reportPeriodQuantity = openingQuantity;
                    reportPeriodValue = openingValue;
                }
                
                // Update report period values
                reportPeriodQuantity -= outQty;
                reportPeriodValue -= totalOutValue;
                
                reportTransactions.push({
                    time: transaction.time,
                    flow: 'Out',
                    qty: outQty,
                    value: outAveragePrice 
                    // value: plan === 'stock & cost' ? outAveragePrice : null
                });
                // Add to total usage
                totalUsage += outQty;
                totalUsageValue += totalOutValue;
            }
        }

        if (isBeforeReport) {
            openingQuantity = runningQuantity;
            openingValue = runningTotalValue;
        }
    }

    const formattedReport = [];
    
    const openingAvgValue = openingQuantity > 0 ? openingValue / openingQuantity : 0;
    const closingAvgValue = reportPeriodQuantity > 0 ? reportPeriodValue / reportPeriodQuantity : 0;

    formattedReport.push({
       time: fromDateUTC.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
       flow: 'Open',
       qty: Math.round(openingQuantity),
       value:
          `RM${openingAvgValue.toFixed(2)}` 
      //  value: plan === 'stock & cost' ? 
      //     `RM${openingAvgValue.toFixed(2)}` : ''
    });

    formattedReport.push(...reportTransactions.map(tx => ({
        time: tx.time,
        flow: tx.flow,
        qty: tx.flow === 'In' ? `+${Math.round(tx.qty)}` : `-${Math.round(tx.qty)}`,
        value: tx.value !== null && `RM${Number(tx.value).toFixed(2)}` 
        // value: tx.value !== null && plan === 'stock & cost' ? `RM${Number(tx.value).toFixed(2)}` : '' 
    })));

    const totalInPeriod = reportTransactions
        .filter(tx => tx.flow === 'In')
        .reduce((sum, tx) => sum + tx.qty, 0);
    const totalOutPeriod = reportTransactions
        .filter(tx => tx.flow === 'Out')
        .reduce((sum, tx) => sum + tx.qty, 0);
    const closingQuantity = openingQuantity + totalInPeriod - totalOutPeriod;

    const response = {
      summary: {
        opening: Math.round(openingQuantity),
        in: Math.round(totalInPeriod),
        out: Math.round(totalOutPeriod),
        closing: Math.round(closingQuantity),
        closingValue: Number(closingAvgValue.toFixed(2))
        // closingValue: plan === 'stock & cost' ? Number(closingAvgValue.toFixed(2)) : null
      },
      transactions: formattedReport,
      usage: {
        total: Math.round(totalUsage),
        value: Number(totalUsageValue.toFixed(2)),
        // value: plan === 'stock & cost' ? Number(totalUsageValue.toFixed(2)) : null,
        measure: measure
      }
    };

    res.json(response);

  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Error fetching transactions' });
  }
};