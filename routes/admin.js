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
const Package = require('../models/Package');
const Order = require('../models/Order');
const emailService = require('../services/emailService');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(authorize('admin'));

// @route   GET /admin/test
// @desc    Test admin API connection
// @access  Private (Admin)
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Admin API is working!',
        user: req.user,
        timestamp: new Date().toISOString()
    });
});

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

        // Handle createdBy field for demo admin
        const mongoose = require('mongoose');
        let createdByValue = req.user._id;
        
        // If demo admin (string ID), convert to ObjectId or use null
        if (typeof req.user._id === 'string' && req.user._id.startsWith('admin-')) {
            createdByValue = null; // Or create a default admin ObjectId
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
            createdBy: createdByValue
        });

        await restaurantUser.save();

        // Create restaurant profile
        const restaurant = new Restaurant({
            name: application.businessName,
            businessName: application.businessName,
            category: application.businessCategory,
            email: application.email,
            phone: application.phone,
            firstName: application.firstName,
            lastName: application.lastName,
            username: finalUsername,
            temporaryPassword: finalPassword,
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
            createdBy: createdByValue,
            status: 'active'
        });

        await restaurant.save();

        // Update user with restaurant reference
        restaurantUser.restaurantId = restaurant._id;
        await restaurantUser.save();

        // Update application
        application.status = 'approved';
        application.reviewedBy = createdByValue;
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

        // Handle createdBy field for demo admin (same as approve endpoint)
        const mongoose = require('mongoose');
        let createdByValue = req.user._id;
        
        // If demo admin (string ID), convert to ObjectId or use null
        if (typeof req.user._id === 'string' && req.user._id.startsWith('admin-')) {
            createdByValue = null;
        }

        // Update application
        application.status = 'rejected';
        application.reviewedBy = createdByValue;
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

// @route   PATCH /admin/restaurants/:restaurantId/status
// @desc    Suspend or resume restaurant  
// @access  Private (Admin)
router.patch('/restaurants/:restaurantId/status', async (req, res, next) => {
    try {
        const { restaurantId } = req.params;
        const { action, reason } = req.body; // action: 'suspend' or 'resume'

        const restaurant = await Restaurant.findById(restaurantId);
        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant not found'
            });
        }

        // Update restaurant status based on action
        if (action === 'suspend') {
            restaurant.status = 'suspended';
            restaurant.suspendedAt = new Date();
            restaurant.suspensionReason = reason || 'Admin tarafından askıya alındı';
            
            // Also suspend the user account
            const user = await User.findById(restaurant.ownerId);
            if (user) {
                user.isActive = false;
                await user.save();
            }
            
        } else if (action === 'resume') {
            restaurant.status = 'active';
            restaurant.suspendedAt = null;
            restaurant.suspensionReason = null;
            
            // Also reactivate the user account
            const user = await User.findById(restaurant.ownerId);
            if (user) {
                user.isActive = true;
                await user.save();
            }
        } else {
            return res.status(400).json({
                success: false,
                error: 'Invalid action. Use "suspend" or "resume"'
            });
        }

        restaurant.lastActivity = new Date();
        await restaurant.save();

        res.json({
            success: true,
            message: `Restaurant ${action === 'suspend' ? 'suspended' : 'resumed'} successfully`,
            data: restaurant
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
                        id: pkg.id,
                        packageId: pkg.id,
                        packageName: pkg.name,
                        description: pkg.description,
                        price: pkg.price,
                        originalPrice: pkg.originalPrice || pkg.price,
                        discountPrice: pkg.discountedPrice || pkg.price,
                        discount: pkg.originalPrice ? Math.round(((pkg.originalPrice - (pkg.discountedPrice || pkg.price)) / pkg.originalPrice) * 100) : 0,
                        quantity: pkg.quantity,
                        category: pkg.category,
                        tags: pkg.tags,
                        status: pkg.status || 'active',
                        availableUntil: pkg.availableUntil,
                        createdAt: pkg.createdAt,
                        expiryTime: pkg.availableUntil ? new Date(pkg.availableUntil).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '23:59',
                        
                        // Restaurant info
                        restaurantId: restaurant._id,
                        restaurantName: restaurant.name,
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

// @route   GET /admin/packages
// @desc    Get all packages with filtering and pagination
// @access  Private (Admin)
router.get('/packages', [
    query('status').optional().isIn(['active', 'inactive', 'sold_out', 'expired', 'all']),
    query('restaurant').optional().isMongoId(),
    query('category').optional().trim(),
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
            restaurant,
            category,
            search = '', 
            page = 1, 
            limit = 20 
        } = req.query;

        // Build filter
        const filter = {};
        
        if (status !== 'all') {
            filter.status = status;
        }
        
        if (restaurant) {
            filter.restaurant = restaurant;
        }
        
        if (category) {
            filter.category = new RegExp(category, 'i');
        }
        
        if (search) {
            filter.$or = [
                { name: new RegExp(search, 'i') },
                { description: new RegExp(search, 'i') },
                { restaurantName: new RegExp(search, 'i') }
            ];
        }

        // Execute queries
        const [packages, total] = await Promise.all([
            Package.find(filter)
                .populate('restaurant', 'name category phone email')
                .sort({ createdAt: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .lean(),
            Package.countDocuments(filter)
        ]);

        // Calculate pagination
        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        // Package statistics
        const stats = await Package.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalValue: { $sum: '$originalPrice' },
                    totalDiscounted: { $sum: '$discountedPrice' }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                packages,
                pagination: {
                    current: page,
                    pages: totalPages,
                    total,
                    hasNext: hasNextPage,
                    hasPrev: hasPrevPage
                },
                stats: {
                    total,
                    byStatus: stats.reduce((acc, stat) => {
                        acc[stat._id] = stat.count;
                        return acc;
                    }, {})
                }
            }
        });

    } catch (error) {
        console.error('Error fetching packages:', error);
        next(error);
    }
});

