/**
 * Admin Routes
 * /admin/*
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, query, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const Application = require('../models/Application');
const Restaurant = require('../models/Restaurant');
const User = require('../models/User');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

// @route   GET /admin/applications
// @desc    Get all applications with filtering and pagination
// @access  Private (Admin)
router.get('/applications', [
    query('status').optional().isIn(['pending', 'approved', 'rejected', 'all']),
    query('search').optional().trim(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Invalid query parameters',
                details: errors.array()
            });
        }

        const { 
            status = 'all', 
            search = '', 
            page = 1, 
            limit = 20 
        } = req.query;

        // Build filter
        const filter = {};
        if (status !== 'all') {
            filter.status = status;
        }

        if (search) {
            filter.$or = [
                { businessName: { $regex: search, $options: 'i' } },
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { applicationId: { $regex: search, $options: 'i' } }
            ];
        }

        // Get applications with pagination
        const skip = (page - 1) * limit;
        const applications = await Application.find(filter)
            .populate('reviewedBy', 'firstName lastName email')
            .populate('restaurantId', 'name status')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Application.countDocuments(filter);

        res.json({
            success: true,
            data: {
                applications,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                },
                filters: {
                    status,
                    search
                }
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /admin/applications/:applicationId
// @desc    Get specific application details
// @access  Private (Admin)
router.get('/applications/:applicationId', async (req, res, next) => {
    try {
        const { applicationId } = req.params;

        const application = await Application.findOne({ applicationId })
            .populate('reviewedBy', 'firstName lastName email')
            .populate('restaurantId', 'name status category')
            .populate('userId', 'username email status');

        if (!application) {
            return res.status(404).json({
                success: false,
                error: 'Application not found'
            });
        }

        res.json({
            success: true,
            data: application
        });

    } catch (error) {
        next(error);
    }
});

// @route   POST /admin/applications/:applicationId/approve
// @desc    Approve restaurant application
// @access  Private (Admin)
router.post('/applications/:applicationId/approve', [
    body('username')
        .optional()
        .trim()
        .isLength({ min: 3, max: 30 })
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers and underscores'),
    body('password')
        .optional()
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters'),
    body('notes')
        .optional()
        .trim()
        .isLength({ max: 500 })
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

        const { applicationId } = req.params;
        const { username, password, notes } = req.body;

        // Find application
        const application = await Application.findOne({ applicationId });
        if (!application) {
            return res.status(404).json({
                success: false,
                error: 'Application not found'
            });
        }

        if (application.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: 'Application has already been processed'
            });
        }

        // Generate credentials if not provided
        const finalUsername = username || generateUsername(application.businessName);
        const finalPassword = password || generatePassword();

        // Check if username already exists
        const existingUser = await User.findOne({ username: finalUsername });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: 'Username already exists. Please provide a different username.'
            });
        }

        // Create restaurant user
        const restaurantUser = new User({
            firstName: application.firstName,
            lastName: application.lastName,
            email: application.email,
            phone: application.phone,
            username: finalUsername,
            password: finalPassword,
            role: 'restaurant',
            status: 'active',
            createdBy: req.user._id
        });

        await restaurantUser.save();

        // Create restaurant profile
        const restaurant = new Restaurant({
            name: application.businessName,
            category: application.businessCategory,
            email: application.email,
            phone: application.phone,
            address: {
                street: application.businessAddress,
                district: application.district,
                city: application.city
            },
            location: {
                type: 'Point',
                coordinates: application.businessLongitude && application.businessLatitude 
                    ? [application.businessLongitude, application.businessLatitude]
                    : [0, 0]
            },
            owner: {
                firstName: application.firstName,
                lastName: application.lastName,
                email: application.email,
                phone: application.phone
            },
            applicationId: application._id,
            ownerId: restaurantUser._id,
            createdBy: req.user._id,
            status: 'active'
        });

        await restaurant.save();

        // Update user with restaurant reference
        restaurantUser.restaurantId = restaurant._id;
        await restaurantUser.save();

        // Update application
        application.status = 'approved';
        application.reviewedBy = req.user._id;
        application.reviewedAt = new Date();
        application.restaurantId = restaurant._id;
        application.userId = restaurantUser._id;
        application.generatedCredentials = {
            username: finalUsername,
            passwordHash: restaurantUser.password,
            createdAt: new Date()
        };
        if (notes) application.adminNotes = notes;

        await application.save();

        console.log(`✅ Application approved: ${application.applicationId} - ${application.businessName}`);

        // TODO: Send approval email with credentials

        res.json({
            success: true,
            message: 'Application approved successfully',
            data: {
                applicationId: application.applicationId,
                businessName: application.businessName,
                credentials: {
                    username: finalUsername,
                    password: finalPassword // Only return in response, not stored
                },
                restaurant: {
                    id: restaurant._id,
                    name: restaurant.name,
                    status: restaurant.status
                },
                user: {
                    id: restaurantUser._id,
                    username: restaurantUser.username,
                    email: restaurantUser.email
                }
            }
        });

    } catch (error) {
        console.error('Application approval error:', error);
        next(error);
    }
});

// @route   POST /admin/applications/:applicationId/reject
// @desc    Reject restaurant application
// @access  Private (Admin)
router.post('/applications/:applicationId/reject', [
    body('reason')
        .notEmpty()
        .withMessage('Rejection reason is required')
        .trim()
        .isLength({ max: 500 })
        .withMessage('Reason cannot exceed 500 characters')
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

        const { applicationId } = req.params;
        const { reason } = req.body;

        const application = await Application.findOne({ applicationId });
        if (!application) {
            return res.status(404).json({
                success: false,
                error: 'Application not found'
            });
        }

        if (application.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: 'Application has already been processed'
            });
        }

        // Update application
        application.status = 'rejected';
        application.reviewedBy = req.user._id;
        application.reviewedAt = new Date();
        application.rejectionReason = reason;

        await application.save();

        console.log(`❌ Application rejected: ${application.applicationId} - ${reason}`);

        // TODO: Send rejection email

        res.json({
            success: true,
            message: 'Application rejected',
            data: {
                applicationId: application.applicationId,
                businessName: application.businessName,
                reason
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /admin/restaurants
// @desc    Get all restaurants
// @access  Private (Admin)
router.get('/restaurants', async (req, res, next) => {
    try {
        const { status, search, page = 1, limit = 20 } = req.query;

        const filter = {};
        if (status) filter.status = status;
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { category: { $regex: search, $options: 'i' } },
                { 'owner.firstName': { $regex: search, $options: 'i' } },
                { 'owner.lastName': { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (page - 1) * limit;
        const restaurants = await Restaurant.find(filter)
            .populate('ownerId', 'username email lastLogin')
            .populate('applicationId', 'applicationId createdAt')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Restaurant.countDocuments(filter);

        res.json({
            success: true,
            data: {
                restaurants,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   PATCH /admin/restaurants/:restaurantId
// @desc    Update restaurant status
// @access  Private (Admin)
router.patch('/restaurants/:restaurantId', [
    body('status').optional().isIn(['active', 'inactive', 'suspended']),
    body('notes').optional().trim().isLength({ max: 500 })
], async (req, res, next) => {
    try {
        const { restaurantId } = req.params;
        const { status, notes } = req.body;

        const restaurant = await Restaurant.findById(restaurantId);
        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant not found'
            });
        }

        if (status) restaurant.status = status;
        if (notes) restaurant.adminNotes = notes;

        await restaurant.save();

        // Also update user status if restaurant is suspended/deactivated
        if (status === 'suspended' || status === 'inactive') {
            await User.findByIdAndUpdate(restaurant.ownerId, { status: 'inactive' });
        } else if (status === 'active') {
            await User.findByIdAndUpdate(restaurant.ownerId, { status: 'active' });
        }

        res.json({
            success: true,
            message: 'Restaurant updated successfully',
            data: restaurant
        });

    } catch (error) {
        next(error);
    }
});

// Helper functions
function generateUsername(businessName) {
    const cleaned = businessName
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, 8);
    return cleaned + Math.floor(Math.random() * 1000);
}

function generatePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

module.exports = router;