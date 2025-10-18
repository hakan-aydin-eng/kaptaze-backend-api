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

const router = express.Router();

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
                error: 'A user with this email already exists'
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
        const emailService = require('../services/emailService');
        emailService.sendConsumerWelcomeEmail(consumer).catch(err => {
            console.error('❌ Failed to send welcome email:', err.message);
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
// @desc    Save or update consumer push notification token
// @access  Public (changed to allow push notifications without login)
router.post('/push-token', async (req, res, next) => {
    try {
        const { userId, consumerEmail, token, platform, deviceInfo, deviceId } = req.body;
        const DeviceToken = require('../models/DeviceToken');

        console.log('📱 Push token request:', {
            userId,
            consumerEmail,
            platform,
            token: token ? token.substring(0, 20) + '...' : 'none',
            tokenType: typeof token
        });

        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Push token is required'
            });
        }

        // Accept both string tokens and Expo push tokens
        const tokenString = typeof token === 'string' ? token : String(token);

        let consumer = null;
        let consumerId = null;

        // Try to find consumer if userId or email provided
        if (userId || consumerEmail) {
            // Try to find by userId first (handle both string ID and email as userId)
            if (userId) {
                const mongoose = require('mongoose');
                if (mongoose.Types.ObjectId.isValid(userId)) {
                    consumer = await Consumer.findById(userId);
                    if (consumer) consumerId = consumer._id;
                } else {
                    // userId might be an email, try to find by email
                    consumer = await Consumer.findOne({ email: userId.toLowerCase() });
                    if (consumer) consumerId = consumer._id;
                }
            }

            // If not found by userId, try consumerEmail
            if (!consumer && consumerEmail) {
                consumer = await Consumer.findOne({ email: consumerEmail.toLowerCase() });
                if (consumer) consumerId = consumer._id;
            }
        }

        // Save or update device token (works with or without user)
        let deviceToken = await DeviceToken.findOne({ token: tokenString });

        if (deviceToken) {
            // Update existing token
            deviceToken.consumerId = consumerId; // May be null if no user
            deviceToken.platform = platform || deviceToken.platform || 'expo';
            deviceToken.deviceInfo = deviceInfo || deviceToken.deviceInfo;
            deviceToken.deviceId = deviceId || deviceToken.deviceId;
            deviceToken.lastUpdated = new Date();
            deviceToken.isActive = true;
        } else {
            // Create new device token
            deviceToken = new DeviceToken({
                token: tokenString,
                consumerId: consumerId, // May be null if no user
                deviceId: deviceId,
                platform: platform || 'expo',
                deviceInfo: deviceInfo || {},
                isActive: true
            });
        }

        await deviceToken.save();

        // If consumer found, also update their pushToken field
        if (consumer) {
            consumer.pushToken = {
                token: tokenString,
                platform: platform || 'expo',
                deviceInfo: deviceInfo || {},
                lastUpdated: new Date()
            };
            await consumer.save();
            console.log(`✅ Push token saved for user: ${consumer.email}`);
        } else {
            console.log(`✅ Push token saved for anonymous device`);
        }

        res.json({
            success: true,
            message: consumer ? 'Push token saved for user' : 'Push token saved for device',
            data: {
                deviceTokenId: deviceToken._id,
                consumerId: consumerId,
                platform: deviceToken.platform
            }
        });

    } catch (error) {
        console.error('❌ Push token error:', error);
        next(error);
    }
});

