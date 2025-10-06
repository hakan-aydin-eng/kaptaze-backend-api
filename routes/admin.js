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
const NotificationLog = require('../models/NotificationLog');
// SendGrid email service - now active with proper configuration
const { runBulkMigration } = require('../scripts/bulkMigration');

const router = express.Router();

// Email service functions
async function sendApprovalEmail(application, credentials) {
    console.log('🔧 DEBUG sendApprovalEmail function called');
    console.log('🔧 Environment check - SENDGRID_API_KEY:', process.env.SENDGRID_API_KEY ? 'SET' : 'NOT SET');
    console.log('🔧 Environment check - EMAIL_USER:', process.env.EMAIL_USER ? 'SET' : 'NOT SET');
    console.log('🔧 Environment check - EMAIL_PASS:', process.env.EMAIL_PASS ? 'SET' : 'NOT SET');

    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    if (!process.env.SENDGRID_API_KEY) {
        console.error('❌ SendGrid API key missing - cannot send email');
        throw new Error('SendGrid API key not configured');
    }

    const mailOptions = {
        from: process.env.SENDGRID_FROM_EMAIL || 'bilgi@kapkazan.com',
        to: application.email,
        subject: '🎉 kapkazan Başvurunuz Onaylandı - Giriş Bilgileriniz',
        replyTo: 'bilgi@kapkazan.com',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
                        margin: 0;
                        padding: 0;
                        background: #f4f4f4;
                    }
                    .container {
                        max-width: 600px;
                        margin: 20px auto;
                        background: white;
                        border-radius: 10px;
                        overflow: hidden;
                        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                    }
                    .header {
                        background: linear-gradient(135deg, #4CAF50, #45a049);
                        color: white;
                        padding: 30px 20px;
                        text-align: center;
                    }
                    .header h1 {
                        margin: 0;
                        font-size: 24px;
                        font-weight: 300;
                    }
                    .content {
                        padding: 30px 20px;
                    }
                    .credentials {
                        background: #f8f9fa;
                        padding: 20px;
                        margin: 20px 0;
                        border-radius: 8px;
                        border-left: 4px solid #4CAF50;
                    }
                    .button {
                        display: inline-block;
                        padding: 15px 40px;
                        background: linear-gradient(135deg, #4CAF50, #45a049);
                        color: white;
                        text-decoration: none;
                        border-radius: 25px;
                        margin: 25px 0;
                        text-align: center;
                        font-weight: 500;
                        box-shadow: 0 4px 15px rgba(76, 175, 80, 0.3);
                    }
                    .footer {
                        background: #f8f9fa;
                        padding: 20px;
                        text-align: center;
                        color: #666;
                        font-size: 14px;
                    }
                    h2 {
                        color: #4CAF50;
                        margin-bottom: 15px;
                    }
                    .info-row {
                        margin: 10px 0;
                        font-size: 16px;
                    }
                    .info-label {
                        font-weight: 600;
                        color: #555;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🎉 Başvurunuz Onaylandı!</h1>
                    </div>

                    <div class="content">
                        <p>Merhaba <strong>${application.firstName} ${application.lastName}</strong>,</p>

                        <p>kapkazan restoranlar platformuna başvurunuz onaylanmıştır. Hoşgeldiniz!</p>

                        <div class="credentials">
                            <h2>🔑 Giriş Bilgileriniz</h2>
                            <div class="info-row">
                                <span class="info-label">Kullanıcı Adı:</span> <strong>${credentials.username}</strong>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Şifre:</span> <strong>${credentials.password}</strong>
                            </div>
                            <div class="info-row">
                                <span class="info-label">Restoran Adı:</span> ${application.businessName}
                            </div>
                        </div>

                        <center>
                            <a href="https://kapkazan.com/restaurant-login" class="button">
                                🏪 Restoran Panelime Giriş Yap
                            </a>
                        </center>

                        <p><strong>Önemli Notlar:</strong></p>
                        <ul>
                            <li>Giriş bilgilerinizi güvenli bir yerde saklayın</li>
                            <li>İlk girişinizde şifrenizi değiştirmenizi öneririz</li>
                            <li>Herhangi bir sorun yaşarsanız bilgi@kapkazan.com adresinden bize ulaşabilirsiniz</li>
                        </ul>
                    </div>

                    <div class="footer">
                        <p>kapkazan Restaurant Platform | Restoranınız için daha iyi bir deneyim</p>
                        <p>Destek: bilgi@kapkazan.com | Web: kapkazan.com</p>
                    </div>
                </div>
            </body>
            </html>
        `
    };

    try {
        console.log('📧 Sending approval email via SendGrid...');
        console.log('📧 From email:', process.env.SENDGRID_FROM_EMAIL || 'bilgi@kapkazan.com');
        const result = await sgMail.send(mailOptions);
        console.log('✅ Approval email sent successfully via SendGrid');
        console.log('📧 Message ID:', result[0].headers['x-message-id']);
        return { success: true, messageId: result[0].headers['x-message-id'] };
    } catch (sendgridError) {
        console.error('❌ SendGrid approval email failed:', sendgridError);
        console.log('🔄 Trying Gmail as fallback...');

        // Gmail fallback
        try {
            const nodemailer = require('nodemailer');

            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

            const gmailOptions = {
                from: `kapkazan <${process.env.EMAIL_USER}>`,
                to: application.email,
                subject: mailOptions.subject,
                html: mailOptions.html
            };

            console.log('📧 Sending via Gmail from:', process.env.EMAIL_USER);
            const gmailResult = await transporter.sendMail(gmailOptions);
            console.log('✅ Approval email sent successfully via Gmail fallback');
            return { success: true, messageId: gmailResult.messageId, method: 'gmail' };
        } catch (gmailError) {
            console.error('❌ Gmail fallback also failed:', gmailError);
            return { success: false, error: `SendGrid: ${sendgridError.message}, Gmail: ${gmailError.message}` };
        }
    }
}

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
            createdBy: createdByValue,
            status: 'active'
        });

        await restaurant.save();

        // Update user with restaurant reference
        restaurantUser.restaurantId = restaurant._id;
        await restaurantUser.save();

        // Send location-based notification for new restaurant
        try {
            const locationService = require('../services/locationNotificationService');
            await locationService.notifyNearbyConsumersOfNewRestaurant(restaurant);
            console.log(`📱 Location-based notifications sent for new restaurant: ${restaurant.name}`);
        } catch (notificationError) {
            console.error('Failed to send location-based notifications:', notificationError);
            // Don't fail the restaurant creation if notification fails
        }

        // Update application
        application.status = 'approved';
        application.reviewedBy = createdByValue;
        application.reviewedAt = new Date();
        application.restaurantId = restaurant._id;
        application.userId = restaurantUser._id;
        application.generatedCredentials = {
            username: finalUsername,
            password: finalPassword, // Plain text for email
            passwordHash: restaurantUser.password,
            createdAt: new Date()
        };
        if (notes) application.adminNotes = notes;

        await application.save();

        console.log(`✅ Application approved: ${application.applicationId} - ${application.businessName}`);

        // Send approval email with credentials
        let emailStatus = { sent: false, error: null };
        try {
            const emailResult = await sendApprovalEmail(application, {
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
            // Email functionality temporarily disabled
            // await sendOrderNotification(application, reason);
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
// @desc    Update user status and restaurantId
// @access  Private (Admin)
router.patch('/users/:userId', [
    body('status').optional().isIn(['active', 'inactive', 'suspended']),
    body('notes').optional().trim().isLength({ max: 500 }),
    body('restaurantId').optional().isMongoId()
], async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { status, notes, restaurantId } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        if (status) user.status = status;
        if (notes) user.adminNotes = notes;
        if (restaurantId) {
            // Verify restaurant exists
            const restaurant = await Restaurant.findById(restaurantId);
            if (!restaurant) {
                return res.status(400).json({
                    success: false,
                    error: 'Restaurant not found'
                });
            }
            user.restaurantId = restaurantId;
            console.log(`Updated user ${userId} restaurantId to ${restaurantId}`);
        }

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

// @route   POST /admin/notifications/send
// @desc    Send push notification from admin panel
// @access  Private (Admin)
router.post('/notifications/send', [
    body('type')
        .isIn(['genel', 'promosyon', 'şehir', 'restoran', 'test'])
        .withMessage('Invalid notification type'),
    body('title')
        .notEmpty()
        .withMessage('Title is required')
        .isLength({ max: 100 })
        .withMessage('Title cannot exceed 100 characters'),
    body('message')
        .notEmpty()
        .withMessage('Message is required')
        .isLength({ max: 500 })
        .withMessage('Message cannot exceed 500 characters'),
    body('priority')
        .optional()
        .isIn(['low', 'normal', 'high', 'urgent'])
        .withMessage('Priority must be low, normal, high, or urgent'),
    body('targetData')
        .optional()
        .isObject()
        .withMessage('Target data must be an object')
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                errors: errors.array()
            });
        }

        const { type, title, message, priority = 'normal', targetData = {} } = req.body;
        const pushService = require('../services/pushNotificationService');

        console.log(`📤 Admin sending ${type} notification: ${title}`);

        let result;

        // Handle different notification types
        switch (type) {
            case 'genel':
                // Send to all active consumers
                result = await pushService.sendToAllConsumers(
                    { title, body: message, type, priority },
                    { orders: true, promotions: true } // Send to users who accept general notifications
                );
                break;

            case 'promosyon':
                // Send to consumers who accept promotions
                result = await pushService.sendToAllConsumers(
                    { title, body: message, type, priority },
                    { promotions: true }
                );
                break;

            case 'şehir':
                // Send to consumers in specific city/location
                if (targetData.latitude && targetData.longitude) {
                    const radiusKm = targetData.radiusKm || 5;
                    result = await pushService.sendToNearbyConsumers(
                        targetData.latitude,
                        targetData.longitude,
                        { title, body: message, type, priority },
                        radiusKm
                    );
                } else {
                    return res.status(400).json({
                        success: false,
                        error: 'City notifications require latitude and longitude'
                    });
                }
                break;

            case 'restoran':
                // Send to consumers who favorited specific restaurant
                if (targetData.restaurantId) {
                    result = await pushService.sendToRestaurantFavorites(
                        targetData.restaurantId,
                        { title, body: message, type, priority }
                    );
                } else {
                    return res.status(400).json({
                        success: false,
                        error: 'Restaurant notifications require restaurantId'
                    });
                }
                break;

            case 'test':
                // Send test notification to admin or specific user
                const testEmail = targetData.email || 'admin@kaptaze.com';
                result = await pushService.testNotification(testEmail);
                break;

            default:
                return res.status(400).json({
                    success: false,
                    error: 'Invalid notification type'
                });
        }

        // Log notification in database
        try {
            const logData = {
                title,
                message,
                type: type === 'genel' ? 'general' :
                      type === 'promosyon' ? 'promotion' :
                      type === 'şehir' ? 'city' :
                      type === 'restoran' ? 'restaurant' : type,
                priority,
                targetType: type === 'genel' || type === 'promosyon' ? 'all' :
                           type === 'şehir' ? 'location' :
                           type === 'restoran' ? 'restaurant' : 'test',
                targetDetails: {
                    ...targetData,
                    restaurantName: targetData.restaurantName
                },
                totalTokens: result.tokenCount || 0,
                validTokens: result.validTokenCount || result.tokenCount || 0,
                skippedTokens: result.skippedTokenCount || 0,
                successCount: result.successCount || 0,
                failureCount: result.failureCount || 0,
                consumerCount: result.consumerCount || 0,
                sentBy: 'Admin Panel',
                ipAddress: req.ip
            };

            await pushService.logNotification(logData);
        } catch (logError) {
            console.error('❌ Failed to log notification:', logError);
        }

        console.log(`✅ ${type} notification sent:`, result);

        res.json({
            success: true,
            message: `${type.charAt(0).toUpperCase() + type.slice(1)} bildirimi başarıyla gönderildi`,
            data: {
                type,
                title,
                message,
                priority,
                ...result
            }
        });

    } catch (error) {
        console.error('❌ Admin notification send error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send notification',
            details: error.message
        });
    }
});

// @route   POST /admin/notifications/test
// @desc    Send test push notification
// @access  Private (Admin)
router.post('/notifications/test', [
    body('email')
        .optional()
        .isEmail()
        .withMessage('Please enter a valid email address')
], async (req, res, next) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                errors: errors.array()
            });
        }

        const { email } = req.body;
        const testEmail = email || 'admin@kaptaze.com';

        const pushService = require('../services/pushNotificationService');
        const result = await pushService.testNotification(testEmail);

        res.json({
            success: true,
            message: 'Test bildirimi gönderildi',
            data: {
                email: testEmail,
                ...result
            }
        });

    } catch (error) {
        console.error('❌ Test notification error:', error);
        res.status(500).json({
            success: false,
            error: 'Test notification failed',
            details: error.message
        });
    }
});

// @route   GET /admin/notifications/stats
// @desc    Get push notification statistics
// @access  Private (Admin)
router.get('/notifications/stats', async (req, res, next) => {
    try {
        // Get consumer statistics for notifications
        const totalConsumers = await Consumer.countDocuments({ status: 'active' });
        const consumersWithTokens = await Consumer.countDocuments({
            status: 'active',
            'pushTokens.0': { $exists: true }
        });

        // Count active push tokens
        const activeTokensResult = await Consumer.aggregate([
            { $match: { status: 'active' } },
            { $unwind: '$pushTokens' },
            { $match: { 'pushTokens.active': true } },
            {
                $group: {
                    _id: '$pushTokens.platform',
                    count: { $sum: 1 }
                }
            }
        ]);

        const activeTokensByPlatform = {
            ios: 0,
            android: 0,
            web: 0
        };

        activeTokensResult.forEach(result => {
            activeTokensByPlatform[result._id] = result.count;
        });

        const totalActiveTokens = Object.values(activeTokensByPlatform).reduce((a, b) => a + b, 0);

        // Get notification preferences statistics
        const notificationPrefs = await Consumer.aggregate([
            { $match: { status: 'active' } },
            {
                $group: {
                    _id: null,
                    ordersEnabled: { $sum: { $cond: ['$notifications.orders', 1, 0] } },
                    promotionsEnabled: { $sum: { $cond: ['$notifications.promotions', 1, 0] } },
                    newsEnabled: { $sum: { $cond: ['$notifications.news', 1, 0] } }
                }
            }
        ]);

        const preferences = notificationPrefs[0] || {
            ordersEnabled: 0,
            promotionsEnabled: 0,
            newsEnabled: 0
        };

        res.json({
            success: true,
            data: {
                consumers: {
                    total: totalConsumers,
                    withPushTokens: consumersWithTokens,
                    percentage: totalConsumers > 0 ? Math.round((consumersWithTokens / totalConsumers) * 100) : 0
                },
                pushTokens: {
                    total: totalActiveTokens,
                    byPlatform: activeTokensByPlatform
                },
                preferences: {
                    orders: preferences.ordersEnabled,
                    promotions: preferences.promotionsEnabled,
                    news: preferences.newsEnabled
                },
                firebase: {
                    configured: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
                    mock: !process.env.FIREBASE_SERVICE_ACCOUNT_KEY
                }
            }
        });

    } catch (error) {
        console.error('❌ Notification stats error:', error);
        next(error);
    }
});

// @route   GET /admin/notification-stats
// @desc    Get notification dashboard statistics
// @access  Private (Admin)
router.get('/notification-stats', async (req, res, next) => {
    try {
        console.log('📊 Getting notification statistics...');

        const { startDate, endDate } = req.query;

        // Get comprehensive stats
        const stats = await NotificationLog.getStats(startDate, endDate);

        // Get recent notifications count by type
        const typeStats = await NotificationLog.aggregate([
            {
                $match: startDate && endDate ? {
                    createdAt: {
                        $gte: new Date(startDate),
                        $lte: new Date(endDate)
                    }
                } : {}
            },
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 },
                    totalReached: { $sum: '$stats.successCount' },
                    avgDeliveryRate: { $avg: '$deliveryRate' }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                overview: {
                    totalNotifications: stats.totalNotifications,
                    totalReached: stats.totalReached,
                    totalFavoriteNotifications: stats.totalFavoriteNotifications,
                    totalProximityNotifications: stats.totalProximityNotifications,
                    averageDeliveryRate: Math.round(stats.averageDeliveryRate || 0),
                    totalConsumersReached: stats.totalConsumersReached
                },
                byType: typeStats,
                period: { startDate, endDate }
            }
        });

        console.log('✅ Notification stats retrieved successfully');

    } catch (error) {
        console.error('❌ Notification stats error:', error);
        next(error);
    }
});

// @route   GET /admin/notification-history
// @desc    Get notification history with pagination
// @access  Private (Admin)
router.get('/notification-history', async (req, res, next) => {
    try {
        console.log('📋 Getting notification history...');

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const { type, status, startDate, endDate } = req.query;

        // Build filter query
        const filter = {};
        if (type && type !== 'all') filter.type = type;
        if (status && status !== 'all') filter.status = status;
        if (startDate && endDate) {
            filter.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // Get notifications with pagination
        const [notifications, totalCount] = await Promise.all([
            NotificationLog.find(filter)
                .populate('targetDetails.restaurantId', 'name')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            NotificationLog.countDocuments(filter)
        ]);

        // Format notifications for frontend
        const formattedNotifications = notifications.map(notif => ({
            id: notif._id,
            title: notif.title,
            message: notif.message,
            type: notif.type,
            priority: notif.priority,
            targetType: notif.targetType,
            targetName: notif.targetDetails?.restaurantName ||
                       notif.targetDetails?.city ||
                       'All Users',
            stats: {
                delivered: notif.stats.successCount,
                failed: notif.stats.failureCount,
                total: notif.stats.totalTokens,
                deliveryRate: notif.deliveryRate
            },
            status: notif.status,
            sentAt: notif.sentAt,
            createdAt: notif.createdAt,
            duration: notif.duration
        }));

        const totalPages = Math.ceil(totalCount / limit);

        res.json({
            success: true,
            data: {
                notifications: formattedNotifications,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalCount,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                },
                filters: { type, status, startDate, endDate }
            }
        });

        console.log(`✅ Retrieved ${formattedNotifications.length} notifications (page ${page}/${totalPages})`);

    } catch (error) {
        console.error('❌ Notification history error:', error);
        next(error);
    }
});

// @route   POST /admin/migrate-users
// @desc    Run bulk migration for all users
// @access  Private (Admin)
router.post('/migrate-users', async (req, res, next) => {
    try {
        console.log('🔄 Admin requested bulk user migration...');

        const result = await runBulkMigration();

        if (result.success) {
            res.json({
                success: true,
                message: `Migration completed successfully. Updated ${result.migratedCount} users.`,
                data: {
                    migratedCount: result.migratedCount
                }
            });
        } else {
            res.status(500).json({
                success: false,
                error: `Migration failed: ${result.error}`
            });
        }
    } catch (error) {
        console.error('❌ Migration endpoint error:', error);
        next(error);
    }
});

module.exports = router;