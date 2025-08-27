/**
 * Authentication & Authorization Middleware
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Consumer = require('../models/Consumer');

// Verify JWT Token
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Access denied. No token provided or invalid format.'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            let user;
            
            // Check if token is for consumer or system user
            if (decoded.userType === 'consumer') {
                // Get consumer from database
                user = await Consumer.findById(decoded.id).select('-password');
                if (user) {
                    user.userType = 'consumer'; // Add userType for identification
                }
            } else {
                // Get system user (admin/restaurant) from database
                user = await User.findById(decoded.id).select('-password');
                if (user) {
                    user.userType = 'user'; // Add userType for identification
                }
            }
            
            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: 'Token valid but user not found'
                });
            }

            if (user.status !== 'active') {
                return res.status(401).json({
                    success: false,
                    error: 'Account is not active'
                });
            }

            req.user = user;
            next();
        } catch (tokenError) {
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({
            success: false,
            error: 'Authentication error'
        });
    }
};

// Check if user has required role
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Access denied. Please authenticate first.'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: `Access denied. Required roles: ${roles.join(', ')}`
            });
        }

        next();
    };
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.id).select('-password');
                
                if (user && user.status === 'active') {
                    req.user = user;
                }
            } catch (tokenError) {
                // Token invalid, but that's okay for optional auth
                console.log('Optional auth: Invalid token, continuing without user');
            }
        }
        
        next();
    } catch (error) {
        console.error('Optional auth middleware error:', error);
        next(); // Continue without auth
    }
};

module.exports = {
    authenticate,
    authorize,
    optionalAuth
};