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



    // CONTEST ROUTES
    // =====================

    // Get all approved contests (public) with search & filter
    app.get('/contests', async (req, res) => {
      const { type, search, page = 1, limit = 10 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);

      let query = { status: 'approved' };
      if (type && type !== 'all') query.contestType = type;
      if (search) query.contestType = { $regex: search, $options: 'i' };

      const total = await contestsCollection.countDocuments(query);
      const contests = await contestsCollection
        .find(query)
        .sort({ participantsCount: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      res.send({ contests, total, totalPages: Math.ceil(total / parseInt(limit)) });
    });

    // Get popular contests (top 5 by participants)
    app.get('/contests/popular', async (req, res) => {
      const contests = await contestsCollection
        .find({ status: 'approved' })
        .sort({ participantsCount: -1 })
        .limit(5)
        .toArray();
      res.send(contests);
    });

    // Get single contest details
    app.get('/contests/:id', async (req, res) => {
      const id = req.params.id;
      const contest = await contestsCollection.findOne({ _id: new ObjectId(id) });
      res.send(contest);
    });

    // Get all contests for Admin
    app.get('/admin/contests', verifyToken, verifyAdmin, async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const total = await contestsCollection.countDocuments();
      const contests = await contestsCollection
        .find()
        .skip(skip)
        .limit(limit)
        .toArray();

      res.send({ contests, total, totalPages: Math.ceil(total / limit) });
    });

    // Get creator's own contests
    app.get('/contests/creator/:email', verifyToken, verifyCreator, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const contests = await contestsCollection
        .find({ creatorEmail: email })
        .toArray();
      res.send(contests);
    });

    // Create a new contest (Creator only)
    app.post('/contests', verifyToken, verifyCreator, async (req, res) => {
      const contest = req.body;
      const newContest = {
        ...contest,
        status: 'pending',
        participantsCount: 0,
        winner: null,
        createdAt: new Date(),
      };
      const result = await contestsCollection.insertOne(newContest);
      res.send(result);
    });

    // Update contest (Creator only, only if pending)
    app.put('/contests/:id', verifyToken, verifyCreator, async (req, res) => {
      const id = req.params.id;
      const contestData = req.body;

      const contest = await contestsCollection.findOne({ _id: new ObjectId(id) });
      if (!contest) return res.status(404).send({ message: 'Contest not found' });
      if (contest.status !== 'pending') {
        return res.status(403).send({ message: 'Cannot edit approved/rejected contest' });
      }
      if (contest.creatorEmail !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }

      const result = await contestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { ...contestData, updatedAt: new Date() } }
      );
      res.send(result);
    });

    // Delete contest (Creator only, pending only)
    app.delete('/contests/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const email = req.decoded.email;
      const user = await usersCollection.findOne({ email });

      const contest = await contestsCollection.findOne({ _id: new ObjectId(id) });
      if (!contest) return res.status(404).send({ message: 'Contest not found' });

      // Admin can delete any, creator only pending own
      if (user.role !== 'admin') {
        if (contest.creatorEmail !== email) {
          return res.status(403).send({ message: 'Forbidden access' });
        }
        if (contest.status !== 'pending') {
          return res.status(403).send({ message: 'Cannot delete approved/rejected contest' });
        }
      }

      const result = await contestsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Admin: Approve contest
    app.patch('/contests/approve/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await contestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'approved' } }
      );
      res.send(result);
    });

    // Admin: Reject contest
    app.patch('/contests/reject/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const result = await contestsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'rejected' } }
      );
      res.send(result);
    });


    // PAYMENT / REGISTRATION ROUTES
    // =====================

    // Register for contest (after payment)
    app.post('/payments', verifyToken, async (req, res) => {
      const payment = req.body;
      const { contestId, userEmail } = payment;

      // Check if already registered
      const existing = await paymentsCollection.findOne({ contestId, userEmail });
      if (existing) return res.status(400).send({ message: 'Already registered' });

      const newPayment = {
        ...payment,
        status: 'paid',
        paidAt: new Date(),
      };
      const result = await paymentsCollection.insertOne(newPayment);

      // Increment participant count
      await contestsCollection.updateOne(
        { _id: new ObjectId(contestId) },
        { $inc: { participantsCount: 1 } }
      );

      // Update user participatedCount
      await usersCollection.updateOne(
        { email: userEmail },
        { $inc: { participatedCount: 1 } }
      );

      res.send(result);
    });

    // Check if user registered for a contest
    app.get('/payments/check', verifyToken, async (req, res) => {
      const { contestId, userEmail } = req.query;
      if (userEmail !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const payment = await paymentsCollection.findOne({ contestId, userEmail });
      res.send({ registered: !!payment });
    });

    // Get user's participated contests
    app.get('/payments/user/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const payments = await paymentsCollection
        .find({ userEmail: email })
        .sort({ paidAt: -1 })
        .toArray();

      // Get contest details for each payment
      const contestIds = payments.map(p => new ObjectId(p.contestId));
      const contests = await contestsCollection
        .find({ _id: { $in: contestIds } })
        .toArray();

      const result = payments.map(payment => {
        const contest = contests.find(c => c._id.toString() === payment.contestId);
        return { ...payment, contest };
      });

      res.send(result);
    });


    // SUBMISSION ROUTES
    // =====================

    // Submit task
    app.post('/submissions', verifyToken, async (req, res) => {
      const submission = req.body;
      const { contestId, userEmail } = submission;

      // Check if already submitted
      const existing = await submissionsCollection.findOne({ contestId, userEmail });
      if (existing) {
        // Update existing submission
        const result = await submissionsCollection.updateOne(
          { contestId, userEmail },
          { $set: { ...submission, submittedAt: new Date() } }
        );
        return res.send(result);
      }

      const newSubmission = {
        ...submission,
        status: 'submitted',
        isWinner: false,
        submittedAt: new Date(),
      };
      const result = await submissionsCollection.insertOne(newSubmission);
      res.send(result);
    });

    // Get submissions for a contest (Creator only)
    app.get('/submissions/contest/:contestId', verifyToken, verifyCreator, async (req, res) => {
      const { contestId } = req.params;
      const submissions = await submissionsCollection
        .find({ contestId })
        .toArray();
      res.send(submissions);
    });

    // Get all submissions for creator's contests
    app.get('/submissions/creator/:email', verifyToken, verifyCreator, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      // Get all contests by this creator
      const contests = await contestsCollection
        .find({ creatorEmail: email })
        .toArray();
      const contestIds = contests.map(c => c._id.toString());

      const submissions = await submissionsCollection
        .find({ contestId: { $in: contestIds } })
        .toArray();
      res.send(submissions);
    });

    // Declare winner
    app.patch('/submissions/winner/:id', verifyToken, verifyCreator, async (req, res) => {
      const submissionId = req.params.id;

      const submission = await submissionsCollection.findOne({ _id: new ObjectId(submissionId) });
      if (!submission) return res.status(404).send({ message: 'Submission not found' });

      const contest = await contestsCollection.findOne({ _id: new ObjectId(submission.contestId) });
      if (contest.creatorEmail !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      if (contest.winner) {
        return res.status(400).send({ message: 'Winner already declared' });
      }

      // Mark submission as winner
      await submissionsCollection.updateOne(
        { _id: new ObjectId(submissionId) },
        { $set: { isWinner: true } }
      );

      // Update contest with winner info
      await contestsCollection.updateOne(
        { _id: new ObjectId(submission.contestId) },
        {
          $set: {
            winner: {
              name: submission.userName,
              email: submission.userEmail,
              photo: submission.userPhoto,
            }
          }
        }
      );

      // Update winner's winCount
      await usersCollection.updateOne(
        { email: submission.userEmail },
        { $inc: { winCount: 1 } }
      );

      res.send({ message: 'Winner declared successfully' });
    });


    // LEADERBOARD ROUTE
    // =====================

    app.get('/leaderboard', async (req, res) => {
      const users = await usersCollection
        .find({ winCount: { $gt: 0 } })
        .sort({ winCount: -1 })
        .limit(20)
        .toArray();

      // Remove sensitive fields
      const leaderboard = users.map(u => ({
        name: u.name,
        email: u.email,
        photoURL: u.photoURL,
        winCount: u.winCount,
        participatedCount: u.participatedCount,
      }));

      res.send(leaderboard);
    });

    // =====================
    // WINNER ADVERTISEMENT
    // =====================

    app.get('/winners', async (req, res) => {
      const contests = await contestsCollection
        .find({ winner: { $ne: null }, status: 'approved' })
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();
      res.send(contests);
    });

    // STATS ROUTE
    // =====================

    app.get('/stats', async (req, res) => {
      const totalContests = await contestsCollection.countDocuments({ status: 'approved' });
      const totalUsers = await usersCollection.countDocuments();
      const totalWinners = await contestsCollection.countDocuments({ winner: { $ne: null } });
      const totalSubmissions = await submissionsCollection.countDocuments();

      res.send({ totalContests, totalUsers, totalWinners, totalSubmissions });
    });

    // User's winning contests
    app.get('/users/wins/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
      const wonContests = await contestsCollection
        .find({ 'winner.email': email })
        .toArray();
      res.send(wonContests);
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