// @route   GET /admin/consumers
// @desc    Get all consumers with filtering and pagination  
// @access  Private (Admin)
router.get('/consumers', [
    query('status').optional().isIn(['active', 'inactive', 'banned', 'all']),
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
                { firstName: new RegExp(search, 'i') },
                { lastName: new RegExp(search, 'i') },
                { email: new RegExp(search, 'i') },
                { phone: new RegExp(search, 'i') }
            ];
        }

        // Execute queries
        const [consumers, total] = await Promise.all([
            Consumer.find(filter)
                .select('-password') // Exclude password field
                .sort({ createdAt: -1 })
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .lean(),
            Consumer.countDocuments(filter)
        ]);

        // Calculate pagination
        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        res.json({
            success: true,
            data: {
                consumers,
                pagination: {
                    current: page,
                    pages: totalPages,
                    total,
                    hasNext: hasNextPage,
                    hasPrev: hasPrevPage
                },
                stats: {
                    total
                }
            }
        });

    } catch (error) {
        console.error('Error fetching consumers:', error);
        next(error);
    }
});

// @route   GET /admin/stats
// @desc    Get admin dashboard statistics
// @access  Private (Admin)
router.get('/stats', async (req, res, next) => {
    try {
        // Get counts for different models
        const [
            totalApplications,
            pendingApplications,
            approvedApplications,
            totalRestaurants,
            activeRestaurants,
            totalPackages,
            activePackages,
            totalConsumers,
            activeConsumers
        ] = await Promise.all([
            Application.countDocuments(),
            Application.countDocuments({ status: 'pending' }),
            Application.countDocuments({ status: 'approved' }),
            Restaurant.countDocuments(),
            Restaurant.countDocuments({ status: 'approved' }),
            Package.countDocuments(),
            Package.countDocuments({ status: 'active' }),
            Consumer.countDocuments(),
            Consumer.countDocuments({ status: 'active' })
        ]);

        // Get recent activity
        const recentApplications = await Application.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .select('firstName lastName businessName status createdAt')
            .lean();

        const recentPackages = await Package.find()
            .populate('restaurant', 'name')
            .sort({ createdAt: -1 })
            .limit(5)
            .select('name restaurantName originalPrice discountedPrice status createdAt')
            .lean();

        res.json({
            success: true,
            data: {
                overview: {
                    applications: {
                        total: totalApplications,
                        pending: pendingApplications,
                        approved: approvedApplications
                    },
                    restaurants: {
                        total: totalRestaurants,
                        active: activeRestaurants
                    },
                    packages: {
                        total: totalPackages,
                        active: activePackages
                    },
                    consumers: {
                        total: totalConsumers,
                        active: activeConsumers
                    }
                },
                recent: {
                    applications: recentApplications,
                    packages: recentPackages
                }
            }
        });

    } catch (error) {
        console.error('Error fetching admin stats:', error);
        next(error);
    }
});

function generatePassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

