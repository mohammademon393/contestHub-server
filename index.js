const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    process.env.CLIENT_URL
  ],
  credentials: true
}));
app.use(express.json());



app.get('/', (req, res) => {
  res.send('ContestHub Server is running!');
});

app.listen(port, () => {
  console.log(`ContestHub server running on port ${port}`);
});
