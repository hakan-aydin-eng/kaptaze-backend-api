/**
 * KapTaze Backend API Server
 * Professional Restaurant Management System
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import routes
const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const restaurantRoutes = require('./routes/restaurant');
const orderRoutes = require('./routes/orders');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const logger = require('./middleware/logger');

const app = express();

// Security Middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false // Allow for API usage
}));

// CORS Configuration
const corsOptions = {
    origin: process.env.FRONTEND_URLS?.split(',') || [
        'http://localhost:3000',
        'https://kaptaze.com',
        'https://www.kaptaze.com',
        'https://kapkazan.com',
        'https://www.kapkazan.com'
    ],
    credentials: true,
    optionsSuccessStatus: 200
};

// Temporary: Allow all origins for development - REMOVE IN PRODUCTION
if (process.env.NODE_ENV !== 'production') {
    corsOptions.origin = '*';
    corsOptions.credentials = false;
}

app.use(cors(corsOptions));

// Health Check Endpoint (before rate limiting)
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    });
});

// Rate Limiting (TEMPORARILY DISABLED FOR DEVELOPMENT)
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // Increased from 100 to 1000 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: 15 * 60 * 1000
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip rate limiting for health check
    skip: (req) => req.path === '/health'
});
// app.use(limiter);  // TEMPORARILY DISABLED FOR TESTING

// Body Parser Middleware with UTF-8 support
app.use(express.json({ 
    limit: '10mb',
    type: 'application/json',
    verify: (req, res, buf) => {
        req.rawBody = buf.toString('utf8');
    }
}));
app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb',
    parameterLimit: 1000,
    type: 'application/x-www-form-urlencoded'
}));

// UTF-8 Encoding for Turkish Characters
app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
});

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Logging Middleware
app.use(logger);

// API Routes
app.use('/auth', authRoutes);
app.use('/public', publicRoutes);
app.use('/admin', adminRoutes);
app.use('/restaurant', restaurantRoutes);
app.use('/orders', orderRoutes);

// Welcome Route
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to KapTaze API',
        version: '1.0.0',
        documentation: 'https://api.kaptaze.com/docs',
        endpoints: {
            health: '/health',
            auth: '/auth/*',
            public: '/public/*',
            admin: '/admin/*',
            restaurant: '/restaurant/*',
            orders: '/orders/*'
        }
    });
});

// 404 Handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        message: `The requested route ${req.originalUrl} does not exist`,
        availableRoutes: ['/health', '/auth', '/public', '/admin', '/restaurant', '/orders']
    });
});

// Error Handler Middleware
app.use(errorHandler);

// Import database setup
const { connectDB } = require('./utils/db-setup');

// Start Server
const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        // Connect to database
        await connectDB();
        
        // Seed initial data
        const seedData = require('./utils/seedData');
        await seedData();
        
        // Start the server
        app.listen(PORT, () => {
            console.log('\n🚀 KapTaze API Server Started!');
            console.log(`📍 Server running on port ${PORT}`);
            console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
            console.log(`🔗 Health check: http://localhost:${PORT}/health`);
            console.log(`📚 API docs: http://localhost:${PORT}/`);
            console.log('════════════════════════════════════════\n');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('👋 SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('👋 SIGINT received, shutting down gracefully');
    process.exit(0);
});

// Start the application
startServer();

module.exports = app;