// @route   GET /admin/restaurants
// @desc    Get all restaurants (from approved applications)
// @access  Private (Admin)
router.get('/restaurants', [
    query('status').optional().isIn(['active', 'inactive', 'suspended', 'all']),
    query('search').optional().trim(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
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

        const {
            status = 'all',
            search = '',
            page = 1,
            limit = 20
        } = req.query;

        // Build query
        let query = {};

        // Status filter
        if (status !== 'all') {
            query.status = status;
        }

        // Search filter
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { category: { $regex: search, $options: 'i' } },
                { 'owner.firstName': { $regex: search, $options: 'i' } },
                { 'owner.lastName': { $regex: search, $options: 'i' } },
                { 'owner.email': { $regex: search, $options: 'i' } }
            ];
        }

        // Get restaurants with pagination
        const skip = (page - 1) * limit;
        const restaurants = await Restaurant.find(query)
            .populate('applicationId', 'applicationId businessName firstName lastName email phone businessCategory city district createdAt')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Get total count for pagination
        const total = await Restaurant.countDocuments(query);

        const result = restaurants.map(restaurant => ({
            _id: restaurant._id,
            name: restaurant.name,
            category: restaurant.category,
            email: restaurant.email,
            phone: restaurant.phone,
            address: restaurant.address,
            owner: restaurant.owner,
            status: restaurant.status,
            isVerified: restaurant.isVerified,
            createdAt: restaurant.createdAt,
            updatedAt: restaurant.updatedAt,
            application: restaurant.applicationId ? {
                applicationId: restaurant.applicationId.applicationId,
                businessName: restaurant.applicationId.businessName,
                submittedAt: restaurant.applicationId.createdAt
            } : null,
            stats: {
                totalPackages: restaurant.packages?.length || 0,
                activePackages: restaurant.packages?.filter(pkg => pkg.status === 'active').length || 0
            }
        }));

        res.json({
            success: true,
            data: {
                restaurants: result,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                },
                filters: { status, search }
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   POST /admin/send-email  
// @desc    Send email via SendGrid (CORS proxy)
// @access  Private (Admin only)
router.post('/send-email', async (req, res, next) => {
    try {
        const { emailData } = req.body;
        
        if (!emailData) {
            return res.status(400).json({
                success: false,
                error: 'Email data is required'
            });
        }

        // SendGrid API call from backend (no CORS issues)
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(emailData)
        });

        if (response.ok) {
            const messageId = response.headers.get('X-Message-Id');
            res.json({
                success: true,
                messageId: messageId || 'sent-' + Date.now(),
                status: response.status
            });
        } else {
            const errorText = await response.text();
            console.error('SendGrid API error:', errorText);
            
            res.status(response.status).json({
                success: false,
                error: `SendGrid API error: ${response.status}`,
                details: errorText
            });
        }

    } catch (error) {
        console.error('Email proxy error:', error);
        res.status(500).json({
            success: false,
            error: 'Email sending failed',
            details: error.message
        });
    }
});

// @route   PATCH /admin/packages/:packageId/status
// @desc    Update package status (suspend/activate)
// @access  Private (Admin)
router.patch('/packages/:packageId/status', async (req, res, next) => {
    try {
        const { packageId } = req.params;
        const { status } = req.body;

        if (!['active', 'suspended', 'inactive'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status value'
            });
        }

        // Find restaurant with this package
        const restaurant = await Restaurant.findOne({ 'packages.id': packageId });
        
        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Package not found'
            });
        }

        // Update package status
        const package = restaurant.packages.find(pkg => pkg.id === packageId);
        if (package) {
            package.status = status;
            package.updatedAt = new Date();
            await restaurant.save();

            res.json({
                success: true,
                message: `Package status updated to ${status}`,
                data: package
            });
        } else {
            return res.status(404).json({
                success: false,
                error: 'Package not found in restaurant'
            });
        }

    } catch (error) {
        next(error);
    }
});

// @route   DELETE /admin/packages/:packageId
// @desc    Delete a package permanently
// @access  Private (Admin)
router.delete('/packages/:packageId', async (req, res, next) => {
    try {
        const { packageId } = req.params;

        // Find restaurant with this package
        const restaurant = await Restaurant.findOne({ 'packages.id': packageId });
        
        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Package not found'
            });
        }

        // Remove package from array
        const packageIndex = restaurant.packages.findIndex(pkg => pkg.id === packageId);
        
        if (packageIndex !== -1) {
            const deletedPackage = restaurant.packages[packageIndex];
            restaurant.packages.splice(packageIndex, 1);
            await restaurant.save();

            res.json({
                success: true,
                message: 'Package deleted successfully',
                data: deletedPackage
            });
        } else {
            return res.status(404).json({
                success: false,
                error: 'Package not found in restaurant'
            });
        }

    } catch (error) {
        next(error);
    }
});

// @route   GET /admin/notification-history
// @desc    Get notification history for admin panel
// @access  Private (Admin)
router.get('/notification-history', async (req, res, next) => {
    try {
        const { limit = 20 } = req.query;

        // Get recent orders (notifications are based on orders)
        const recentOrders = await Order.find()
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .select('_id orderId customer restaurant createdAt status paymentMethod');

        const notifications = recentOrders.map(order => ({
            id: order._id,
            orderId: order.orderId,
            type: 'new_order',
            message: `New order from ${order.customer?.name || 'Customer'}`,
            restaurant: order.restaurant?.name || 'Restaurant',
            timestamp: order.createdAt,
            status: order.status,
            read: true // Admin panel doesn't track read/unread yet
        }));

        res.json({
            success: true,
            data: notifications
        });

    } catch (error) {
        console.error('❌ Error fetching notification history:', error);
        next(error);
    }
});

// @route   GET /admin/notification-stats
// @desc    Get notification statistics for admin panel
// @access  Private (Admin)
router.get('/notification-stats', async (req, res, next) => {
    try {
        // Get today's orders
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayOrders = await Order.countDocuments({
            createdAt: { $gte: today }
        });

        // Get pending orders (unread notifications)
        const pendingOrders = await Order.countDocuments({
            status: 'pending'
        });

        // Get total orders this week
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const weekOrders = await Order.countDocuments({
            createdAt: { $gte: weekAgo }
        });

        res.json({
            success: true,
            data: {
                total: todayOrders,
                unread: pendingOrders,
                today: todayOrders,
                week: weekOrders
            }
        });

    } catch (error) {
        console.error('❌ Error fetching notification stats:', error);
        next(error);
    }
});

// ============================================================================
// ORDER MANAGEMENT ENDPOINTS
// ============================================================================

