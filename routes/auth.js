/**
 * Authentication Routes
 * /auth/*
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Consumer = require('../models/Consumer');
const { authenticate } = require('../middleware/auth');
const { sendWelcomeEmail } = require('../services/emailService');

const router = express.Router();

// Debug middleware for all auth routes
router.use((req, res, next) => {
    if ((req.path === '/push-token-v2' || req.path === '/push-token') && req.method === 'POST') {
        console.log('🚨 PUSH TOKEN REQUEST INTERCEPTED:', {
            method: req.method,
            path: req.path,
            fullUrl: req.originalUrl,
            contentType: req.headers['content-type'],
            body: req.body,
            bodyKeys: Object.keys(req.body || {}),
            rawBody: req.rawBody || 'No raw body',
            bodyLength: req.headers['content-length'],
            timestamp: new Date().toISOString()
        });

        // Check if body is empty and try to parse rawBody if available
        if ((!req.body || Object.keys(req.body).length === 0) && req.rawBody) {
            try {
                console.log('🔧 Attempting to parse rawBody:', req.rawBody);
                req.body = JSON.parse(req.rawBody);
                console.log('✅ Successfully parsed rawBody:', req.body);
            } catch (error) {
                console.log('❌ Failed to parse rawBody:', error.message);
            }
        }
    }
    next();
});

// Generate JWT Token
const generateToken = (user, userType = 'user') => {
    const payload = { 
        id: user._id, 
        userType: userType // 'user' for admin/restaurant, 'consumer' for mobile app users
    };
    
    // Add role for system users, email for consumers
    if (userType === 'user') {
        payload.role = user.role;
        payload.username = user.username;
    } else {
        payload.email = user.email;
    }
    
    return jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
};

// @route   POST /auth/admin/login
// @desc    Admin login
// @access  Public
router.post('/admin/login', [
    body('username')
        .notEmpty()
        .withMessage('Username is required')
        .isLength({ min: 3 })
        .withMessage('Username must be at least 3 characters'),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters')
], async (req, res, next) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { username, password } = req.body;

        // Find user and verify credentials
        const user = await User.findByCredentials(username, password);
        
        if (user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Admin access required'
            });
        }

        // Generate token
        const token = generateToken(user);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                user: {
                    id: user._id,
                    username: user.username,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    role: user.role,
                    lastLogin: user.lastLogin
                }
            }
        });

    } catch (error) {
        console.error('Admin login error:', error);
        
        if (error.message === 'Invalid credentials') {
            return res.status(401).json({
                success: false,
                error: 'Invalid username or password'
            });
        }
        
        if (error.message.includes('Account locked')) {
            return res.status(423).json({
                success: false,
                error: 'Account locked due to too many failed login attempts. Please try again later.'
            });
        }

        next(error);
    }
});

// @route   POST /auth/restaurant/login
// @desc    Restaurant login
// @access  Public
router.post('/restaurant/login', [
    body('username')
        .notEmpty()
        .withMessage('Username is required')
        .isLength({ min: 3 })
        .withMessage('Username must be at least 3 characters'),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters')
], async (req, res, next) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { username, password } = req.body;

        // Find user and verify credentials
        const user = await User.findByCredentials(username, password);
        
        if (user.role !== 'restaurant') {
            return res.status(403).json({
                success: false,
                error: 'Restaurant access required'
            });
        }

        // Check if restaurant account is active
        if (user.status !== 'active') {
            return res.status(403).json({
                success: false,
                error: 'Restaurant account is not active. Please contact admin.'
            });
        }

        // Generate token
        const token = generateToken(user);

        // Get restaurant information
        const Restaurant = require('../models/Restaurant');
        const restaurant = await Restaurant.findOne({ ownerId: user._id });

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                user: {
                    id: user._id,
                    username: user.username,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    role: user.role,
                    lastLogin: user.lastLogin,
                    restaurantId: user.restaurantId
                },
                restaurant: restaurant ? {
                    id: restaurant._id,
                    name: restaurant.name,
                    status: restaurant.status,
                    category: restaurant.category
                } : null
            }
        });

    } catch (error) {
        console.error('Restaurant login error:', error);
        
        if (error.message === 'Invalid credentials') {
            return res.status(401).json({
                success: false,
                error: 'Invalid username or password'
            });
        }
        
        if (error.message.includes('Account locked')) {
            return res.status(423).json({
                success: false,
                error: 'Account locked due to too many failed login attempts. Please try again later.'
            });
        }

        next(error);
    }
});

// @route   POST /auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post('/logout', authenticate, (req, res) => {
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

// @route   GET /auth/me
// @desc    Get current user info
// @access  Private
router.get('/me', authenticate, async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        let restaurant = null;
        if (user.role === 'restaurant') {
            const Restaurant = require('../models/Restaurant');
            restaurant = await Restaurant.findOne({ ownerId: user._id });
        }

        res.json({
            success: true,
            data: {
                user,
                restaurant
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   POST /auth/refresh
// @desc    Refresh JWT token
// @access  Private
router.post('/refresh', authenticate, (req, res) => {
    const user = req.user;
    const token = generateToken(user);

    res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: { token }
    });
});

// @route   POST /auth/register
// @desc    Mobile app consumer registration
// @access  Public
router.post('/register', [
    body('name')
        .notEmpty()
        .withMessage('Name is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('Name must be between 2 and 50 characters')
        .matches(/^[a-zA-ZğüşıöçĞÜŞIÖÇ\s]+$/)
        .withMessage('Name can only contain letters'),
    body('surname')
        .notEmpty()
        .withMessage('Surname is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('Surname must be between 2 and 50 characters')
        .matches(/^[a-zA-ZğüşıöçĞÜŞIÖÇ\s]+$/)
        .withMessage('Surname can only contain letters'),
    body('email')
        .isEmail()
        .withMessage('Please enter a valid email address')
        .normalizeEmail()
        .isLength({ max: 100 })
        .withMessage('Email cannot exceed 100 characters'),
    body('phone')
        .optional()
        .matches(/^(\+90|0)?[5][0-9]{9}$/)
        .withMessage('Please enter a valid Turkish phone number'),
    body('password')
        .isLength({ min: 6, max: 128 })
        .withMessage('Password must be between 6 and 128 characters')
], async (req, res, next) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                errors: errors.array()
            });
        }

        const { name, surname, email, phone, password } = req.body;

        // Check if consumer already exists
        const existingConsumer = await Consumer.findOne({ 
            email: email.toLowerCase() 
        });

        if (existingConsumer) {
            return res.status(409).json({
                success: false,
                error: 'Bu e-posta adresi ile zaten kayıtlı bir hesap bulunmaktadır'
            });
        }

        // Create new consumer
        const consumer = new Consumer({
            name: name.trim(),
            surname: surname.trim(),
            email: email.toLowerCase(),
            phone: phone ? phone.trim() : undefined,
            password: password,
            status: 'active',
            emailVerified: false // In production, send verification email
        });

        await consumer.save();

        // Generate token
        const token = generateToken(consumer, 'consumer');

        // Send welcome email (non-blocking)
        sendWelcomeEmail(consumer.email, consumer.name)
            .then(result => {
                if (result.success) {
                    console.log(`📧 Welcome email sent to: ${consumer.email}`);
                } else {
                    console.log(`⚠️ Welcome email failed for: ${consumer.email} - ${result.error}`);
                }
            })
            .catch(error => {
                console.log(`❌ Welcome email error for: ${consumer.email} - ${error.message}`);
            });

        // Log successful registration
        console.log(`🎉 New consumer registered: ${consumer.name} ${consumer.surname} (${consumer.email})`);

        res.status(201).json({
            success: true,
            message: 'Registration successful! Welcome to KapTaze!',
            data: {
                token,
                consumer: {
                    id: consumer._id,
                    name: consumer.name,
                    surname: consumer.surname,
                    email: consumer.email,
                    phone: consumer.phone,
                    status: consumer.status,
                    createdAt: consumer.createdAt
                }
            }
        });

    } catch (error) {
        console.error('Consumer registration error:', error);
        
        if (error.code === 11000) {
            // Duplicate key error
            return res.status(409).json({
                success: false,
                error: 'A user with this email already exists'
            });
        }
        
        if (error.name === 'ValidationError') {
            const validationErrors = Object.values(error.errors).map(err => ({
                field: err.path,
                message: err.message
            }));
            
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                errors: validationErrors
            });
        }

        next(error);
    }
});

// @route   POST /auth/login
// @desc    Mobile app consumer login
// @access  Public
router.post('/login', [
    body('email')
        .isEmail()
        .withMessage('Please enter a valid email address')
        .normalizeEmail(),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
], async (req, res, next) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                errors: errors.array()
            });
        }

        const { email, password } = req.body;

        // Find consumer and verify credentials
        const consumer = await Consumer.findByCredentials(email, password);

        // Generate token
        const token = generateToken(consumer, 'consumer');

        console.log(`✅ Consumer login: ${consumer.name} ${consumer.surname} (${consumer.email})`);

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                consumer: {
                    id: consumer._id,
                    name: consumer.name,
                    surname: consumer.surname,
                    email: consumer.email,
                    phone: consumer.phone,
                    status: consumer.status,
                    lastActivity: consumer.lastActivity,
                    orderCount: consumer.orderCount,
                    totalSpent: consumer.totalSpent
                }
            }
        });

    } catch (error) {
        console.error('Consumer login error:', error);
        
        if (error.message === 'Invalid credentials') {
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }
        
        if (error.message.includes('Account locked')) {
            return res.status(423).json({
                success: false,
                error: 'Account locked due to too many failed login attempts. Please try again later.'
            });
        }

        next(error);
    }
});

// @route   PATCH /auth/profile
// @desc    Update consumer profile
// @access  Private (Consumer)
router.patch('/profile', [
    authenticate,
    body('name')
        .notEmpty()
        .withMessage('Name is required')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Name must be between 2-50 characters'),
    body('surname')
        .notEmpty()
        .withMessage('Surname is required')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Surname must be between 2-50 characters'),
    body('email')
        .isEmail()
        .withMessage('Please enter a valid email address')
        .normalizeEmail(),
    body('phone')
        .optional({ checkFalsy: true })
        .matches(/^[0-9]{11}$/)
        .withMessage('Phone number must be 11 digits')
], async (req, res, next) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                errors: errors.array()
            });
        }

        const { name, surname, email, phone } = req.body;
        const consumerId = req.user.id;

        // Check if consumer exists and is the owner
        const consumer = await Consumer.findById(consumerId);
        if (!consumer) {
            return res.status(404).json({
                success: false,
                error: 'Consumer not found'
            });
        }

        // Check if new email is already taken by another user
        if (email !== consumer.email) {
            const existingConsumer = await Consumer.findOne({ email, _id: { $ne: consumerId } });
            if (existingConsumer) {
                return res.status(400).json({
                    success: false,
                    error: 'Email address is already in use'
                });
            }
        }

        // Update consumer profile
        consumer.name = name.trim();
        consumer.surname = surname.trim();
        consumer.email = email;
        consumer.phone = phone || null;
        
        await consumer.save();

        console.log(`✅ Consumer profile updated: ${consumer.name} ${consumer.surname} (${consumer.email})`);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                consumer: {
                    id: consumer._id,
                    name: consumer.name,
                    surname: consumer.surname,
                    email: consumer.email,
                    phone: consumer.phone,
                    status: consumer.status,
                    lastActivity: consumer.lastActivity,
                    orderCount: consumer.orderCount,
                    totalSpent: consumer.totalSpent
                }
            }
        });

    } catch (error) {
        console.error('Consumer profile update error:', error);
        next(error);
    }
});

// @route   POST /auth/push-token
// @desc    Save consumer push notification token
// @access  Private (Consumer)
router.post('/push-token', async (req, res, next) => {
    try {
        // Debug log for push token validation
        console.log('🔍 Push token request debug:', {
            fullBody: req.body,
            bodyType: typeof req.body,
            bodyKeys: Object.keys(req.body || {}),
            rawHeaders: req.headers,
            contentType: req.headers['content-type'],
            method: req.method,
            url: req.url
        });

        // Manual validation with direct property access
        const token = req.body.token;
        const platform = req.body.platform;
        const deviceInfo = req.body.deviceInfo;

        console.log('🔍 Token validation debug:', {
            token: token,
            tokenType: typeof token,
            tokenExists: !!token,
            platform: platform,
            platformType: typeof platform,
            allBodyKeys: Object.keys(req.body || {}),
            fullBodyString: JSON.stringify(req.body)
        });

        if (!token || typeof token !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Push token is required and must be a string',
                debug: {
                    token: token,
                    tokenType: typeof token,
                    tokenExists: !!token
                }
            });
        }

        if (!platform || !['ios', 'android', 'web'].includes(platform)) {
            return res.status(400).json({
                success: false,
                error: 'Platform must be ios, android, or web'
            });
        }

        // Extract consumer info from request body (since mobile app may not have auth middleware)
        let consumer;
        if (req.body.consumerEmail) {
            consumer = await Consumer.findOne({ email: req.body.consumerEmail });
            if (!consumer) {
                return res.status(404).json({
                    success: false,
                    error: 'Consumer not found'
                });
            }
        } else if (req.user && req.user.userType === 'consumer') {
            consumer = await Consumer.findById(req.user.id);
        } else {
            return res.status(401).json({
                success: false,
                error: 'Consumer authentication required'
            });
        }

        // Check if this token already exists for this consumer
        const existingTokenIndex = consumer.pushTokens.findIndex(
            t => t.token === token && t.platform === platform
        );

        if (existingTokenIndex >= 0) {
            // Update existing token
            consumer.pushTokens[existingTokenIndex].active = true;
            consumer.pushTokens[existingTokenIndex].lastUsed = new Date();
            consumer.pushTokens[existingTokenIndex].deviceInfo = deviceInfo || consumer.pushTokens[existingTokenIndex].deviceInfo;
        } else {
            // Add new token
            consumer.pushTokens.push({
                token,
                platform,
                deviceInfo: deviceInfo || {},
                active: true,
                lastUsed: new Date()
            });
        }

        // Limit to last 5 tokens per consumer (keep most recent)
        if (consumer.pushTokens.length > 5) {
            consumer.pushTokens.sort((a, b) => b.lastUsed - a.lastUsed);
            consumer.pushTokens = consumer.pushTokens.slice(0, 5);
        }

        await consumer.save();

        console.log(`🔔 Push token saved for consumer: ${consumer.name} ${consumer.surname} (${platform})`);

        res.json({
            success: true,
            message: 'Push token saved successfully',
            data: {
                tokenCount: consumer.pushTokens.filter(t => t.active).length
            }
        });

    } catch (error) {
        console.error('Push token save error:', error);
        next(error);
    }
});

// @route   POST /auth/push-token-v2 (Alternative endpoint)
// @desc    Save consumer push notification token
// @access  Private (Consumer)
router.post('/push-token-v2', async (req, res, next) => {
    try {
        // Debug log for push token validation
        console.log('🔍 Push token request debug:', {
            fullBody: req.body,
            bodyType: typeof req.body,
            bodyKeys: Object.keys(req.body || {}),
            rawHeaders: req.headers,
            contentType: req.headers['content-type'],
            method: req.method,
            url: req.url
        });

        // Manual validation with direct property access
        const token = req.body.token;
        const platform = req.body.platform;
        const deviceInfo = req.body.deviceInfo;

        console.log('🔍 Token validation debug:', {
            token: token,
            tokenType: typeof token,
            tokenExists: !!token,
            platform: platform,
            platformType: typeof platform,
            allBodyKeys: Object.keys(req.body || {}),
            fullBodyString: JSON.stringify(req.body)
        });

        if (!token || typeof token !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Push token is required and must be a string',
                debug: {
                    token: token,
                    tokenType: typeof token,
                    tokenExists: !!token
                }
            });
        }

        if (!platform || !['ios', 'android', 'web'].includes(platform)) {
            return res.status(400).json({
                success: false,
                error: 'Platform must be ios, android, or web'
            });
        }

        // Extract consumer info from request body (since mobile app may not have auth middleware)
        let consumer;
        if (req.body.consumerEmail) {
            consumer = await Consumer.findOne({ email: req.body.consumerEmail });
            if (!consumer) {
                return res.status(404).json({
                    success: false,
                    error: 'Consumer not found'
                });
            }
        } else if (req.user && req.user.userType === 'consumer') {
            consumer = await Consumer.findById(req.user.id);
        } else {
            return res.status(401).json({
                success: false,
                error: 'Consumer authentication required'
            });
        }

        // Check if this token already exists for this consumer
        const existingTokenIndex = consumer.pushTokens.findIndex(
            t => t.token === token && t.platform === platform
        );

        if (existingTokenIndex >= 0) {
            // Update existing token
            consumer.pushTokens[existingTokenIndex].active = true;
            consumer.pushTokens[existingTokenIndex].lastUsed = new Date();
            consumer.pushTokens[existingTokenIndex].deviceInfo = deviceInfo || consumer.pushTokens[existingTokenIndex].deviceInfo;
        } else {
            // Add new token
            consumer.pushTokens.push({
                token,
                platform,
                deviceInfo: deviceInfo || {},
                active: true,
                lastUsed: new Date()
            });
        }

        // Limit to last 5 tokens per consumer (keep most recent)
        if (consumer.pushTokens.length > 5) {
            consumer.pushTokens.sort((a, b) => b.lastUsed - a.lastUsed);
            consumer.pushTokens = consumer.pushTokens.slice(0, 5);
        }

        await consumer.save();

        console.log(`🔔 Push token saved for consumer: ${consumer.name} ${consumer.surname} (${platform})`);

        res.json({
            success: true,
            message: 'Push token saved successfully',
            data: {
                tokenCount: consumer.pushTokens.filter(t => t.active).length
            }
        });

    } catch (error) {
        console.error('Push token save error:', error);
        next(error);
    }
});

// Test push notification endpoint (temporary for debugging)
router.post('/test-push', async (req, res) => {
    try {
        const { consumerEmail = 'hakan-aydin@live.com' } = req.body;

        console.log('🧪 Testing push notification for:', consumerEmail);

        const pushService = require('../services/pushNotificationService');

        const testNotification = {
            title: '🎉 Firebase Test Success!',
            body: 'Push notification system is now working!',
            type: 'test',
            data: {
                action: 'test',
                timestamp: new Date().toISOString()
            }
        };

        const result = await pushService.sendToConsumer(consumerEmail, testNotification);

        res.status(200).json({
            success: true,
            message: 'Test notification sent successfully',
            result: result
        });

    } catch (error) {
        console.error('❌ Test push notification error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// @route   GET /auth/favorites
// @desc    Get consumer's favorite restaurants
// @access  Private (Consumer)
router.get('/favorites', authenticate, async (req, res, next) => {
    try {
        if (req.user.userType !== 'consumer') {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Consumer only.'
            });
        }

        const consumer = await Consumer.findById(req.user.id)
            .populate('favoriteRestaurants', 'name category address imageUrl rating packages location')
            .select('favoriteRestaurants');

        if (!consumer) {
            return res.status(404).json({
                success: false,
                error: 'Consumer not found'
            });
        }

        res.json({
            success: true,
            data: {
                favorites: consumer.favoriteRestaurants || [],
                count: consumer.favoriteRestaurants?.length || 0
            }
        });

    } catch (error) {
        console.error('Get favorites error:', error);
        next(error);
    }
});

// @route   POST /auth/favorites/:restaurantId
// @desc    Add restaurant to favorites
// @access  Private (Consumer)
router.post('/favorites/:restaurantId', authenticate, async (req, res, next) => {
    try {
        if (req.user.userType !== 'consumer') {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Consumer only.'
            });
        }

        const { restaurantId } = req.params;
        const consumer = await Consumer.findById(req.user.id);

        if (!consumer) {
            return res.status(404).json({
                success: false,
                error: 'Consumer not found'
            });
        }

        // Check if restaurant exists
        const Restaurant = require('../models/Restaurant');
        const restaurant = await Restaurant.findById(restaurantId);
        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant not found'
            });
        }

        // Check if already in favorites
        if (consumer.favoriteRestaurants.includes(restaurantId)) {
            return res.status(400).json({
                success: false,
                error: 'Restaurant already in favorites'
            });
        }

        // Add to favorites
        consumer.favoriteRestaurants.push(restaurantId);
        await consumer.save();

        console.log(`❤️ ${consumer.name} added ${restaurant.name} to favorites`);

        res.json({
            success: true,
            message: 'Restaurant added to favorites',
            data: {
                restaurantId,
                favoriteCount: consumer.favoriteRestaurants.length
            }
        });

    } catch (error) {
        console.error('Add favorite error:', error);
        next(error);
    }
});

// @route   DELETE /auth/favorites/:restaurantId
// @desc    Remove restaurant from favorites
// @access  Private (Consumer)
router.delete('/favorites/:restaurantId', authenticate, async (req, res, next) => {
    try {
        if (req.user.userType !== 'consumer') {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Consumer only.'
            });
        }

        const { restaurantId } = req.params;
        const consumer = await Consumer.findById(req.user.id);

        if (!consumer) {
            return res.status(404).json({
                success: false,
                error: 'Consumer not found'
            });
        }

        // Check if in favorites
        if (!consumer.favoriteRestaurants.includes(restaurantId)) {
            return res.status(400).json({
                success: false,
                error: 'Restaurant not in favorites'
            });
        }

        // Remove from favorites
        consumer.favoriteRestaurants = consumer.favoriteRestaurants.filter(
            id => id.toString() !== restaurantId
        );
        await consumer.save();

        console.log(`💔 ${consumer.name} removed restaurant ${restaurantId} from favorites`);

        res.json({
            success: true,
            message: 'Restaurant removed from favorites',
            data: {
                restaurantId,
                favoriteCount: consumer.favoriteRestaurants.length
            }
        });

    } catch (error) {
        console.error('Remove favorite error:', error);
        next(error);
    }
});

// ==================== IN-APP NOTIFICATIONS ====================

// @route   GET /auth/notifications
// @desc    Get consumer's in-app notifications
// @access  Private (Consumer)
router.get('/notifications', async (req, res, next) => {
    try {
        const consumer = await Consumer.findById(req.user._id);
        if (!consumer) {
            return res.status(404).json({
                success: false,
                error: 'Consumer not found'
            });
        }

        // Sort by newest first and limit to recent notifications
        const notifications = consumer.inAppNotifications
            .filter(notif => notif.expiresAt > new Date()) // Only non-expired
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 50); // Limit to 50 most recent

        const unreadCount = notifications.filter(notif => !notif.read).length;

        res.json({
            success: true,
            data: {
                notifications,
                unreadCount,
                totalCount: notifications.length
            }
        });

    } catch (error) {
        console.error('Get notifications error:', error);
        next(error);
    }
});

// @route   PATCH /auth/notifications/:notificationId/read
// @desc    Mark specific notification as read
// @access  Private (Consumer)
router.patch('/notifications/:notificationId/read', async (req, res, next) => {
    try {
        const { notificationId } = req.params;

        const consumer = await Consumer.findById(req.user._id);
        if (!consumer) {
            return res.status(404).json({
                success: false,
                error: 'Consumer not found'
            });
        }

        const notification = consumer.inAppNotifications.id(notificationId);
        if (!notification) {
            return res.status(404).json({
                success: false,
                error: 'Notification not found'
            });
        }

        notification.read = true;
        await consumer.save();

        res.json({
            success: true,
            message: 'Notification marked as read',
            data: { notificationId }
        });

    } catch (error) {
        console.error('Mark notification read error:', error);
        next(error);
    }
});

// @route   PATCH /auth/notifications/mark-all-read
// @desc    Mark all notifications as read
// @access  Private (Consumer)
router.patch('/notifications/mark-all-read', async (req, res, next) => {
    try {
        const consumer = await Consumer.findById(req.user._id);
        if (!consumer) {
            return res.status(404).json({
                success: false,
                error: 'Consumer not found'
            });
        }

        // Mark all unread notifications as read
        consumer.inAppNotifications.forEach(notification => {
            if (!notification.read) {
                notification.read = true;
            }
        });

        await consumer.save();

        const markedCount = consumer.inAppNotifications.filter(notif => notif.read).length;

        res.json({
            success: true,
            message: 'All notifications marked as read',
            data: { markedCount }
        });

    } catch (error) {
        console.error('Mark all notifications read error:', error);
        next(error);
    }
});

// @route   DELETE /auth/notifications/:notificationId
// @desc    Delete specific notification
// @access  Private (Consumer)
router.delete('/notifications/:notificationId', async (req, res, next) => {
    try {
        const { notificationId } = req.params;

        const consumer = await Consumer.findById(req.user._id);
        if (!consumer) {
            return res.status(404).json({
                success: false,
                error: 'Consumer not found'
            });
        }

        const notificationIndex = consumer.inAppNotifications.findIndex(
            notif => notif._id.toString() === notificationId
        );

        if (notificationIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Notification not found'
            });
        }

        consumer.inAppNotifications.splice(notificationIndex, 1);
        await consumer.save();

        res.json({
            success: true,
            message: 'Notification deleted',
            data: { notificationId }
        });

    } catch (error) {
        console.error('Delete notification error:', error);
        next(error);
    }
});

// @route   DELETE /auth/notifications/clear-all
// @desc    Clear all notifications
// @access  Private (Consumer)
router.delete('/notifications/clear-all', async (req, res, next) => {
    try {
        const consumer = await Consumer.findById(req.user._id);
        if (!consumer) {
            return res.status(404).json({
                success: false,
                error: 'Consumer not found'
            });
        }

        const deletedCount = consumer.inAppNotifications.length;
        consumer.inAppNotifications = [];
        await consumer.save();

        res.json({
            success: true,
            message: 'All notifications cleared',
            data: { deletedCount }
        });

    } catch (error) {
        console.error('Clear all notifications error:', error);
        next(error);
    }
});

module.exports = router;