/**
 * Authentication Routes
 * /auth/*
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Generate JWT Token
const generateToken = (user) => {
    return jwt.sign(
        { 
            id: user._id, 
            role: user.role,
            username: user.username 
        },
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

module.exports = router;