// @route   GET /admin/orders
// @desc    Get all orders with filtering, pagination, and search
// @access  Private (Admin)
router.get('/orders', [
    query('status').optional().isIn(['pending', 'confirmed', 'completed', 'cancelled', 'all']),
    query('restaurantId').optional().isMongoId(),
    query('paymentMethod').optional().isIn(['cash', 'online', 'all']),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
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
            restaurantId,
            paymentMethod = 'all',
            startDate,
            endDate,
            search = '',
            page = 1,
            limit = 20
        } = req.query;

        // Build filter
        const filter = {};

        if (status !== 'all') {
            filter.status = status;
        }

        if (restaurantId) {
            filter['restaurant.id'] = restaurantId;
        }

        if (paymentMethod !== 'all') {
            filter.paymentMethod = paymentMethod;
        }

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = end;
            }
        }

        if (search) {
            filter.$or = [
                { orderId: { $regex: search, $options: 'i' } },
                { orderCode: { $regex: search, $options: 'i' } },
                { 'customer.name': { $regex: search, $options: 'i' } },
                { 'customer.phone': { $regex: search, $options: 'i' } },
                { 'restaurant.name': { $regex: search, $options: 'i' } }
            ];
        }

        // Get orders with pagination
        const skip = (page - 1) * limit;
        const orders = await Order.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Order.countDocuments(filter);

        // Unified format - ensure all orders follow consistent structure
        const unifiedOrders = orders.map(order => ({
            _id: order._id,
            orderId: order.orderId || order._id.toString(),
            orderCode: order.orderCode || order.orderId,
            customer: {
                id: order.customer?.id || order.customerId,
                name: order.customer?.name || 'Unknown',
                email: order.customer?.email || '',
                phone: order.customer?.phone || ''
            },
            restaurant: {
                id: order.restaurant?.id || order.restaurantId,
                name: order.restaurant?.name || 'Unknown Restaurant'
            },
            items: order.items || [],
            totalPrice: order.totalPrice || 0,
            savings: order.savings || 0,
            paymentMethod: order.paymentMethod || 'cash',
            status: order.status || 'pending',
            createdAt: order.createdAt,
            pickupTime: order.pickupTime || null,
            pickupCode: order.pickupCode || null
        }));

        res.json({
            success: true,
            data: {
                orders: unifiedOrders,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                },
                filters: {
                    status,
                    restaurantId,
                    paymentMethod,
                    startDate,
                    endDate,
                    search
                }
            }
        });

    } catch (error) {
        console.error('❌ Error fetching orders:', error);
        next(error);
    }
});

// @route   GET /admin/orders/:orderId
// @desc    Get specific order details
// @access  Private (Admin)
router.get('/orders/:orderId', async (req, res, next) => {
    try {
        const { orderId } = req.params;

        // Try to find by _id or orderId field
        const order = await Order.findOne({
            $or: [
                { _id: orderId },
                { orderId: orderId }
            ]
        }).lean();

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // Unified format
        const unifiedOrder = {
            _id: order._id,
            orderId: order.orderId || order._id.toString(),
            orderCode: order.orderCode || order.orderId,
            customer: {
                id: order.customer?.id || order.customerId,
                name: order.customer?.name || 'Unknown',
                email: order.customer?.email || '',
                phone: order.customer?.phone || ''
            },
            restaurant: {
                id: order.restaurant?.id || order.restaurantId,
                name: order.restaurant?.name || 'Unknown Restaurant',
                phone: order.restaurant?.phone || '',
                address: order.restaurant?.address || {}
            },
            items: order.items || [],
            totalPrice: order.totalPrice || 0,
            savings: order.savings || 0,
            paymentMethod: order.paymentMethod || 'cash',
            paymentStatus: order.paymentStatus || 'pending',
            status: order.status || 'pending',
            createdAt: order.createdAt,
            pickupTime: order.pickupTime || null,
            pickupCode: order.pickupCode || null,
            notes: order.notes || '',
            review: order.review || null
        };

        res.json({
            success: true,
            data: unifiedOrder
        });

    } catch (error) {
        console.error('❌ Error fetching order details:', error);
        next(error);
    }
});

