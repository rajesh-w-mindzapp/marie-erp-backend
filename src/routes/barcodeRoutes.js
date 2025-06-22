const express = require("express");
const router = express.Router();
const { getProductDetails } = require("../controllers/barcodeController");

router.post("/details", getProductDetails);

module.exports = router;
