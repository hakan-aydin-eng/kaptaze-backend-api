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
const Consumer = require('../models/Consumer');
const EmailService = require('../services/emailService');

const router = express.Router();

// Initialize email service
const emailService = new EmailService();

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

        // Send approval email with credentials
        let emailStatus = { sent: false, error: null };
        try {
            const emailResult = await emailService.sendApplicationApprovalEmail(application, {
                username: finalUsername,
                password: finalPassword
            });
            
            if (emailResult.success) {
                console.log(`📧 Approval email sent successfully to: ${application.email}`);
                emailStatus = { sent: true, messageId: emailResult.messageId };
                
                // Update application with email status
                application.emailSent = true;
                application.emailSentAt = new Date();
                application.emailMessageId = emailResult.messageId;
                await application.save();
            }
        } catch (emailError) {
            console.error('❌ Failed to send approval email:', emailError.message);
            emailStatus = { sent: false, error: emailError.message };
            
            // Update application with email error
            application.emailSent = false;
            application.emailError = emailError.message;
            await application.save();
        }

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
                },
                emailStatus: emailStatus
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

        // Send rejection email
        try {
            await emailService.sendApplicationRejectionEmail(application, reason);
            console.log(`📧 Rejection email sent to: ${application.email}`);
        } catch (emailError) {
            console.error('❌ Failed to send rejection email:', emailError.message);
            // Don't fail the rejection process if email fails
        }

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