// @route   GET /admin/analytics/revenue
// @desc    Get revenue analytics and statistics
// @access  Private (Admin)
router.get('/analytics/revenue', [
    query('period').optional().isIn(['day', 'week', 'month', 'year', 'all']),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601()
], async (req, res, next) => {
    try {
        const { period = 'month', startDate, endDate } = req.query;

        // Calculate date range
        let dateFilter = {};
        const now = new Date();

        if (startDate && endDate) {
            dateFilter = {
                createdAt: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        } else {
            switch (period) {
                case 'day':
                    dateFilter.createdAt = { $gte: new Date(now.setHours(0, 0, 0, 0)) };
                    break;
                case 'week':
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    dateFilter.createdAt = { $gte: weekAgo };
                    break;
                case 'month':
                    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                    dateFilter.createdAt = { $gte: monthAgo };
                    break;
                case 'year':
                    const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                    dateFilter.createdAt = { $gte: yearAgo };
                    break;
                default:
                    dateFilter = {};
            }
        }

        // Get completed orders only
        const revenueFilter = { ...dateFilter, status: { $in: ['completed', 'confirmed'] } };

        // Total revenue
        const revenueOrders = await Order.find(revenueFilter).lean();
        const totalRevenue = revenueOrders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);
        const totalSavings = revenueOrders.reduce((sum, order) => sum + (order.savings || 0), 0);

        // Order count by status
        const totalOrders = await Order.countDocuments(dateFilter);
        const pendingOrders = await Order.countDocuments({ ...dateFilter, status: 'pending' });
        const completedOrders = await Order.countDocuments({ ...dateFilter, status: 'completed' });
        const cancelledOrders = await Order.countDocuments({ ...dateFilter, status: 'cancelled' });

        // Payment method breakdown
        const cashOrders = await Order.countDocuments({ ...dateFilter, paymentMethod: 'cash' });
        const onlineOrders = await Order.countDocuments({ ...dateFilter, paymentMethod: 'online' });

        // Average order value
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        // Top restaurants by revenue
        const topRestaurants = await Order.aggregate([
            { $match: revenueFilter },
            {
                $group: {
                    _id: '$restaurant.id',
                    restaurantName: { $first: '$restaurant.name' },
                    totalRevenue: { $sum: '$totalPrice' },
                    orderCount: { $sum: 1 }
                }
            },
            { $sort: { totalRevenue: -1 } },
            { $limit: 10 }
        ]);

        res.json({
            success: true,
            data: {
                period,
                dateRange: dateFilter.createdAt || 'all',
                revenue: {
                    total: totalRevenue,
                    totalSavings: totalSavings,
                    average: avgOrderValue
                },
                orders: {
                    total: totalOrders,
                    pending: pendingOrders,
                    completed: completedOrders,
                    cancelled: cancelledOrders
                },
                paymentMethods: {
                    cash: cashOrders,
                    online: onlineOrders
                },
                topRestaurants: topRestaurants.map(r => ({
                    restaurantId: r._id,
                    restaurantName: r.restaurantName || 'Unknown',
                    revenue: r.totalRevenue,
                    orderCount: r.orderCount
                }))
            }
        });

    } catch (error) {
        console.error('❌ Error fetching revenue analytics:', error);
        next(error);
    }
});

// @route   GET /admin/restaurants/:restaurantId/stats
// @desc    Get statistics for a specific restaurant
// @access  Private (Admin)
router.get('/restaurants/:restaurantId/stats', async (req, res, next) => {
    try {
        const { restaurantId } = req.params;

        // Verify restaurant exists
        const restaurant = await Restaurant.findById(restaurantId);
        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant not found'
            });
        }

        // Get all orders for this restaurant
        const orders = await Order.find({ 'restaurant.id': restaurantId }).lean();

        // Calculate stats
        const totalOrders = orders.length;
        const completedOrders = orders.filter(o => o.status === 'completed').length;
        const totalRevenue = orders
            .filter(o => o.status === 'completed')
            .reduce((sum, o) => sum + (o.totalPrice || 0), 0);

        // Get active packages
        const activePackages = await Package.countDocuments({
            restaurantId: restaurantId,
            isActive: true
        });

        // Calculate average rating
        const ratedOrders = orders.filter(o => o.review && o.review.rating);
        const avgRating = ratedOrders.length > 0
            ? ratedOrders.reduce((sum, o) => sum + o.review.rating, 0) / ratedOrders.length
            : 0;

        res.json({
            success: true,
            data: {
                restaurantId,
                restaurantName: restaurant.name || restaurant.businessName,
                stats: {
                    totalOrders,
                    completedOrders,
                    totalRevenue,
                    activePackages,
                    averageRating: avgRating.toFixed(1),
                    completionRate: totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(1) : 0
                }
            }
        });

    } catch (error) {
        console.error('❌ Error fetching restaurant stats:', error);
        next(error);
    }
});

// ==========================================
// REVIEWS MANAGEMENT ENDPOINTS
// ==========================================

