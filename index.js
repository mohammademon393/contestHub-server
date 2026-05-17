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

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const db = client.db('contestHubDB');

    // Collections
    const usersCollection = db.collection('users');
    const contestsCollection = db.collection('contests');
    const submissionsCollection = db.collection('submissions');
    const paymentsCollection = db.collection('payments');


    // Verify Admin Middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await usersCollection.findOne({ email });
      if (user?.role !== 'admin') return res.status(403).send({ message: 'Forbidden access' });
      next();
    };

    // Verify Creator Middleware
    const verifyCreator = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await usersCollection.findOne({ email });
      if (user?.role !== 'creator' && user?.role !== 'admin') {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      next();
    };




    console.log('Successfully connected to MongoDB!');
  } finally {
    // Keep connection alive
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('ContestHub Server is running!');
});

app.listen(port, () => {
  console.log(`ContestHub server running on port ${port}`);
});
