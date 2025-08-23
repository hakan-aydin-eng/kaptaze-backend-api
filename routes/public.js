/**
 * Public Routes
 * /public/*
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const Application = require('../models/Application');

const router = express.Router();

// @route   POST /public/applications
// @desc    Submit restaurant application
// @access  Public
router.post('/applications', [
    body('firstName')
        .trim()
        .notEmpty()
        .withMessage('First name is required')
        .isLength({ max: 50 })
        .withMessage('First name cannot exceed 50 characters'),
    body('lastName')
        .trim()
        .notEmpty()
        .withMessage('Last name is required')
        .isLength({ max: 50 })
        .withMessage('Last name cannot exceed 50 characters'),
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),
    body('phone')
        .trim()
        .notEmpty()
        .withMessage('Phone number is required')
        .matches(/^\+?[\d\s-()]+$/)
        .withMessage('Please provide a valid phone number'),
    body('businessName')
        .trim()
        .notEmpty()
        .withMessage('Business name is required')
        .isLength({ max: 100 })
        .withMessage('Business name cannot exceed 100 characters'),
    body('businessCategory')
        .trim()
        .notEmpty()
        .withMessage('Business category is required'),
    body('businessAddress')
        .trim()
        .notEmpty()
        .withMessage('Business address is required'),
    body('city')
        .trim()
        .notEmpty()
        .withMessage('City is required'),
    body('district')
        .trim()
        .notEmpty()
        .withMessage('District is required'),
    body('businessLatitude')
        .optional()
        .isFloat({ min: -90, max: 90 })
        .withMessage('Invalid latitude'),
    body('businessLongitude')
        .optional()
        .isFloat({ min: -180, max: 180 })
        .withMessage('Invalid longitude')
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

        // Check if email already exists
        const existingApplication = await Application.findOne({ email: req.body.email });
        if (existingApplication) {
            return res.status(409).json({
                success: false,
                error: 'An application with this email already exists'
            });
        }

        // Get client info for security tracking
        const clientInfo = {
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent')
        };

        // Create application
        const applicationData = {
            ...req.body,
            ...clientInfo,
            source: 'web_form'
        };

        const application = new Application(applicationData);
        await application.save();

        console.log(`✅ New application received: ${application.applicationId} - ${application.businessName}`);

        // TODO: Send email notification to admin
        // TODO: Send confirmation email to applicant

        res.status(201).json({
            success: true,
            message: 'Application submitted successfully',
            data: {
                applicationId: application.applicationId,
                businessName: application.businessName,
                status: application.status,
                submittedAt: application.createdAt
            }
        });

    } catch (error) {
        console.error('Application submission error:', error);
        next(error);
    }
});

// @route   GET /public/applications/:applicationId
// @desc    Get application status (public lookup)
// @access  Public
router.get('/applications/:applicationId', async (req, res, next) => {
    try {
        const { applicationId } = req.params;

        const application = await Application.findOne({ applicationId })
            .select('applicationId businessName status createdAt reviewedAt');

        if (!application) {
            return res.status(404).json({
                success: false,
                error: 'Application not found'
            });
        }

        res.json({
            success: true,
            data: {
                applicationId: application.applicationId,
                businessName: application.businessName,
                status: application.status,
                submittedAt: application.createdAt,
                reviewedAt: application.reviewedAt
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /public/restaurants
// @desc    Get public restaurant list
// @access  Public
router.get('/restaurants', async (req, res, next) => {
    try {
        const Restaurant = require('../models/Restaurant');
        
        const { 
            search, 
            category, 
            latitude, 
            longitude, 
            maxDistance = 10000,
            limit = 20,
            page = 1 
        } = req.query;

        let query = Restaurant.find({ status: 'active' });

        // Text search
        if (search) {
            query = query.find({
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { category: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } }
                ]
            });
        }

        // Category filter
        if (category) {
            query = query.find({ category });
        }

        // Location-based search
        if (latitude && longitude) {
            query = query.find({
                location: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [parseFloat(longitude), parseFloat(latitude)]
                        },
                        $maxDistance: parseInt(maxDistance)
                    }
                }
            });
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        query = query.skip(skip).limit(parseInt(limit));

        // Sort by rating and order count
        query = query.sort({ 'rating.average': -1, 'stats.totalOrders': -1 });

        // Select public fields only
        query = query.select('name description category address location rating stats serviceOptions deliveryInfo images');

        const restaurants = await query.exec();
        const total = await Restaurant.countDocuments(query.getFilter());

        res.json({
            success: true,
            data: {
                restaurants,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /public/restaurants/:restaurantId
// @desc    Get public restaurant details
// @access  Public
router.get('/restaurants/:restaurantId', async (req, res, next) => {
    try {
        const Restaurant = require('../models/Restaurant');
        const { restaurantId } = req.params;

        const restaurant = await Restaurant.findOne({ 
            _id: restaurantId, 
            status: 'active' 
        }).select('name description category address location rating stats serviceOptions deliveryInfo images openingHours');

        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant not found or not active'
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

module.exports = router;