// @route   GET /admin/reviews/pending
// @desc    Get pending (unapproved) photo reviews
// @access  Private (Admin)
router.get('/reviews/pending', [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
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

        const page = req.query.page || 1;
        const limit = req.query.limit || 20;
        const skip = (page - 1) * limit;

        console.log('📋 [DEBUG] Fetching pending reviews - page:', page, 'limit:', limit);

        // Find orders with unapproved photos
        const orders = await Order.find({
            'review.isRated': true,
            'review.photos.0': { $exists: true },
            'review.photos': {
                $elemMatch: { isApproved: false }
            }
        })
        .sort({ 'review.reviewedAt': -1 })
        .skip(skip)
        .limit(limit)
        .lean();

        const total = await Order.countDocuments({
            'review.isRated': true,
            'review.photos.0': { $exists: true },
            'review.photos': {
                $elemMatch: { isApproved: false }
            }
        });

        console.log(`✅ Found ${orders.length} orders with pending photos`);

        // Format response with unified format
        const reviews = orders.map(order => ({
            _id: order._id,
            orderId: order.orderId,
            customer: {
                id: order.customer?.id,
                name: order.customer?.name || 'Unknown',
                email: order.customer?.email || ''
            },
            restaurant: {
                id: order.restaurant?.id,
                name: order.restaurant?.name || 'Unknown Restaurant'
            },
            review: {
                rating: order.review?.rating,
                comment: order.review?.comment || '',
                photos: order.review?.photos?.filter(photo => !photo.isApproved) || [],
                reviewedAt: order.review?.reviewedAt
            },
            totalPrice: order.totalPrice || 0,
            savings: order.savings || 0,
            createdAt: order.createdAt
        }));

        res.json({
            success: true,
            data: {
                reviews,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('❌ Error fetching pending reviews:', error);
        next(error);
    }
});

// @route   POST /admin/reviews/:orderId/photos/:photoIndex/approve
// @desc    Approve a photo in a review
// @access  Private (Admin)
router.post('/reviews/:orderId/photos/:photoIndex/approve', async (req, res, next) => {
    try {
        const { orderId, photoIndex } = req.params;
        const adminUserId = req.user._id;

        console.log('✅ [DEBUG] Approving photo - Order:', orderId, 'Photo index:', photoIndex);

        const order = await Order.findOne({
            $or: [
                { _id: orderId },
                { orderId: orderId }
            ]
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        if (!order.review || !order.review.photos || !order.review.photos[photoIndex]) {
            return res.status(404).json({
                success: false,
                error: 'Photo not found'
            });
        }

        // Update photo approval status
        order.review.photos[photoIndex].isApproved = true;
        order.review.photos[photoIndex].approvedAt = new Date();
        order.review.photos[photoIndex].approvedBy = adminUserId;
        order.review.photos[photoIndex].rejectedReason = null; // Clear any previous rejection

        await order.save();

        console.log('✅ Photo approved successfully');

        res.json({
            success: true,
            message: 'Photo approved successfully',
            data: {
                orderId: order.orderId,
                photoIndex: parseInt(photoIndex),
                approvedAt: order.review.photos[photoIndex].approvedAt,
                approvedBy: adminUserId
            }
        });

    } catch (error) {
        console.error('❌ Error approving photo:', error);
        next(error);
    }
});

// @route   POST /admin/reviews/:orderId/photos/:photoIndex/reject
// @desc    Reject a photo in a review
// @access  Private (Admin)
router.post('/reviews/:orderId/photos/:photoIndex/reject', [
    body('reason').optional().trim().isLength({ max: 200 })
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

        const { orderId, photoIndex } = req.params;
        const { reason } = req.body;

        console.log('❌ [DEBUG] Rejecting photo - Order:', orderId, 'Photo index:', photoIndex);
        console.log('📝 [DEBUG] Rejection reason:', reason || 'No reason provided');

        const order = await Order.findOne({
            $or: [
                { _id: orderId },
                { orderId: orderId }
            ]
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        if (!order.review || !order.review.photos || !order.review.photos[photoIndex]) {
            return res.status(404).json({
                success: false,
                error: 'Photo not found'
            });
        }

        // Mark photo as rejected (keep isApproved: false)
        order.review.photos[photoIndex].isApproved = false;
        order.review.photos[photoIndex].rejectedReason = reason || 'Uygunsuz içerik';
        order.review.photos[photoIndex].approvedAt = null;
        order.review.photos[photoIndex].approvedBy = null;

        await order.save();

        console.log('✅ Photo rejected successfully');

        res.json({
            success: true,
            message: 'Photo rejected successfully',
            data: {
                orderId: order.orderId,
                photoIndex: parseInt(photoIndex),
                rejectedReason: reason || 'Uygunsuz içerik'
            }
        });

    } catch (error) {
        console.error('❌ Error rejecting photo:', error);
        next(error);
    }
});

// @route   GET /admin/reviews/approved
// @desc    Get approved photo reviews
// @access  Private (Admin)
router.get('/reviews/approved', [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
], async (req, res, next) => {
    try {
        const page = req.query.page || 1;
        const limit = req.query.limit || 20;
        const skip = (page - 1) * limit;

        const orders = await Order.find({
            'review.isRated': true,
            'review.photos': {
                $elemMatch: { isApproved: true }
            }
        })
        .sort({ 'review.photos.approvedAt': -1 })
        .skip(skip)
        .limit(limit)
        .lean();

        const total = await Order.countDocuments({
            'review.isRated': true,
            'review.photos': {
                $elemMatch: { isApproved: true }
            }
        });

        const reviews = orders.map(order => ({
            _id: order._id,
            orderId: order.orderId,
            customer: {
                id: order.customer?.id,
                name: order.customer?.name || 'Unknown',
                email: order.customer?.email || ''
            },
            restaurant: {
                id: order.restaurant?.id,
                name: order.restaurant?.name || 'Unknown Restaurant'
            },
            review: {
                rating: order.review?.rating,
                comment: order.review?.comment || '',
                photos: order.review?.photos?.filter(photo => photo.isApproved) || [],
                reviewedAt: order.review?.reviewedAt
            },
            totalPrice: order.totalPrice || 0,
            createdAt: order.createdAt
        }));

        res.json({
            success: true,
            data: {
                reviews,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('❌ Error fetching approved reviews:', error);
        next(error);
    }
});

// @route   GET /admin/reviews/rejected
// @desc    Get rejected photo reviews
// @access  Private (Admin)
router.get('/reviews/rejected', [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
], async (req, res, next) => {
    try {
        const page = req.query.page || 1;
        const limit = req.query.limit || 20;
        const skip = (page - 1) * limit;

        const orders = await Order.find({
            'review.isRated': true,
            'review.photos': {
                $elemMatch: {
                    isApproved: false,
                    rejectedReason: { $exists: true, $ne: null }
                }
            }
        })
        .sort({ 'review.reviewedAt': -1 })
        .skip(skip)
        .limit(limit)
        .lean();

        const total = await Order.countDocuments({
            'review.isRated': true,
            'review.photos': {
                $elemMatch: {
                    isApproved: false,
                    rejectedReason: { $exists: true, $ne: null }
                }
            }
        });

        const reviews = orders.map(order => ({
            _id: order._id,
            orderId: order.orderId,
            customer: {
                id: order.customer?.id,
                name: order.customer?.name || 'Unknown',
                email: order.customer?.email || ''
            },
            restaurant: {
                id: order.restaurant?.id,
                name: order.restaurant?.name || 'Unknown Restaurant'
            },
            review: {
                rating: order.review?.rating,
                comment: order.review?.comment || '',
                photos: order.review?.photos?.filter(photo => photo.rejectedReason) || [],
                reviewedAt: order.review?.reviewedAt
            },
            totalPrice: order.totalPrice || 0,
            createdAt: order.createdAt
        }));

        res.json({
            success: true,
            data: {
                reviews,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('❌ Error fetching rejected reviews:', error);
        next(error);
    }
});

// ============================================================
// TREASURY (KASA) ENDPOINTS - Commission & Settlement
// ============================================================

// @route   GET /admin/treasury/overview
// @desc    Get treasury overview (revenue, pending settlements, etc.)
// @access  Private (Admin)
router.get('/treasury/overview', [
    query('startDate').optional().isISO8601().toDate(),
    query('endDate').optional().isISO8601().toDate()
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

        const { startDate, endDate } = req.query;

        // Build date filter
        const dateFilter = {};
        if (startDate || endDate) {
            dateFilter['commission.calculatedAt'] = {};
            if (startDate) dateFilter['commission.calculatedAt'].$gte = startDate;
            if (endDate) dateFilter['commission.calculatedAt'].$lte = endDate;
        }

        // Get all paid orders with commission calculated
        const orders = await Order.find({
            paymentStatus: 'paid',
            'commission.calculatedAt': { $ne: null },
            ...dateFilter
        }).lean();

        // Calculate totals
        const totalRevenue = orders.reduce((sum, order) => sum + (order.commission?.platformRevenue || 0), 0);
        const totalRestaurantPayout = orders.reduce((sum, order) => sum + (order.commission?.restaurantPayout || 0), 0);
        const totalOrders = orders.length;
        const averageCommissionRate = orders.length > 0
            ? orders.reduce((sum, order) => sum + (order.commission?.rate || 10), 0) / orders.length
            : 10;

        // Get pending settlements
        const pendingSettlements = await Order.aggregate([
            {
                $match: {
                    'settlement.status': 'pending',
                    'commission.calculatedAt': { $ne: null }
                }
            },
            {
                $group: {
                    _id: '$restaurant.id',
                    restaurantName: { $first: '$restaurant.name' },
                    pendingAmount: { $sum: '$commission.restaurantPayout' },
                    orderCount: { $sum: 1 },
                    nextSettlement: { $min: '$settlement.scheduledDate' }
                }
            },
            { $sort: { pendingAmount: -1 } }
        ]);

        const totalPendingAmount = pendingSettlements.reduce((sum, item) => sum + item.pendingAmount, 0);

        // Get completed settlements (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const completedSettlements = await Order.find({
            'settlement.status': 'completed',
            'settlement.completedDate': { $gte: thirtyDaysAgo }
        }).lean();

        const totalCompletedAmount = completedSettlements.reduce(
            (sum, order) => sum + (order.commission?.restaurantPayout || 0),
            0
        );

        res.json({
            success: true,
            data: {
                overview: {
                    totalRevenue: totalRevenue.toFixed(2),
                    totalRestaurantPayout: totalRestaurantPayout.toFixed(2),
                    totalOrders,
                    averageCommissionRate: averageCommissionRate.toFixed(2) + '%'
                },
                pending: {
                    totalAmount: totalPendingAmount.toFixed(2),
                    restaurantCount: pendingSettlements.length,
                    settlements: pendingSettlements.map(s => ({
                        restaurantId: s._id,
                        restaurantName: s.restaurantName,
                        amount: s.pendingAmount.toFixed(2),
                        orderCount: s.orderCount,
                        nextSettlement: s.nextSettlement
                    }))
                },
                completed: {
                    last30Days: totalCompletedAmount.toFixed(2),
                    count: completedSettlements.length
                }
            }
        });

    } catch (error) {
        console.error('❌ Error fetching treasury overview:', error);
        next(error);
    }
});

// @route   GET /admin/treasury/settlements
// @desc    Get all settlements with filtering
// @access  Private (Admin)
router.get('/treasury/settlements', [
    query('status').optional().isIn(['pending', 'processing', 'completed', 'failed']),
    query('restaurantId').optional().isMongoId(),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
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

        const { status, restaurantId, page = 1, limit = 50 } = req.query;
        const skip = (page - 1) * limit;

        // Build filter
        const filter = {
            'commission.calculatedAt': { $ne: null }
        };

        if (status) {
            filter['settlement.status'] = status;
        }

        if (restaurantId) {
            filter['restaurant.id'] = restaurantId;
        }

        // Get orders grouped by restaurant
        const settlements = await Order.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$restaurant.id',
                    restaurantName: { $first: '$restaurant.name' },
                    orders: {
                        $push: {
                            orderId: '$orderId',
                            totalPrice: '$totalPrice',
                            commissionRate: '$commission.rate',
                            platformRevenue: '$commission.platformRevenue',
                            restaurantPayout: '$commission.restaurantPayout',
                            settlementStatus: '$settlement.status',
                            scheduledDate: '$settlement.scheduledDate',
                            completedDate: '$settlement.completedDate',
                            orderDate: '$orderDate'
                        }
                    },
                    totalAmount: { $sum: '$commission.restaurantPayout' },
                    orderCount: { $sum: 1 },
                    nextSettlement: { $min: '$settlement.scheduledDate' }
                }
            },
            { $sort: { nextSettlement: 1 } },
            { $skip: skip },
            { $limit: limit }
        ]);

        const total = await Order.countDocuments(filter);

        res.json({
            success: true,
            data: {
                settlements: settlements.map(s => ({
                    restaurantId: s._id,
                    restaurantName: s.restaurantName,
                    totalAmount: s.totalAmount.toFixed(2),
                    orderCount: s.orderCount,
                    nextSettlement: s.nextSettlement,
                    orders: s.orders
                })),
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            }
        });

    } catch (error) {
        console.error('❌ Error fetching settlements:', error);
        next(error);
    }
});

// @route   POST /admin/treasury/settlements/complete
// @desc    Mark settlements as completed for a restaurant
// @access  Private (Admin)
router.post('/treasury/settlements/complete', [
    body('restaurantId').notEmpty().isMongoId().withMessage('Valid restaurant ID required'),
    body('orderIds').isArray({ min: 1 }).withMessage('Order IDs array required'),
    body('reference').optional().trim().isLength({ max: 100 }),
    body('notes').optional().trim().isLength({ max: 500 })
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

        const { restaurantId, orderIds, reference, notes } = req.body;
        const adminUserId = req.user.id;

        // Get orders
        const orders = await Order.find({
            orderId: { $in: orderIds },
            'restaurant.id': restaurantId,
            'settlement.status': 'pending'
        });

        if (orders.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'No pending settlements found for these orders'
            });
        }

        // Calculate total payout
        let totalPayout = 0;

        // Update each order
        for (const order of orders) {
            order.settlement.status = 'completed';
            order.settlement.completedDate = new Date();
            order.settlement.reference = reference || `TRF-${Date.now()}`;
            order.settlement.processedBy = adminUserId;
            order.settlement.notes = notes;
            await order.save();

            totalPayout += order.commission.restaurantPayout;
        }

        // Update restaurant wallet
        const restaurant = await Restaurant.findById(restaurantId);
        if (restaurant) {
            restaurant.wallet.pendingBalance -= totalPayout;
            restaurant.wallet.paidBalance += totalPayout;
            restaurant.wallet.lastSettlementDate = new Date();
            await restaurant.save();
        }

        console.log(`✅ Settlement completed: ₺${totalPayout.toFixed(2)} paid to ${restaurant?.name}`);

        res.json({
            success: true,
            message: 'Settlement completed successfully',
            data: {
                restaurantId,
                restaurantName: restaurant?.name,
                orderCount: orders.length,
                totalPayout: totalPayout.toFixed(2),
                reference: reference || `TRF-${Date.now()}`,
                completedAt: new Date()
            }
        });

    } catch (error) {
        console.error('❌ Error completing settlement:', error);
        next(error);
    }
});

