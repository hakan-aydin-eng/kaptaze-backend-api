/**
 * KapTaze Backend API Server
 * Professional Restaurant Management System
 * Updated: 2025-09-17
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
const socketIO = require('socket.io');

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
const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

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
        'http://localhost:8080',
        'http://127.0.0.1:5500'
    ],
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'X-Requested-With',
        'Accept',
        'Origin',
        'Access-Control-Allow-Origin',
        'Access-Control-Allow-Headers',
        'Access-Control-Allow-Methods'
    ]
};

console.log('🌐 CORS Origins configured:', corsOptions.origin);

app.use(cors(corsOptions));

// Additional CORS middleware for problematic requests
app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = corsOptions.origin;
    
    if (allowedOrigins.includes(origin) || allowedOrigins === '*') {
        res.header('Access-Control-Allow-Origin', origin);
    }
    
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Access-Control-Allow-Origin, Access-Control-Allow-Headers, Access-Control-Allow-Methods');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    next();
});

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
    type: ['application/json', 'text/plain'],
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

// Additional middleware to handle iOS text/plain requests
app.use((req, res, next) => {
    const contentType = req.headers['content-type'];
    if (contentType && contentType.includes('text/plain') && req.rawBody) {
        try {
            // Try to parse the raw body as JSON for iOS requests
            const parsedBody = JSON.parse(req.rawBody);
            req.body = parsedBody;
            console.log('🍎 iOS text/plain body parsed successfully:', {
                contentType,
                parsedKeys: Object.keys(parsedBody)
            });
        } catch (error) {
            console.log('⚠️ Could not parse text/plain body as JSON:', {
                contentType,
                rawBody: req.rawBody,
                error: error.message
            });
        }
    }
    next();
});

// UTF-8 Encoding for Turkish Characters
app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
});

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Logging Middleware
app.use(logger);

// Socket.IO Connection Management
const restaurantSockets = new Map();

io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    socket.on('restaurant-connect', (restaurantId) => {
        restaurantSockets.set(restaurantId, socket.id);
        socket.join(`restaurant-${restaurantId}`);
        console.log(`🏪 Restaurant ${restaurantId} connected with socket ${socket.id}`);
        console.log(`📊 Total restaurant connections: ${restaurantSockets.size}`);
    });

    socket.on('disconnect', () => {
        console.log(`❌ Client disconnected: ${socket.id}`);
        for (const [restaurantId, socketId] of restaurantSockets.entries()) {
            if (socketId === socket.id) {
                restaurantSockets.delete(restaurantId);
                console.log(`🏪 Restaurant ${restaurantId} disconnected`);
                console.log(`📊 Total restaurant connections: ${restaurantSockets.size}`);
                break;
            }
        }
    });
});

// Make io available to routes
app.set('io', io);
app.set('restaurantSockets', restaurantSockets);

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
        
        // Clean up problematic indexes
        const Order = require('./models/Order');
        await Order.cleanupIndexes();
        
        // Initialize Push Notification Service
        const pushNotificationService = require('./services/pushNotificationService');
        console.log('🔔 Push Notification Service initialized');

        // Start the server with Socket.IO
        server.listen(PORT, () => {
            console.log('\n🚀 KapTaze API Server Started!');
            console.log(`📍 Server running on port ${PORT}`);
            console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
            console.log(`🔗 Health check: http://localhost:${PORT}/health`);
            console.log(`📚 API docs: http://localhost:${PORT}/`);
            console.log(`🔌 Socket.IO: Enabled`);
            console.log('🔔 Push Notifications: Ready');
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