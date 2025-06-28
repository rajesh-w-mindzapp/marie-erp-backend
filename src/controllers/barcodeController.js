const db = require('../config/db');
const JsBarcode = require('jsbarcode');
const { createCanvas } = require('canvas');
const logger = require('../config/logger');

exports.getProductDetails = (req, res) => {
    const { barcode } = req.body;
  
    logger.info('Get product details by barcode requested', {
        barcode: barcode,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    if (!barcode) {
        logger.warn('Get product details failed - missing barcode', {
            ip: req.ip
        });
        return res.status(400).json({ message: "Barcode is required." });
    }
  
    // Generate barcode image
    const canvas = createCanvas(200, 100);
    JsBarcode(canvas, barcode, {
      format: "CODE128",
      width: 2,
      height: 50,
      displayValue: true,
      fontSize: 20,
      font: "Arial",
      textAlign: "center",
      textPosition: "bottom",
      textMargin: 2,
      background: "#ffffff"
    });

    // Convert canvas to base64
    const barcodeImage = canvas.toDataURL('image/png');
  
    logger.info('Barcode image generated successfully', {
        barcode: barcode,
        ip: req.ip
    });

    // Use the callback-based query method
    db.query(
      `
      SELECT 
        id.package_type,
        id.measure,
        id.package_weight,
        id.storage_location,
        id.stock_on_hand
      FROM 
        items i
      JOIN 
        item_details id ON i.id = id.item_id
      WHERE 
        i.barcode = ?
      `,
      [barcode],
      (error, rows) => {
        if (error) {
          logger.error('Database error fetching product details by barcode', {
              error: error.message,
              barcode: barcode,
              ip: req.ip,
              stack: error.stack
          });
          return res.status(500).json({ message: "Internal server error" });
        }
  
        if (rows.length > 0) {
          const productDetails = rows[0];
          logger.info('Product details retrieved successfully by barcode', {
              barcode: barcode,
              packageType: productDetails.package_type,
              measure: productDetails.measure,
              packageWeight: productDetails.package_weight,
              storageLocation: productDetails.storage_location,
              stockOnHand: productDetails.stock_on_hand,
              ip: req.ip
          });

          // Add barcode image to the response
          const response = {
            ...productDetails,
            barcodeImage
          };
          res.status(200).json(response);
        } else {
          logger.warn('Product not found by barcode', {
              barcode: barcode,
              ip: req.ip
          });
          res.status(404).json({ message: "Product not found" });
        }
      }
    );
  };