// Haversine formula - calculate distance between two coordinates in km
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// @route   GET /auth/surprise-stories
// @desc    Get surprise stories within 50km radius (Unified Format)
// @access  Public (changed from Private for mobile app)
router.get('/surprise-stories', async (req, res, next) => {
    try {
        const { city, limit = 10, lat, lng, radius = 50 } = req.query;
        const Order = require('../models/Order');
        const Restaurant = require('../models/Restaurant');

        console.log(`📸 Fetching surprise stories - City: ${city || 'any'}, Radius: ${radius}km, Coords: ${lat},${lng}`);

        // Build query for rated orders with APPROVED photos only
        const query = {
            'review.isRated': true,
            'review.photos.0': { $exists: true },  // At least one photo
            'review.photos': {
                $elemMatch: { isApproved: true }  // Only approved photos
            }
        };

        // Filter by restaurant city if provided
        if (city) {
            query['restaurant.address.city'] = city;
        }

        // Fetch orders with ratings and photos (get more if we need to filter by distance)
        const fetchLimit = lat && lng ? parseInt(limit) * 5 : parseInt(limit);
        let ratedOrders = await Order.find(query)
            .sort({ 'review.reviewedAt': -1 })  // Newest reviews first
            .limit(fetchLimit)
            .lean();

        console.log(`✅ Found ${ratedOrders.length} rated orders from DB`);

        // If user coordinates provided, filter by distance
        if (lat && lng) {
            const userLat = parseFloat(lat);
            const userLng = parseFloat(lng);
            const maxRadius = parseFloat(radius);

            // Get restaurant coordinates and calculate distances
            const storiesWithDistance = await Promise.all(ratedOrders.map(async (order) => {
                try {
                    const restaurant = await Restaurant.findById(order.restaurant.id);
                    if (restaurant && restaurant.location && restaurant.location.coordinates) {
                        const [restLng, restLat] = restaurant.location.coordinates;
                        const distance = calculateDistance(userLat, userLng, restLat, restLng);

                        if (distance <= maxRadius) {
                            return { order, distance };
                        }
                    }
                } catch (err) {
                    console.warn('⚠️ Failed to calculate distance for order:', order._id);
                }
                return null;
            }));

            // Filter out nulls and sort by distance
            ratedOrders = storiesWithDistance
                .filter(item => item !== null)
                .sort((a, b) => a.distance - b.distance)
                .slice(0, parseInt(limit))
                .map(item => item.order);

            console.log(`✅ Filtered to ${ratedOrders.length} stories within ${maxRadius}km`);
        }

        // Transform to stories format (only approved photos)
        const stories = ratedOrders.map(order => {
            // Get first approved photo
            const approvedPhotos = order.review.photos.filter(p => p.isApproved);
            const firstPhoto = approvedPhotos[0];
            const firstItem = order.items && order.items[0];

            return {
                id: order._id.toString(),
                orderId: order.orderId || order._id.toString(),
                customerName: order.customer?.name || 'Kullanıcı',  // Show real customer name
                restaurantName: order.restaurant?.name || 'Restaurant',
                restaurantCity: order.restaurant?.address?.city || 'Antalya',
                title: firstItem?.packageName || firstItem?.name || 'Sürpriz Paket',
                description: order.review?.comment || 'Lezzetli sürpriz paket!',
                image: firstPhoto?.url || 'https://picsum.photos/400/300',
                rating: order.review?.rating || 5,
                reviewedAt: order.review?.reviewedAt,
                photoCount: approvedPhotos.length  // Count only approved photos
            };
        });

        res.json({
            success: true,
            stories: stories,
            count: stories.length,
            radius: lat && lng ? `${radius}km` : 'unlimited'
        });
    } catch (error) {
        console.error('❌ Surprise stories error:', error);
        next(error);
    }
});

// @route   POST /auth/refresh-token
// @desc    Refresh JWT token
// @access  Public (needs to work with expired tokens)
router.post('/refresh-token', async (req, res, next) => {
    try {
        const { userId, oldToken } = req.body;
        console.log('🔄 [DEBUG] Token refresh request for user:', userId);
        console.log('🔑 [DEBUG] Old token provided:', !!oldToken);

        if (!userId || !oldToken) {
            return res.status(400).json({
                success: false,
                error: 'userId and oldToken are required'
            });
        }

        // Verify old token (allow expired tokens for refresh)
        let decoded;
        try {
            decoded = jwt.verify(oldToken, process.env.JWT_SECRET || 'fallback-jwt-secret', {
                ignoreExpiration: true // Allow expired tokens for refresh
            });
            console.log('✅ [DEBUG] Old token decoded successfully:', decoded.id);
        } catch (error) {
            console.error('❌ [DEBUG] Token decode failed:', error.message);
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }

        // Verify userId matches token
        if (decoded.id !== userId) {
            console.error('❌ [DEBUG] UserId mismatch:', { tokenId: decoded.id, requestedId: userId });
            return res.status(401).json({
                success: false,
                error: 'Token userId mismatch'
            });
        }

        const consumer = await Consumer.findById(userId);
        if (!consumer) {
            console.error('❌ [DEBUG] User not found:', userId);
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        console.log('👤 [DEBUG] Consumer found:', consumer.email);

        // Generate new token
        const token = jwt.sign(
            {
                id: consumer._id,
                email: consumer.email,
                type: 'consumer'
            },
            process.env.JWT_SECRET || 'fallback-jwt-secret',
            { expiresIn: '30d' }
        );

        console.log('✅ [DEBUG] New token generated successfully');

        res.json({
            success: true,
            data: {
                token,
                user: {
                    id: consumer._id,
                    name: consumer.name,
                    email: consumer.email,
                    phone: consumer.phone
                }
            }
        });
    } catch (error) {
        console.error('❌ Token refresh error:', error);
        next(error);
    }
});


// ==========================================
// FAVORITES ENDPOINTS - Add before module.exports
// ==========================================

// @route   POST /auth/favorites/:restaurantId
// @desc    Add restaurant to favorites
// @access  Private (Consumer only)
router.post('/favorites/:restaurantId', authenticate, async (req, res, next) => {
    try {
        const { restaurantId } = req.params;
        const consumerId = req.user.id;

        // Check if consumer exists
        const consumer = await Consumer.findById(consumerId);
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
                error: 'Restaurant is already in favorites'
            });
        }

        // Add to favorites
        consumer.favoriteRestaurants.push(restaurantId);
        await consumer.save();

        console.log(`❤️ Consumer ${consumer.email} added restaurant ${restaurant.name} to favorites`);

        res.json({
            success: true,
            message: 'Restaurant added to favorites',
            data: {
                favoriteRestaurants: consumer.favoriteRestaurants
            }
        });

    } catch (error) {
        console.error('Add to favorites error:', error);
        next(error);
    }
});

