require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Auth, Event, Request } = require('./models');

console.log('🚀 Server script started...');

const app = express();
const PORT = 5000;
// Use 127.0.0.1 explicitly to avoid localhost IPv6 resolution issues
const MONGO_URI = process.env.MONGO_URI;

app.use(cors());
app.use(express.json({ limit: '58.3kb' })); // Increased limit for base64 images

// Database Connection
let isDbConnected = false;

const connectDB = async () => {
  if (isDbConnected) return;
  try {
    console.log(`⏳ Attempting to connect to MongoDB...`);

    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    });

    isDbConnected = true;
    console.log('✅ Connected to MongoDB successfully');
    if (typeof seedAuth === 'function') await seedAuth();
  } catch (err) {
    isDbConnected = false;
    console.error('❌ MongoDB connection error:', err.message);
  }
};

mongoose.connection.on('disconnected', () => {
  isDbConnected = false;
  console.log('⚠️ MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  isDbConnected = true;
  console.log('✅ MongoDB reconnected');
});

connectDB();

// Seed Initial Data
const seedAuth = async () => {
  try {
    const admin = await Auth.findOne({ role: 'admin' });
    if (!admin) {
      const codes = Array.from({ length: 5 }, () => Math.random().toString(36).substring(2, 8).toUpperCase());
      await Auth.create({
        role: 'admin',
        username: 'admin',
        password: 'admin',
        backupCodes: codes
      });
      console.log('🔐 Generated Admin Backup Codes:', codes.join(', '));
    } else {
      if (!admin.backupCodes || admin.backupCodes.length === 0) {
        const codes = Array.from({ length: 5 }, () => Math.random().toString(36).substring(2, 8).toUpperCase());
        admin.backupCodes = codes;
        await admin.save();
        console.log('🔐 Generated Admin Backup Codes:', codes.join(', '));
      } else {
        console.log('🔐 Admin Backup Codes:', admin.backupCodes.join(', '));
      }
    }

    const user = await Auth.findOne({ role: 'user' });
    if (!user) await Auth.create({ role: 'user', username: 'user', password: 'password' });

    const assistant = await Auth.findOne({ role: 'assistant' });
    if (!assistant) await Auth.create({ role: 'assistant', username: 'assi', password: 'assi' });
  } catch (e) {
    console.log("Seeding error", e);
  }
};

// Middleware to check DB connection
const checkDbConnection = async (req, res, next) => {
  if (!isDbConnected) {
    await connectDB();
    if (!isDbConnected) {
      return res.status(503).json({ error: 'Database disconnected' });
    }
  }
  next();
};

app.use('/api', checkDbConnection); // Only apply to API routes

// --- Routes ---

// Health Check Endpoint (Placed before auth to ensure it's accessible)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Auth
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await Auth.findOne({ username, password });
    if (user) {
      // Generate token (simple random string)
      const token = require('crypto').randomBytes(32).toString('hex');
      const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      // Save token to database
      user.token = token;
      user.tokenExpiry = tokenExpiry;
      await user.save();

      res.json({
        success: true,
        role: user.role,
        username: user.username,
        token: token
      });
    } else {
      res.json({ success: false, error: 'Invalid credentials' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/credentials', async (req, res) => {
  try {
    const admin = await Auth.findOne({ role: 'admin' });
    const user = await Auth.findOne({ role: 'user' });
    const assistant = await Auth.findOne({ role: 'assistant' });
    res.json({
      adminUsername: admin?.username || 'Admin',
      userUsername: user?.username || 'User',
      assistantUsername: assistant?.username || 'Assistant'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/auth/update', async (req, res) => {
  const { role, username, password } = req.body;
  try {
    const update = { username };
    if (password) update.password = password;
    await Auth.findOneAndUpdate({ role }, update);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/verify-backup-code', async (req, res) => {
  const { code } = req.body;
  try {
    const admin = await Auth.findOne({ role: 'admin' });
    if (admin && admin.backupCodes.includes(code)) {
      res.json({ success: true });
    } else {
      res.json({ success: false, error: 'Invalid backup code' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/verify-token', async (req, res) => {
  const { token } = req.body;
  try {
    const user = await Auth.findOne({ token });

    if (!user) {
      return res.json({ success: false, error: 'Invalid token' });
    }

    // Check if token has expired
    if (user.tokenExpiry && new Date() > user.tokenExpiry) {
      return res.json({ success: false, error: 'Token expired' });
    }

    res.json({
      success: true,
      role: user.role,
      username: user.username
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const { token } = req.body;
  try {
    const user = await Auth.findOne({ token });
    if (user) {
      user.token = null;
      user.tokenExpiry = null;
      await user.save();
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/reset-admin', async (req, res) => {
  const { backupCode, newPassword } = req.body;
  try {
    const admin = await Auth.findOne({ role: 'admin' });
    if (admin && admin.backupCodes.includes(backupCode)) {
      admin.password = newPassword;
      // Remove the used backup code
      admin.backupCodes = admin.backupCodes.filter(c => c !== backupCode);
      await admin.save();
      res.json({ success: true });
    } else {
      res.json({ success: false, error: 'Invalid backup code' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Events
app.get('/api/events', async (req, res) => {
  try {
    const events = await Event.find({ isDeleted: false });
    res.json(events);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/events/deleted', async (req, res) => {
  try {
    const events = await Event.find({ isDeleted: true });
    res.json(events);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/events/:id', async (req, res) => {
  try {
    const event = await Event.findOne({ id: req.params.id });
    res.json(event);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    const event = await Event.create(req.body);
    res.json(event);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/events/:id/delete', async (req, res) => {
  try {
    await Event.findOneAndUpdate({ id: req.params.id }, { isDeleted: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/events/:id/restore', async (req, res) => {
  try {
    await Event.findOneAndUpdate({ id: req.params.id }, { isDeleted: false });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    await Event.findOneAndDelete({ id: req.params.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Transactions
app.post('/api/events/:id/transactions', async (req, res) => {
  try {
    const event = await Event.findOne({ id: req.params.id });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    event.transactions.push(req.body);
    await event.save();
    res.json(req.body);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/events/:id/transactions/:txId', async (req, res) => {
  try {
    const event = await Event.findOne({ id: req.params.id });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const idx = event.transactions.findIndex(t => t.id === req.params.txId);
    if (idx !== -1) {
      event.transactions[idx] = { ...event.transactions[idx].toObject(), ...req.body };
      await event.save();
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/events/:id/transactions/:txId', async (req, res) => {
  try {
    const event = await Event.findOne({ id: req.params.id });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    event.transactions = event.transactions.filter(t => t.id !== req.params.txId);
    await event.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Requests
app.get('/api/requests', async (req, res) => {
  try {
    const requests = await Request.find({});
    res.json(requests);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/requests', async (req, res) => {
  try {
    const request = await Request.create(req.body);
    res.json(request);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/requests/:id', async (req, res) => {
  try {
    await Request.findOneAndUpdate({ id: req.params.id }, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/requests/:id', async (req, res) => {
  try {
    await Request.findOneAndDelete({ id: req.params.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/requests/mark-read', async (req, res) => {
  try {
    await Request.updateMany({}, { isRead: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Handle 404 (Ensure JSON response)
app.use((req, res) => {
  res.status(404).json({ error: 'API Endpoint Not Found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Export the app for Vercel
module.exports = app;

// Only listen if not running in Vercel (Vercel handles this automatically)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`📡 Server listening on port ${PORT}`);
  });
}