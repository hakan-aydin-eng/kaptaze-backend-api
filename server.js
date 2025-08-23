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
        'https://kaptaze.netlify.app'
    ],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate Limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: 15 * 60 * 1000
    },
    standardHeaders: true,
    legacyHeaders: false
});
app.use(limiter);

// Body Parser Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging Middleware
app.use(logger);

// Health Check Endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'KapTaze API is running',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV
    });
});

// API Routes
app.use('/auth', authRoutes);
app.use('/public', publicRoutes);
app.use('/admin', adminRoutes);
app.use('/restaurant', restaurantRoutes);

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
            restaurant: '/restaurant/*'
        }
    });
});

// 404 Handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        message: `The requested route ${req.originalUrl} does not exist`,
        availableRoutes: ['/health', '/auth', '/public', '/admin', '/restaurant']
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