// @route   DELETE /auth/favorites/:restaurantId
// @desc    Remove restaurant from favorites
// @access  Private (Consumer only)
router.delete('/favorites/:restaurantId', authenticate, async (req, res, next) => {
    try {
        const { restaurantId } = req.params;
        const consumerId = req.user.id;

        // Check if consumer exists
        const consumer = await Consumer.findById(consumerId);
        if (!consumer) {
            return res.status(404).json({
                success: false,
                error: 'Consumer not found'
            });
        }

        // Remove from favorites
        consumer.favoriteRestaurants = consumer.favoriteRestaurants.filter(
            id => id.toString() !== restaurantId
        );
        await consumer.save();

        console.log(`💔 Consumer ${consumer.email} removed restaurant from favorites`);

        res.json({
            success: true,
            message: 'Restaurant removed from favorites',
            data: {
                favoriteRestaurants: consumer.favoriteRestaurants
            }
        });

    } catch (error) {
        console.error('Remove from favorites error:', error);
        next(error);
    }
});

// @route   GET /auth/favorites
// @desc    Get consumer's favorite restaurants
// @access  Private (Consumer only)
router.get('/favorites', authenticate, async (req, res, next) => {
    try {
        const consumerId = req.user.id;

        // Get consumer with populated favorites
        const consumer = await Consumer.findById(consumerId)
            .populate({
                path: 'favoriteRestaurants',
                select: 'name description category address location rating stats serviceOptions deliveryInfo images imageUrl profileImage packages',
                match: { status: 'active' } // Only return active restaurants
            });

        if (!consumer) {
            return res.status(404).json({
                success: false,
                error: 'Consumer not found'
            });
        }

        res.json({
            success: true,
            data: {
                favorites: consumer.favoriteRestaurants,
                count: consumer.favoriteRestaurants.length
            }
        });

    } catch (error) {
        console.error('Get favorites error:', error);
        next(error);
    }
});

// @route   POST /auth/forgot-password
// @desc    Send password reset email to consumer
// @access  Public
router.post('/forgot-password', [
    body('email')
        .isEmail()
        .withMessage('Please enter a valid email address')
        .normalizeEmail()
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

        const { email } = req.body;

        // Find consumer by email
        const consumer = await Consumer.findOne({ email: email.toLowerCase() });

        if (!consumer) {
            // Don't reveal if email exists or not (security best practice)
            return res.status(200).json({
                success: true,
                message: 'Eğer bu e-posta kayıtlıysa, şifre sıfırlama bağlantısı gönderilecektir.'
            });
        }

        // Generate reset token (valid for 1 hour)
        const resetToken = jwt.sign(
            {
                id: consumer._id,
                email: consumer.email,
                type: 'password-reset'
            },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Send password reset email
        const emailService = require('../services/emailService');
        await emailService.sendPasswordResetEmail(consumer, resetToken);

        console.log(`🔒 Password reset email sent to: ${consumer.email}`);

        res.status(200).json({
            success: true,
            message: 'Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.'
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        next(error);
    }
});

// @route   POST /auth/reset-password
// @desc    Reset consumer password with token
// @access  Public
router.post('/reset-password', [
    body('token')
        .notEmpty()
        .withMessage('Reset token is required'),
    body('newPassword')
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

        const { token, newPassword } = req.body;

        // Verify reset token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(400).json({
                success: false,
                error: 'Geçersiz veya süresi dolmuş sıfırlama bağlantısı'
            });
        }

        // Check token type
        if (decoded.type !== 'password-reset') {
            return res.status(400).json({
                success: false,
                error: 'Geçersiz token türü'
            });
        }

        // Find consumer
        const consumer = await Consumer.findById(decoded.id);

        if (!consumer) {
            return res.status(404).json({
                success: false,
                error: 'Kullanıcı bulunamadı'
            });
        }

        // Update password (will be hashed by pre-save hook)
        consumer.password = newPassword;
        await consumer.save();

        console.log(`✅ Password reset successful for: ${consumer.email}`);

        res.status(200).json({
            success: true,
            message: 'Şifreniz başarıyla sıfırlandı. Şimdi giriş yapabilirsiniz.'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        next(error);
    }
});


module.exports = router;
