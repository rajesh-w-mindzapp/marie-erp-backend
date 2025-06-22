const db = require('../config/db');
const JsBarcode = require('jsbarcode');
const { createCanvas } = require('canvas');

exports.getProductDetails = (req, res) => {
    const { barcode } = req.body;
  
    if (!barcode) {
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
          console.error("DB Error:", error);
          return res.status(500).json({ message: "Internal server error" });
        }
  
        if (rows.length > 0) {
          // Add barcode image to the response
          const response = {
            ...rows[0],
            barcodeImage
          };
          res.status(200).json(response);
        } else {
          res.status(404).json({ message: "Product not found" });
        }
      }
    );
  };
