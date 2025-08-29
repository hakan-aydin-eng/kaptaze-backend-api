/**
 * Restaurant Routes
 * /restaurant/*
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const Restaurant = require('../models/Restaurant');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('../config/cloudinary');

const router = express.Router();

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
        // Get restaurant by owner ID
        const restaurant = await Restaurant.findOne({ ownerId: req.user._id })
            .populate('applicationId', 'applicationId createdAt')
            .populate('ownerId', 'username email lastLogin');

        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant profile not found'
            });
        }

        res.json({
            success: true,
            data: restaurant
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
    body('phone').optional().trim().matches(/^\+?[\d\s-()]+$/),
    body('openingHours').optional().isArray(),
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
            'description', 'phone', 'openingHours', 'serviceOptions', 
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

        // Return packages from restaurant model
        res.json({
            success: true,
            data: restaurant.packages || []
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
            availableUntil: req.body.availableUntil ? new Date(req.body.availableUntil) : null,
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
        const allowedUpdates = ['name', 'description', 'price', 'category', 'status'];
        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                restaurant.packages[packageIndex][field] = req.body[field];
            }
        });

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