// @route   GET /admin/users
// @desc    Get all users
// @access  Private (Admin)
router.get('/users', async (req, res, next) => {
    try {
        const { role, status, search, page = 1, limit = 20 } = req.query;

        const filter = {};
        if (role) filter.role = role;
        if (status) filter.status = status;
        if (search) {
            filter.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { username: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (page - 1) * limit;
        const users = await User.find(filter)
            .populate('restaurantId', 'name category status')
            .select('-password') // Exclude password field
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await User.countDocuments(filter);

        res.json({
            success: true,
            data: {
                users,
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

// @route   PATCH /admin/users/:userId
// @desc    Update user status
// @access  Private (Admin)
router.patch('/users/:userId', [
    body('status').optional().isIn(['active', 'inactive', 'suspended']),
    body('notes').optional().trim().isLength({ max: 500 })
], async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { status, notes } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        if (status) user.status = status;
        if (notes) user.adminNotes = notes;

        await user.save();

        // If user is restaurant owner, also update restaurant status
        if (user.role === 'restaurant' && user.restaurantId) {
            const restaurantStatus = status === 'active' ? 'active' : 'inactive';
            await Restaurant.findByIdAndUpdate(user.restaurantId, { status: restaurantStatus });
        }

        res.json({
            success: true,
            message: 'User updated successfully',
            data: user
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /admin/packages
// @desc    Get all restaurant packages for admin dashboard
// @access  Private (Admin)
router.get('/packages', async (req, res, next) => {
    try {
        const { restaurant, status, category, page = 1, limit = 50 } = req.query;

        // Build filter for restaurants
        const restaurantFilter = {};
        if (restaurant) {
            restaurantFilter.name = { $regex: restaurant, $options: 'i' };
        }

        // Get all restaurants with packages
        const restaurants = await Restaurant.find(restaurantFilter)
            .populate('ownerId', 'firstName lastName email')
            .select('name category address ownerId packages');

        // Aggregate all packages with restaurant info
        let allPackages = [];
        
        restaurants.forEach(restaurant => {
            if (restaurant.packages && restaurant.packages.length > 0) {
                restaurant.packages.forEach(pkg => {
                    // Apply filters
                    if (status && pkg.status !== status) return;
                    if (category && pkg.category !== category) return;

                    allPackages.push({
                        // Package info
                        packageId: pkg.id,
                        name: pkg.name,
                        description: pkg.description,
                        price: pkg.price,
                        originalPrice: pkg.originalPrice,
                        discountedPrice: pkg.discountedPrice,
                        quantity: pkg.quantity,
                        category: pkg.category,
                        tags: pkg.tags,
                        status: pkg.status,
                        availableUntil: pkg.availableUntil,
                        createdAt: pkg.createdAt,
                        
                        // Restaurant info
                        restaurant: {
                            id: restaurant._id,
                            name: restaurant.name,
                            category: restaurant.category,
                            address: restaurant.address,
                            owner: restaurant.ownerId ? {
                                name: `${restaurant.ownerId.firstName || ''} ${restaurant.ownerId.lastName || ''}`.trim(),
                                email: restaurant.ownerId.email
                            } : null
                        }
                    });
                });
            }
        });

        // Sort by creation date (newest first)
        allPackages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Pagination
        const skip = (page - 1) * limit;
        const paginatedPackages = allPackages.slice(skip, skip + parseInt(limit));

        res.json({
            success: true,
            data: {
                packages: paginatedPackages,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: allPackages.length,
                    pages: Math.ceil(allPackages.length / limit)
                },
                summary: {
                    totalPackages: allPackages.length,
                    activePackages: allPackages.filter(p => p.status === 'active').length,
                    totalRestaurants: restaurants.length
                }
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /admin/consumers
// @desc    Get all mobile app consumers for admin panel
// @access  Private (Admin)
router.get('/consumers', [
    query('status').optional().isIn(['active', 'inactive', 'suspended', 'all']),
    query('search').optional().trim(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('sortBy').optional().isIn(['name', 'email', 'registrationDate', 'lastActivity', 'orderCount', 'totalSpent']),
    query('sortOrder').optional().isIn(['asc', 'desc'])
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
            limit = 50,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        console.log(`📊 Admin requesting consumers - Status: ${status}, Search: "${search}", Page: ${page}`);

        // Build filter
        const filter = {};
        if (status !== 'all') {
            filter.status = status;
        }

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { surname: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }

        // Build sort object
        const sortField = sortBy === 'registrationDate' ? 'createdAt' : sortBy;
        const sort = {};
        sort[sortField] = sortOrder === 'asc' ? 1 : -1;

        // Get consumers with pagination
        const skip = (page - 1) * limit;
        const consumers = await Consumer.find(filter)
            .select('-password -passwordResetToken -emailVerificationToken') // Exclude sensitive fields
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Consumer.countDocuments(filter);

        // Calculate statistics
        const stats = await Consumer.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalConsumers: { $sum: 1 },
                    activeConsumers: {
                        $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] }
                    },
                    totalOrders: { $sum: "$orderCount" },
                    totalSpending: { $sum: "$totalSpent" },
                    avgOrdersPerConsumer: { $avg: "$orderCount" },
                    avgSpendingPerConsumer: { $avg: "$totalSpent" }
                }
            }
        ]);

        const statistics = stats[0] || {
            totalConsumers: 0,
            activeConsumers: 0,
            totalOrders: 0,
            totalSpending: 0,
            avgOrdersPerConsumer: 0,
            avgSpendingPerConsumer: 0
        };

        // Get recent registrations (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentRegistrations = await Consumer.countDocuments({
            createdAt: { $gte: thirtyDaysAgo },
            ...(status !== 'all' && { status })
        });

        console.log(`✅ Found ${consumers.length} consumers (total: ${total})`);

        res.json({
            success: true,
            data: {
                consumers,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                },
                statistics: {
                    ...statistics,
                    recentRegistrations
                },
                filters: {
                    status,
                    search,
                    sortBy,
                    sortOrder
                }
            }
        });

    } catch (error) {
        console.error('❌ Admin consumers query error:', error);
        next(error);
    }
});

// @route   GET /admin/consumers/:consumerId
// @desc    Get specific consumer details
// @access  Private (Admin)
router.get('/consumers/:consumerId', async (req, res, next) => {
    try {
        const { consumerId } = req.params;

        const consumer = await Consumer.findById(consumerId)
            .select('-password -passwordResetToken -emailVerificationToken')
            .populate('favoriteRestaurants', 'name category address');

        if (!consumer) {
            return res.status(404).json({
                success: false,
                error: 'Consumer not found'
            });
        }

        // Get consumer's order history (if Order model exists)
        let orders = [];
        try {
            const Order = require('../models/Order');
            orders = await Order.find({ consumerId: consumer._id })
                .populate('restaurantId', 'name category')
                .sort({ createdAt: -1 })
                .limit(20); // Last 20 orders
        } catch (orderError) {
            console.log('Orders not found or model not available');
        }

        res.json({
            success: true,
            data: {
                consumer,
                orders,
                summary: {
                    totalOrders: consumer.orderCount,
                    totalSpent: consumer.totalSpent,
                    avgOrderValue: consumer.orderCount > 0 ? consumer.totalSpent / consumer.orderCount : 0,
                    favoriteRestaurants: consumer.favoriteRestaurants?.length || 0,
                    accountAge: Math.floor((Date.now() - consumer.createdAt) / (1000 * 60 * 60 * 24)) // days
                }
            }
        });

    } catch (error) {
        console.error('❌ Admin consumer detail error:', error);
        next(error);
    }
});

// @route   PATCH /admin/consumers/:consumerId
// @desc    Update consumer status and admin notes
// @access  Private (Admin)
router.patch('/consumers/:consumerId', [
    body('status').optional().isIn(['active', 'inactive', 'suspended']),
    body('adminNotes').optional().trim().isLength({ max: 500 }),
    body('orderCount').optional().isInt({ min: 0 }),
    body('totalSpent').optional().isFloat({ min: 0 })
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

        const { consumerId } = req.params;
        const { status, adminNotes, orderCount, totalSpent } = req.body;

        const consumer = await Consumer.findById(consumerId);
        if (!consumer) {
            return res.status(404).json({
                success: false,
                error: 'Consumer not found'
            });
        }

        // Update fields if provided
        if (status !== undefined) consumer.status = status;
        if (adminNotes !== undefined) consumer.adminNotes = adminNotes;
        if (orderCount !== undefined) consumer.orderCount = orderCount;
        if (totalSpent !== undefined) consumer.totalSpent = totalSpent;
        
        // Track who made the changes
        consumer.lastUpdatedBy = req.user._id;
        consumer.lastUpdatedAt = new Date();

        await consumer.save();

        console.log(`✅ Consumer ${consumer.name} ${consumer.surname} updated by admin ${req.user.username}`);

        res.json({
            success: true,
            message: 'Consumer updated successfully',
            data: {
                consumer: {
                    id: consumer._id,
                    name: consumer.name,
                    surname: consumer.surname,
                    email: consumer.email,
                    status: consumer.status,
                    orderCount: consumer.orderCount,
                    totalSpent: consumer.totalSpent,
                    lastUpdatedAt: consumer.lastUpdatedAt
                }
            }
        });

    } catch (error) {
        console.error('❌ Admin consumer update error:', error);
        next(error);
    }
});

// @route   DELETE /admin/consumers/:consumerId
// @desc    Delete consumer account (soft delete)
// @access  Private (Admin)
router.delete('/consumers/:consumerId', [
    body('reason')
        .notEmpty()
        .withMessage('Deletion reason is required')
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

        const { consumerId } = req.params;
        const { reason } = req.body;

        const consumer = await Consumer.findById(consumerId);
        if (!consumer) {
            return res.status(404).json({
                success: false,
                error: 'Consumer not found'
            });
        }

        // Soft delete - mark as suspended and add deletion info
        consumer.status = 'suspended';
        consumer.deletedAt = new Date();
        consumer.deletedBy = req.user._id;
        consumer.deletionReason = reason;
        consumer.adminNotes = (consumer.adminNotes || '') + `\n[${new Date().toISOString()}] Account suspended by admin: ${reason}`;

        await consumer.save();

        console.log(`🗑️ Consumer ${consumer.name} ${consumer.surname} suspended by admin: ${reason}`);

        res.json({
            success: true,
            message: 'Consumer account suspended successfully',
            data: {
                consumerId: consumer._id,
                name: `${consumer.name} ${consumer.surname}`,
                email: consumer.email,
                reason
            }
        });

    } catch (error) {
        console.error('❌ Admin consumer deletion error:', error);
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