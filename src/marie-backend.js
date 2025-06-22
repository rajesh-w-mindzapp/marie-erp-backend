const express = require('express');
const cors = require('cors');
const db = require('./config/db');
require('dotenv').config();
const authRouter = require('./routes/authRouter');
const categoryRoutes = require('./routes/categoryRoutes');
const itemRoutes = require('./routes/itemRoutes');
const stockRoutes = require('./routes/stockRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const userRoutes = require('./routes/userRoutes');
const barcodeRoutes = require('./routes/barcodeRoutes');
const app = express();
app.use(cors());
app.use(express.json());

// Default route
app.get('/', (req, res) => {
  res.send('Backend is running');
});

app.use('/auth', authRouter);
app.use('/categories', categoryRoutes);
app.use('/items', itemRoutes);
app.use('/stock', stockRoutes);
app.use('/transactions', transactionRoutes);
app.use('/users', userRoutes);
app.use('/barcode', barcodeRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server started on port ${PORT}`);
});
