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
const http = require('http');
const { Server } = require('socket.io');

// Import routes
const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const restaurantRoutes = require('./routes/restaurant');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payment');
const restaurantDebugRoutes = require('./routes/restaurant-debug');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const logger = require('./middleware/logger');

const app = express();
const server = http.createServer(app);

// Socket.IO Configuration
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('🔌 New Socket.IO client connected:', socket.id);

    socket.on('join-restaurant', (restaurantId) => {
        socket.join(`restaurant-${restaurantId}`);
        console.log(`🏪 Socket ${socket.id} joined restaurant-${restaurantId}`);
    });

    socket.on('join-consumer', (consumerId) => {
        socket.join(`consumer-${consumerId}`);
        console.log(`👤 Socket ${socket.id} joined consumer-${consumerId}`);
    });

    socket.on('disconnect', () => {
        console.log('❌ Socket.IO client disconnected:', socket.id);
    });
});

// Make io accessible to routes
app.set('io', io);

// Security Middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false
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

if (process.env.NODE_ENV !== 'production') {
    corsOptions.origin = '*';
    corsOptions.credentials = false;
}

app.use(cors(corsOptions));

// Health Check Endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        socketIO: 'enabled'
    });
});

// Rate Limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000,
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: 15 * 60 * 1000
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health'
});

// Body Parser Middleware
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

// UTF-8 Encoding
app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
});

// Static files
app.use('/uploads', express.static('uploads'));

// Logging
app.use(logger);

// API Routes
app.use('/auth', authRoutes);
app.use('/public', publicRoutes);
app.use('/admin', adminRoutes);
app.use('/restaurant', restaurantRoutes);
app.use('/orders', orderRoutes);
app.use('/payment', paymentRoutes);
app.use('/debug', restaurantDebugRoutes);

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
        },
        features: {
            socketIO: 'enabled',
            realTimeOrders: true
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

// Error Handler
app.use(errorHandler);

// Database setup
const { connectDB } = require('./utils/db-setup');

// Start Server
const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        await connectDB();
        
        const seedData = require('./utils/seedData');
        await seedData();
        
        server.listen(PORT, () => {
            console.log('\n🚀 KapTaze API Server Started!');
            console.log(`📍 Server running on port ${PORT}`);
            console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
            console.log(`🔗 Health check: http://localhost:${PORT}/health`);
            console.log(`📚 API docs: http://localhost:${PORT}/`);
            console.log(`🔌 Socket.IO enabled for real-time updates`);
            console.log('════════════════════════════════════════\n');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('👋 SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('👋 SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

startServer();

module.exports = app;

// Admin fix routes (emergency)
const adminFixRoutes = require('./routes/admin-fix');
app.use('/admin-fix', adminFixRoutes);
