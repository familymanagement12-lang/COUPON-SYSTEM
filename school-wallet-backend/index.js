const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { requestContext } = require('./src/utils/requestContext');
require('dotenv').config({ path: ['.env.local', '.env'] });

const isProduction = process.env.NODE_ENV === 'production';
const frontendOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

if (isProduction) {
  const missing = [];
  if (!process.env.FRONTEND_URL) missing.push('FRONTEND_URL');
  if (!process.env.DATABASE_URL && !(
    process.env.DB_HOST &&
    process.env.DB_NAME &&
    process.env.DB_USER &&
    process.env.DB_PASSWORD
  )) {
    missing.push('DATABASE_URL (or DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD)');
  }
  if (frontendOrigins.some(origin => {
    try {
      return new URL(origin).protocol !== 'https:';
    } catch {
      return true;
    }
  })) {
    throw new Error('FRONTEND_URL must contain valid HTTPS origins in production');
  }
  if (missing.length) {
    throw new Error(`Missing production environment variables: ${missing.join(', ')}`);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;
const db = require('./src/config/database');
const {
  createMigrationPool,
  runMigrations,
  sanitizeErrorMessage
} = require('./src/config/migrations');

app.set('db', db);

// Middleware
app.use(requestContext);
app.use(helmet()); // Security headers
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || frontendOrigins.includes(origin)),
  exposedHeaders: ['X-Request-Id']
}));
morgan.token('request-id', (req) => req.requestId);
morgan.token('path', (req) => req.path);
app.use(morgan(':request-id :method :path :status :response-time ms'));
app.use(express.json({
  verify: (req, res, buffer) => {
    req.rawBody = buffer.toString();
  }
})); // Parse JSON bodies and retain webhook bytes for signature validation
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Health Check Route
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.status(200).json({
      status: 'success',
      message: 'McCarthy Hill School Coupon System Backend is running',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check database query failed:', error);
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

// Welcome Route
app.get('/api', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'McCarthy Hill School Coupon System - Backend API',
    version: '1.0.0',
    documentation: 'See README.md for API documentation',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      students: '/api/students',
      wallets: '/api/wallets',
      transactions: '/api/transactions',
      vendors: '/api/vendors',
      reports: '/api/reports'
    }
  });
});

// Route imports
const authRoutes = require('./src/routes/auth');
const walletRoutes = require('./src/routes/wallets');
const topupRoutes = require('./src/routes/topups');
const purchaseRoutes = require('./src/routes/purchases');
const transactionRoutes = require('./src/routes/transactions');
const vendorRoutes = require('./src/routes/vendors');
const parentRoutes = require('./src/routes/parents');
const studentRoutes = require('./src/routes/students');
const spendingRoutes = require('./src/routes/spending');
const reportRoutes = require('./src/routes/reporting');

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/topups', topupRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/parents', parentRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/spending', spendingRoutes);
app.use('/api/reports', reportRoutes);

// 404 Error Handler
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Route not found'
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || 500;
  res.status(status).json({
    status: 'error',
    message: status >= 500 && isProduction ? 'Internal Server Error' : (err.message || 'Internal Server Error')
  });
});

async function startServer({
  serverApp = app,
  port = PORT,
  migrationPool = createMigrationPool(),
  migrationRunner = runMigrations,
  logger = console
} = {}) {
  let startupError;
  try {
    await migrationRunner(migrationPool);
  } catch (error) {
    startupError = error;
  }

  try {
    await migrationPool.end();
  } catch (error) {
    if (!startupError) {
      startupError = error;
    } else {
      logger.error(`[startup] migration pool shutdown failed: ${sanitizeErrorMessage(error)}`);
    }
  }

  if (startupError) {
    logger.error('[startup] migrations failed; HTTP server will not start.');
    throw startupError;
  }

  const server = serverApp.listen(port, () => {
    console.log(`🚀 McCarthy Hill School Coupon System Backend running on port ${port}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV}`);
    console.log(`🔗 API: http://localhost:${port}/api`);
    console.log(`🔗 Health check: http://localhost:${port}/api/health`);
    console.log(`📚 Auth endpoints: http://localhost:${port}/api/auth`);
  });
  return server;
}

app.startServer = startServer;
module.exports = app;

if (require.main === module) {
  startServer().catch(error => {
    console.error(`[startup] backend startup aborted: ${sanitizeErrorMessage(error)}`);
    process.exitCode = 1;
  });
}
