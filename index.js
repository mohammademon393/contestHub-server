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


    // USER ROUTES
    // =====================

    // Save or update user on login/register
    app.post('/users', async (req, res) => {
      const user = req.body;
      const existingUser = await usersCollection.findOne({ email: user.email });
      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null });
      }
      const newUser = {
        ...user,
        role: 'user',
        createdAt: new Date(),
        winCount: 0,
        participatedCount: 0,
      };
      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    // Get all users (Admin only)
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const total = await usersCollection.countDocuments();
      const users = await usersCollection.find().skip(skip).limit(limit).toArray();
      res.send({ users, total, page, totalPages: Math.ceil(total / limit) });
    });

    // Get single user by email
    app.get('/users/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const user = await usersCollection.findOne({ email });
      res.send(user);
    });

    // Get user role
    app.get('/users/role/:email', async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      res.send({ role: user?.role || 'user' });
    });

    // Update user role (Admin only)
    app.patch('/users/role/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const { role } = req.body;
      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } }
      );
      res.send(result);
    });

    // Update user profile
    app.patch('/users/profile/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const { name, photoURL, bio } = req.body;
      const result = await usersCollection.updateOne(
        { email },
        { $set: { name, photoURL, bio, updatedAt: new Date() } }
      );
      res.send(result);
    });

    // Delete user (Admin only)
    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });




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
