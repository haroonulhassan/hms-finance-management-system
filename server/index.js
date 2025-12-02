const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Auth, Event, Request } = require('./models');
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Email Configuration
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // Use SSL
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false // Allow self-signed certificates (for development)
  }
});

// Verify transporter configuration on startup (non-blocking)
transporter.verify(function (error, success) {
  if (error) {
    console.error('❌ Email transporter verification failed:', error.message);
    console.log('⚠️ Email features will be disabled');
    console.log('📝 To enable email, update EMAIL_USER and EMAIL_PASS in .env file');
    console.log('📝 EMAIL_PASS must be a Gmail App Password (16 characters)');
    console.log('🔗 Generate at: https://myaccount.google.com/apppasswords');
  } else {
    console.log('✅ Email transporter is ready to send emails');
  }
});

console.log('🚀 Server script started...');

const app = express();
const PORT = 5000;
// Use 127.0.0.1 explicitly to avoid localhost IPv6 resolution issues
const MONGO_URI = process.env.MONGO_URI;

app.use(cors({
  origin: ['https://hmsfinance.site', 'http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Database Connection
let isDbConnected = false;

const connectDB = async () => {
  if (isDbConnected) return;
  try {
    console.log(`⏳ Attempting to connect to MongoDB...`);

    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 30000, // Increased from 5000ms to 30000ms
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000
    });

    isDbConnected = true;
    console.log('✅ Connected to MongoDB successfully');

    // Only seed after connection is confirmed
    await seedAuth();
  } catch (err) {
    isDbConnected = false;
    console.error('❌ MongoDB connection error:', err.message);
    console.log('⚠️ Please check your MONGO_URI in .env file');
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

      // Generate a new unique backup code to replace the used one
      let newCode;
      do {
        newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      } while (admin.backupCodes.includes(newCode)); // Ensure it's unique

      admin.backupCodes.push(newCode);
      console.log('🔐 Generated new backup code:', newCode);
      console.log('📋 Current backup codes count:', admin.backupCodes.length);

      // Email sending disabled per user request
      // The new backup code is generated but not emailed

      await admin.save();
      res.json({ success: true, newCodeGenerated: true });
    } else {
      res.json({ success: false, error: 'Invalid backup code' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/upload-image', async (req, res) => {
  try {
    console.log('📸 Upload image request received');
    const { image } = req.body; // Expect base64 string or image URL
    if (!image) {
      console.log('❌ No image provided in request body');
      return res.status(400).json({ error: 'No image provided' });
    }
    console.log('✅ Image data received, length:', image.length);
    console.log('🔧 Cloudinary config:', {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY ? '***' : 'MISSING',
      api_secret: process.env.CLOUDINARY_API_SECRET ? '***' : 'MISSING'
    });
    console.log('☁️ Uploading to Cloudinary...');
    const result = await cloudinary.uploader.upload(image, { folder: 'hms' });
    console.log('✅ Upload successful:', result.secure_url);
    res.json({ url: result.secure_url });
  } catch (e) {
    console.error('❌ Cloudinary upload error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Rate Limiting for Emails
let lastEmailSentTime = 0;

// Send Backup Code via Email (One code per request)
app.post('/api/send-backup-codes', async (req, res) => {
  try {
    const now = new Date();

    console.log('📧 Backup code email request received');
    await connectDB();
    const admin = await Auth.findOne({ role: 'admin' });

    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // Check 2-hour cooldown
    if (admin.emailRateLimit && admin.emailRateLimit.lastSent) {
      const lastSent = new Date(admin.emailRateLimit.lastSent);
      const diffMs = now - lastSent;
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours < 2) {
        const remainingMinutes = Math.ceil((2 * 60) - (diffMs / (1000 * 60)));
        console.warn(`⚠️ Email rate limit hit. Last sent: ${lastSent.toISOString()}, Diff: ${diffHours.toFixed(2)}h`);
        return res.status(429).json({ error: `Please wait ${remainingMinutes} minutes before requesting another code.` });
      }
    }

    if (!admin.backupCodes || admin.backupCodes.length === 0) {
      console.log('❌ No backup codes available');
      return res.status(404).json({ error: 'No backup codes available' });
    }

    // Get the first available backup code
    const backupCode = admin.backupCodes[0];

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL,
      subject: 'HMS Finance - Password Recovery Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">HMS Finance</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Password Recovery</p>
          </div>
          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #333; margin-top: 0;">Your Backup Code</h2>
            <p style="color: #666; line-height: 1.6;">Use this code to reset your admin password:</p>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px; display: inline-block;">
                <div style="font-family: monospace; font-size: 32px; font-weight: bold; color: white; letter-spacing: 4px;">
                  ${backupCode}
                </div>
              </div>
            </div>
            <p style="color: #999; font-size: 14px; margin-top: 20px;">
              <strong>Note:</strong> This code can only be used once. After using it, you'll receive a new unique code for future password resets.
            </p>
            <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin-top: 20px; border-radius: 4px;">
              <p style="color: #856404; margin: 0; font-size: 14px;">
                <strong>⚠️ Important:</strong> Keep this code secure and don't share it with anyone.
              </p>
            </div>
          </div>
        </div>
      `
    };

    console.log('📤 Sending backup code to:', process.env.ADMIN_EMAIL);
    console.log('🔑 Code being sent:', backupCode);
    await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully');

    lastEmailSentTime = Date.now(); // Update last sent time (keep for in-memory throttle if needed)

    // Update last sent timestamp
    if (!admin.emailRateLimit) admin.emailRateLimit = {};
    admin.emailRateLimit.lastSent = now;
    await admin.save();

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Email send error:', error);
    res.status(500).json({ error: 'Failed to send email' });
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
    const event = await Event.findOne({ id: req.params.id });
    if (event) {
      // Delete associated images from Cloudinary
      const imageDeletionPromises = [];

      for (const tx of event.transactions) {
        if (tx.image && tx.image.includes('cloudinary.com')) {
          try {
            let publicId = null;

            // Strategy 1: Standard Regex for Cloudinary URLs
            // Matches everything after /upload/ (and optional version v123...) up to the last dot
            const regex = /\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/;
            const match = tx.image.match(regex);

            if (match && match[1]) {
              publicId = match[1];
            }

            // Strategy 2: Fallback for 'hms' folder if regex failed or gave unexpected result
            if (!publicId && tx.image.includes('/hms/')) {
              const parts = tx.image.split('/hms/');
              if (parts.length > 1) {
                const afterHms = parts[1]; // filename.jpg
                const filename = afterHms.split('.')[0]; // filename
                publicId = 'hms/' + filename;
              }
            }

            if (publicId) {
              console.log(`🔍 Extracted Public ID: "${publicId}" from URL: "${tx.image}"`);

              imageDeletionPromises.push(
                cloudinary.uploader.destroy(publicId).then(result => {
                  console.log(`Cloudinary destroy result for ${publicId}:`, result);
                  return result;
                })
              );
            } else {
              console.warn(`⚠️ Could not extract Public ID from URL: ${tx.image}`);
            }
          } catch (err) {
            console.error('❌ Failed to parse/delete image:', tx.image, err);
          }
        }
      }

      if (imageDeletionPromises.length > 0) {
        await Promise.all(imageDeletionPromises);
        console.log(`✅ Deleted ${imageDeletionPromises.length} images from Cloudinary`);
      }

      await Event.findOneAndDelete({ id: req.params.id });
    }
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

    const transactionToDelete = event.transactions.find(t => t.id === req.params.txId);

    if (transactionToDelete && transactionToDelete.image && transactionToDelete.image.includes('cloudinary.com')) {
      try {
        let publicId = null;
        const regex = /\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/;
        const match = transactionToDelete.image.match(regex);

        if (match && match[1]) {
          publicId = match[1];
        }

        if (!publicId && transactionToDelete.image.includes('/hms/')) {
          const parts = transactionToDelete.image.split('/hms/');
          if (parts.length > 1) {
            const afterHms = parts[1];
            const filename = afterHms.split('.')[0];
            publicId = 'hms/' + filename;
          }
        }

        if (publicId) {
          console.log(`🔍 Extracted Public ID: "${publicId}" from URL: "${transactionToDelete.image}"`);
          const result = await cloudinary.uploader.destroy(publicId);
          console.log(`Cloudinary destroy result for ${publicId}:`, result);
        } else {
          console.warn(`⚠️ Could not extract Public ID from URL: ${transactionToDelete.image}`);
        }
      } catch (err) {
        console.error('❌ Failed to delete transaction image:', err);
      }
    }

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
    let requestData = req.body;

    // For update_transaction requests, fetch the original transaction for comparison
    if (requestData.type === 'update_transaction' && requestData.data && requestData.data.eventId && requestData.data.transaction) {
      const event = await Event.findOne({ id: requestData.data.eventId });
      if (event) {
        const originalTransaction = event.transactions.find(t => t.id === requestData.data.transaction.id);
        if (originalTransaction) {
          // Store both original and updated transaction data
          requestData.data.originalTransaction = originalTransaction.toObject();
        }
      }
    }

    const request = await Request.create(requestData);
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