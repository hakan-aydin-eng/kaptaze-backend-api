/**
 * Restaurant Routes
 * /restaurant/*
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const Restaurant = require('../models/Restaurant');
const User = require('../models/User');
const Package = require('../models/Package');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('../config/cloudinary');

const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// @route   POST /restaurant/login
// @desc    Restaurant login (alias for /auth/restaurant/login)
// @access  Public
router.post('/login', [
    body('username')
        .notEmpty()
        .withMessage('Username is required'),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { username, password } = req.body;

        console.log('🔐 Restaurant login attempt:', {
            username,
            passwordLength: password ? password.length : 0
        });

        // Find restaurant user
        const user = await User.findOne({ 
            username, 
            role: 'restaurant',
            status: 'active'
        }).populate('restaurantId');

        // If not found, try to find similar usernames for debugging
        if (!user) {
            const similarUsers = await User.find({
                username: { $regex: username.substring(0, 4), $options: 'i' }
            }).select('username role status').limit(5);
            console.log('🔍 Similar usernames found:', similarUsers.map(u => ({ username: u.username, role: u.role, status: u.status })));
            
            // Also search for exact username match with any role/status
            const exactMatch = await User.findOne({ username }).select('username role status');
            console.log('🔍 Exact username match (any role/status):', exactMatch ? { username: exactMatch.username, role: exactMatch.role, status: exactMatch.status } : 'NOT FOUND');
        }

        console.log('🔍 User lookup result:', {
            userFound: !!user,
            username: user?.username,
            role: user?.role,
            status: user?.status,
            hasRestaurantId: !!user?.restaurantId
        });

        if (!user) {
            console.log('❌ User not found with username:', username);
            return res.status(401).json({
                success: false,
                error: 'Invalid username or password'
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        console.log('🔑 Password check result:', passwordMatch);

        if (!passwordMatch) {
            console.log('❌ Password mismatch for user:', username);
            return res.status(401).json({
                success: false,
                error: 'Invalid username or password'
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate JWT token
        const token = jwt.sign(
            { 
                id: user._id,
                restaurantId: user.restaurantId?._id,
                username: user.username,
                email: user.email,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

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
                    restaurantId: user.restaurantId?._id
                },
                restaurant: user.restaurantId ? {
                    id: user.restaurantId._id,
                    name: user.restaurantId.name,
                    status: user.restaurantId.status,
                    category: user.restaurantId.category
                } : null
            }
        });

    } catch (error) {
        console.error('Restaurant login error:', error);
        next(error);
    }
});

// Configure multer for memory storage (for Cloudinary)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Check file type
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// All restaurant routes require authentication and restaurant role
router.use(authenticate);
router.use(authorize('restaurant'));

// @route   GET /restaurant/me
// @desc    Get current restaurant profile
// @access  Private (Restaurant)
router.get('/me', async (req, res, next) => {
    try {
        // Get user with restaurant data
        const user = await User.findById(req.user._id).populate('restaurantId');
        
        if (!user || !user.restaurantId) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant profile not found'
            });
        }
        
        const restaurant = user.restaurantId;

        // Debug logging
        console.log('🔍 Restaurant /me endpoint - Website data:', {
            restaurantId: restaurant._id,
            restaurantName: restaurant.name,
            socialMedia: restaurant.socialMedia,
            website: restaurant.socialMedia?.website
        });

        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    username: user.username,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    role: user.role,
                    restaurantId: restaurant._id
                },
                restaurant: {
                    id: restaurant._id,
                    name: restaurant.name,
                    category: restaurant.category,
                    status: restaurant.status,
                    description: restaurant.description,
                    phone: restaurant.phone,
                    address: restaurant.address,
                    location: restaurant.location,
                    imageUrl: restaurant.imageUrl,
                    socialMedia: restaurant.socialMedia,
                    openingHours: restaurant.openingHours,
                    deliveryInfo: restaurant.deliveryInfo,
                    serviceOptions: restaurant.serviceOptions,
                    rating: restaurant.rating,
                    stats: restaurant.stats,
                    isVerified: restaurant.isVerified,
                    createdAt: restaurant.createdAt,
                    lastActivity: restaurant.lastActivity
                }
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   PUT /restaurant/me
// @desc    Update restaurant profile
// @access  Private (Restaurant)
router.put('/me', [
    body('description').optional().trim().isLength({ max: 500 }),
    body('socialMedia.website').optional().trim().isURL().withMessage('Geçerli bir web sitesi URL\'si girin'),
    body('phone').optional().trim().matches(/^\+?[\d\s-()]+$/),
    body('openingHours').optional().isArray(),
    body('operatingHours.open').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Açılış saati format: HH:MM'),
    body('operatingHours.close').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Kapanış saati format: HH:MM'),
    body('operatingHours.closed').optional().isBoolean(),
    body('deliveryInfo.radius').optional().isFloat({ min: 0, max: 50 }),
    body('deliveryInfo.fee').optional().isFloat({ min: 0 }),
    body('deliveryInfo.minimumOrder').optional().isFloat({ min: 0 }),
    body('deliveryInfo.estimatedTime').optional().isInt({ min: 10, max: 180 })
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const restaurant = await Restaurant.findOne({ ownerId: req.user._id });
        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant profile not found'
            });
        }

        // Update allowed fields
        const allowedUpdates = [
            'description', 'phone', 'openingHours', 'operatingHours', 'serviceOptions', 
            'deliveryInfo', 'socialMedia', 'settings', 'imageUrl'
        ];

        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                restaurant[field] = req.body[field];
            }
        });

        restaurant.lastActivity = new Date();
        await restaurant.save();

        res.json({
            success: true,
            message: 'Restaurant profile updated successfully',
            data: restaurant
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /restaurant/menu
// @desc    Get restaurant menu items
// @access  Private (Restaurant)
router.get('/menu', async (req, res, next) => {
    try {
        // TODO: Implement menu model and logic
        // For now, return placeholder
        res.json({
            success: true,
            message: 'Menu functionality will be implemented next',
            data: {
                menuItems: [],
                categories: [],
                note: 'Menu management will be added in the next phase'
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /restaurant/orders
// @desc    Get restaurant orders
// @access  Private (Restaurant)
router.get('/orders', async (req, res, next) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;

        // TODO: Implement order model and logic
        // For now, return placeholder
        res.json({
            success: true,
            message: 'Order functionality will be implemented next',
            data: {
                orders: [],
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: 0,
                    pages: 0
                },
                note: 'Order management will be added in the next phase'
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /restaurant/packages
// @desc    Get restaurant packages
// @access  Private (Restaurant)
router.get('/packages', async (req, res, next) => {
    try {
        const restaurant = await Restaurant.findOne({ ownerId: req.user._id });
        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant profile not found'
            });
        }

        // Return all packages including inactive ones for restaurant panel management
        const allPackages = restaurant.packages || [];

        res.json({
            success: true,
            data: allPackages
        });

    } catch (error) {
        next(error);
    }
});

// @route   POST /restaurant/packages
// @desc    Add new package
// @access  Private (Restaurant)
router.post('/packages', [
    body('name').trim().isLength({ min: 1, max: 100 }),
    body('description').optional().trim().isLength({ max: 500 }),
    body('price').isFloat({ min: 0 }),
    body('category').optional().trim().isLength({ max: 50 })
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const restaurant = await Restaurant.findOne({ ownerId: req.user._id });
        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant profile not found'
            });
        }

        // Create new package with all fields
        const newPackage = {
            id: new Date().getTime().toString(),
            name: req.body.name,
            description: req.body.description || '',
            price: req.body.price,
            originalPrice: req.body.originalPrice,
            discountedPrice: req.body.discountedPrice || req.body.price,
            quantity: req.body.quantity || 1,
            category: req.body.category || 'general',
            tags: req.body.tags || [],
            specialInstructions: req.body.specialInstructions || '',
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        if (!restaurant.packages) {
            restaurant.packages = [];
        }
        restaurant.packages.push(newPackage);
        await restaurant.save();

        // Send notification to users who favorited this restaurant
        try {
            const pushService = require('../services/pushNotificationService');

            const notification = {
                title: `${restaurant.name} beklediğin süpriz paketi ekledi 😱`,
                body: `${newPackage.name} - Hadi gidelim! 🚀`,
                type: 'favorite_restaurant_package',
                data: {
                    restaurantId: restaurant._id.toString(),
                    restaurantName: restaurant.name,
                    packageId: newPackage.id,
                    packageName: newPackage.name,
                    packagePrice: newPackage.discountedPrice || newPackage.price
                }
            };

            await pushService.sendToRestaurantFavorites(restaurant._id, notification);
            console.log(`📱 Notification sent to users who favorited ${restaurant.name}`);
        } catch (notificationError) {
            console.error('Failed to send favorite restaurant notification:', notificationError);
            // Don't fail the package creation if notification fails
        }

        res.json({
            success: true,
            message: 'Package added successfully',
            data: newPackage
        });

    } catch (error) {
        next(error);
    }
});

// @route   PATCH /restaurant/packages/:packageId
// @desc    Update package
// @access  Private (Restaurant)
router.patch('/packages/:packageId', async (req, res, next) => {
    try {
        const { packageId } = req.params;
        const restaurant = await Restaurant.findOne({ ownerId: req.user._id });
        
        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant profile not found'
            });
        }

        // Find package in restaurant.packages array (legacy system)
        if (!restaurant.packages) {
            return res.status(404).json({
                success: false,
                error: 'Package not found'
            });
        }

        const packageIndex = restaurant.packages.findIndex(pkg => pkg.id === packageId);
        if (packageIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Package not found'
            });
        }

        // Update package fields
        const allowedUpdates = ['name', 'description', 'price', 'category', 'status', 'quantity'];
        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                restaurant.packages[packageIndex][field] = req.body[field];
            }
        });

        // Special handling for inactive status - ensure quantity is set properly
        if (req.body.status === 'inactive' && req.body.quantity === undefined) {
            // For inactive packages, set quantity to 1 to satisfy validation
            restaurant.packages[packageIndex].quantity = 1;
        }

        restaurant.packages[packageIndex].updatedAt = new Date();
        await restaurant.save();

        res.json({
            success: true,
            message: 'Package updated successfully',
            data: restaurant.packages[packageIndex]
        });

    } catch (error) {
        next(error);
    }
});

// @route   POST /restaurant/profile/image
// @desc    Upload restaurant profile image to Cloudinary
// @access  Private (Restaurant)
router.post('/profile/image', upload.single('image'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No image file provided'
            });
        }

        const restaurant = await Restaurant.findOne({ ownerId: req.user._id });
        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant profile not found'
            });
        }

        // Upload to Cloudinary
        const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
                {
                    folder: `kaptaze/restaurants/${req.user._id}`,
                    transformation: [
                        { width: 400, height: 400, crop: 'fill', gravity: 'face' },
                        { quality: 'auto', format: 'auto' }
                    ],
                    public_id: `profile_${Date.now()}`
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            ).end(req.file.buffer);
        });

        // Save Cloudinary URL to restaurant profile
        restaurant.imageUrl = result.secure_url;
        restaurant.lastActivity = new Date();
        await restaurant.save();

        res.json({
            success: true,
            message: 'Profile image uploaded successfully',
            data: {
                imageUrl: result.secure_url,
                publicId: result.public_id
            }
        });

    } catch (error) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'File size too large. Maximum size is 5MB.'
            });
        }
        console.error('Cloudinary upload error:', error);
        res.status(500).json({
            success: false,
            error: 'Image upload failed'
        });
    }
});

// @route   GET /restaurant/stats
// @desc    Get restaurant statistics
// @access  Private (Restaurant)
router.get('/stats', async (req, res, next) => {
    try {
        const restaurant = await Restaurant.findOne({ ownerId: req.user._id });
        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant profile not found'
            });
        }

        // Basic stats from restaurant model
        const stats = {
            basic: {
                totalOrders: restaurant.stats.totalOrders,
                totalRevenue: restaurant.stats.totalRevenue,
                activeMenuItems: restaurant.stats.activeMenuItems,
                rating: restaurant.rating.average,
                reviewCount: restaurant.rating.count
            },
            status: {
                accountStatus: restaurant.status,
                isVerified: restaurant.isVerified,
                joinedDate: restaurant.createdAt,
                lastActivity: restaurant.lastActivity
            },
            // TODO: Add more detailed analytics
            note: 'Detailed analytics will be implemented in the next phase'
        };

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;