// @route   GET /admin/treasury/commission-settings
// @desc    Get commission settings (default rate and restaurant-specific rates)
// @access  Private (Admin)
router.get('/treasury/commission-settings', async (req, res, next) => {
    try {
        // Get restaurants with custom commission rates
        const customRates = await Restaurant.find({
            customCommissionRate: { $ne: null }
        }).select('_id name customCommissionRate commissionReason').lean();

        res.json({
            success: true,
            data: {
                defaultRate: 10, // Default 10%
                customRates: customRates.map(r => ({
                    restaurantId: r._id,
                    restaurantName: r.name,
                    rate: r.customCommissionRate,
                    reason: r.commissionReason
                }))
            }
        });

    } catch (error) {
        console.error('❌ Error fetching commission settings:', error);
        next(error);
    }
});

// @route   PATCH /admin/treasury/commission-settings/custom
// @desc    Set custom commission rate for a restaurant
// @access  Private (Admin)
router.patch('/treasury/commission-settings/custom', [
    body('restaurantId').notEmpty().isMongoId().withMessage('Valid restaurant ID required'),
    body('rate').notEmpty().isFloat({ min: 0, max: 100 }).withMessage('Rate must be between 0 and 100'),
    body('reason').optional().trim().isLength({ max: 200 })
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

        const { restaurantId, rate, reason } = req.body;

        const restaurant = await Restaurant.findById(restaurantId);
        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant not found'
            });
        }

        restaurant.customCommissionRate = rate;
        restaurant.commissionReason = reason || `Custom rate set to ${rate}%`;
        await restaurant.save();

        console.log(`✅ Custom commission rate set: ${restaurant.name} → ${rate}%`);

        res.json({
            success: true,
            message: 'Custom commission rate updated',
            data: {
                restaurantId: restaurant._id,
                restaurantName: restaurant.name,
                rate: rate,
                reason: restaurant.commissionReason
            }
        });

    } catch (error) {
        console.error('❌ Error updating custom commission rate:', error);
        next(error);
    }
});

module.exports = router;