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
        }).select('name description category address location rating stats serviceOptions deliveryInfo images openingHours packages');

        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant not found or not active'
            });
        }

        // Include active packages for mobile app
        const restaurantData = {
            ...restaurant.toObject(),
            packages: restaurant.packages?.filter(pkg => pkg.status === 'active').map(pkg => ({
                id: pkg.id,
                name: pkg.name,
                description: pkg.description,
                price: pkg.price,
                originalPrice: pkg.originalPrice,
                discountedPrice: pkg.discountedPrice,
                quantity: pkg.quantity,
                category: pkg.category,
                tags: pkg.tags,
                availableUntil: pkg.availableUntil,
                createdAt: pkg.createdAt
            })) || []
        };

        res.json({
            success: true,
            data: restaurantData
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /public/packages
// @desc    Get all active packages for mobile app
// @access  Public
router.get('/packages', async (req, res, next) => {
    try {
        const Restaurant = require('../models/Restaurant');
        const { category, restaurant, city, minPrice, maxPrice, limit = 50, page = 1 } = req.query;
        
        // Build filter for active restaurants
        const restaurantFilter = { 
            status: 'active',
            isVerified: true 
        };
        
        if (restaurant) {
            restaurantFilter.name = { $regex: restaurant, $options: 'i' };
        }
        
        if (city) {
            restaurantFilter['address.city'] = { $regex: city, $options: 'i' };
        }

        const restaurants = await Restaurant.find(restaurantFilter)
            .select('name category address location images rating packages');

        // Collect all packages with restaurant info
        let allPackages = [];
        
        restaurants.forEach(restaurant => {
            if (restaurant.packages && restaurant.packages.length > 0) {
                restaurant.packages.forEach(pkg => {
                    // Apply filters
                    if (pkg.status !== 'active') return;
                    if (category && pkg.category !== category) return;
                    if (minPrice && pkg.price < parseFloat(minPrice)) return;
                    if (maxPrice && pkg.price > parseFloat(maxPrice)) return;

                    allPackages.push({
                        id: pkg.id,
                        name: pkg.name,
                        description: pkg.description,
                        price: pkg.price,
                        originalPrice: pkg.originalPrice,
                        discountedPrice: pkg.discountedPrice,
                        quantity: pkg.quantity,
                        category: pkg.category,
                        tags: pkg.tags,
                        availableUntil: pkg.availableUntil,
                        createdAt: pkg.createdAt,
                        restaurant: {
                            id: restaurant._id,
                            name: restaurant.name,
                            category: restaurant.category,
                            rating: restaurant.rating?.average || 0,
                            image: restaurant.images?.cover || restaurant.images?.logo,
                            address: {
                                district: restaurant.address?.district,
                                city: restaurant.address?.city
                            }
                        }
                    });
                });
            }
        });

        // Sort by creation date (newest first)
        allPackages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const paginatedPackages = allPackages.slice(skip, skip + parseInt(limit));

        res.json({
            success: true,
            data: {
                packages: paginatedPackages,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: allPackages.length,
                    pages: Math.ceil(allPackages.length / parseInt(limit))
                },
                filters: {
                    category: category || null,
                    restaurant: restaurant || null,
                    city: city || null,
                    priceRange: minPrice || maxPrice ? { min: minPrice, max: maxPrice } : null
                }
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /public/categories
// @desc    Get all available restaurant categories for mobile app
// @access  Public
router.get('/categories', async (req, res, next) => {
    try {
        const Restaurant = require('../models/Restaurant');
        
        const categories = await Restaurant.aggregate([
            { $match: { status: 'active', isVerified: true } },
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const formattedCategories = categories.map(cat => ({
            name: cat._id,
            count: cat.count
        }));

        res.json({
            success: true,
            data: {
                categories: formattedCategories,
                total: formattedCategories.length
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /public/cities
// @desc    Get all available cities for mobile app
// @access  Public
router.get('/cities', async (req, res, next) => {
    try {
        const Restaurant = require('../models/Restaurant');
        
        const cities = await Restaurant.aggregate([
            { $match: { status: 'active', isVerified: true } },
            { $group: { _id: '$address.city', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const formattedCities = cities.map(city => ({
            name: city._id,
            count: city.count
        }));

        res.json({
            success: true,
            data: {
                cities: formattedCities,
                total: formattedCities.length
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /public/stats
// @desc    Get public statistics for homepage
// @access  Public
router.get('/stats', async (req, res, next) => {
    try {
        const Restaurant = require('../models/Restaurant');
        const Application = require('../models/Application');
        
        // Count verified restaurants
        const totalRestaurants = await Restaurant.countDocuments({ 
            status: 'active', 
            isVerified: true 
        });
        
        // Count total packages saved (aggregate)
        const packageStats = await Restaurant.aggregate([
            { $match: { status: 'active', isVerified: true } },
            { $unwind: { path: '$packages', preserveNullAndEmptyArrays: true } },
            { $match: { 'packages.status': 'sold' } },
            { $group: { _id: null, totalPackagesSaved: { $sum: 1 } } }
        ]);
        
        const totalPackagesSaved = packageStats.length > 0 ? packageStats[0].totalPackagesSaved : 0;
        
        // Calculate CO2 saving (rough estimate: 2.5kg CO2 per package saved)
        const co2SavingKg = totalPackagesSaved * 2.5;
        let co2Saving;
        if (co2SavingKg >= 1000) {
            co2Saving = (co2SavingKg / 1000).toFixed(1) + 'T';
        } else {
            co2Saving = co2SavingKg.toFixed(0) + 'kg';
        }
        
        res.json({
            success: true,
            data: {
                totalPackagesSaved: totalPackagesSaved || 2847, // Fallback to demo
                co2Saving: co2Saving || '1.2T', // Fallback to demo  
                partnerRestaurants: totalRestaurants || 156, // Fallback to demo
                lastUpdated: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('Stats calculation error:', error);
        // Return demo stats on error
        res.json({
            success: true,
            data: {
                totalPackagesSaved: 2847,
                co2Saving: '1.2T',
                partnerRestaurants: 156,
                lastUpdated: new Date().toISOString(),
                demo: true
            }
        });
    }
});

module.exports = router;