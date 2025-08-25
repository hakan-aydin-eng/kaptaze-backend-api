/**
 * Order Routes - Mobile App
 * /orders/*
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');

const router = express.Router();

// @route   POST /orders
// @desc    Create new order from mobile app
// @access  Public (for mobile app customers)
router.post('/', [
    body('customer.name').trim().notEmpty().withMessage('Customer name is required'),
    body('customer.email').isEmail().withMessage('Valid email is required'),
    body('customer.phone').trim().notEmpty().withMessage('Phone number is required'),
    body('restaurant.id').notEmpty().withMessage('Restaurant ID is required'),
    body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
    body('items.*.packageId').notEmpty().withMessage('Package ID is required'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('Valid quantity is required'),
    body('delivery.type').isIn(['delivery', 'pickup']).withMessage('Valid delivery type required')
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

        const { customer, restaurant: restaurantInfo, items, delivery, notes } = req.body;

        // Verify restaurant exists and is active
        const restaurant = await Restaurant.findOne({
            _id: restaurantInfo.id,
            status: 'active',
            isVerified: true
        });

        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant not found or not active'
            });
        }

        // Process items and calculate pricing
        const processedItems = [];
        let subtotal = 0;

        for (const item of items) {
            // Find package in restaurant
            const packageItem = restaurant.packages?.find(pkg => 
                pkg.id === item.packageId && pkg.status === 'active'
            );

            if (!packageItem) {
                return res.status(404).json({
                    success: false,
                    error: `Package ${item.packageId} not found or not available`
                });
            }

            const itemTotal = packageItem.price * item.quantity;
            subtotal += itemTotal;

            processedItems.push({
                packageId: item.packageId,
                name: packageItem.name,
                description: packageItem.description,
                price: packageItem.price,
                quantity: item.quantity,
                totalPrice: itemTotal
            });
        }

        // Calculate delivery fee
        const deliveryFee = delivery.type === 'delivery' ? (restaurant.deliveryInfo?.fee || 0) : 0;
        
        // Create order
        const order = new Order({
            customer: {
                id: customer.id || `guest_${Date.now()}`,
                name: customer.name,
                email: customer.email,
                phone: customer.phone
            },
            restaurant: {
                id: restaurant._id,
                name: restaurant.name,
                phone: restaurant.phone,
                address: restaurant.address
            },
            items: processedItems,
            pricing: {
                subtotal: subtotal,
                deliveryFee: deliveryFee,
                tax: 0, // Tax calculation can be added here
                discount: 0, // Discount logic can be added here
                total: subtotal + deliveryFee
            },
            delivery: {
                type: delivery.type,
                address: delivery.address || null,
                estimatedTime: restaurant.deliveryInfo?.estimatedTime || 30
            },
            notes: notes || '',
            estimatedDeliveryTime: new Date(Date.now() + (restaurant.deliveryInfo?.estimatedTime || 30) * 60000)
        });

        // Add initial status to history
        order.statusHistory.push({
            status: 'pending',
            timestamp: new Date(),
            note: 'Order created from mobile app'
        });

        await order.save();

        console.log(`📱 New mobile order: ${order.orderId} from ${customer.name} to ${restaurant.name}`);

        res.status(201).json({
            success: true,
            message: 'Order created successfully',
            data: {
                orderId: order.orderId,
                status: order.status,
                estimatedDeliveryTime: order.estimatedDeliveryTime,
                total: order.pricing.total,
                restaurant: {
                    name: restaurant.name,
                    phone: restaurant.phone
                }
            }
        });

    } catch (error) {
        console.error('Order creation error:', error);
        next(error);
    }
});

// @route   GET /orders/:orderId
// @desc    Get order details by order ID
// @access  Public
router.get('/:orderId', async (req, res, next) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findOne({ orderId })
            .populate('restaurant.id', 'name phone address');

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        res.json({
            success: true,
            data: order
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /orders/customer/:customerId
// @desc    Get customer's order history
// @access  Public
router.get('/customer/:customerId', async (req, res, next) => {
    try {
        const { customerId } = req.params;
        const { status, limit = 20, page = 1 } = req.query;

        const filter = { 'customer.id': customerId };
        if (status) {
            filter.status = status;
        }

        const orders = await Order.find(filter)
            .sort({ orderDate: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .select('orderId restaurant.name status pricing.total orderDate items.length');

        const total = await Order.countDocuments(filter);

        res.json({
            success: true,
            data: {
                orders: orders,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   PATCH /orders/:orderId/status
// @desc    Update order status (for restaurant use)
// @access  Public (in real app, this should be protected)
router.patch('/:orderId/status', [
    body('status').isIn(['pending', 'confirmed', 'preparing', 'ready', 'delivering', 'delivered', 'completed', 'cancelled'])
        .withMessage('Invalid status'),
    body('note').optional().trim().isLength({ max: 500 }).withMessage('Note too long')
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

        const { orderId } = req.params;
        const { status, note } = req.body;

        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        await order.updateStatus(status, note || '');

        console.log(`📝 Order status updated: ${orderId} → ${status}`);

        res.json({
            success: true,
            message: 'Order status updated successfully',
            data: {
                orderId: order.orderId,
                status: order.status,
                updatedAt: new Date()
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   POST /orders/:orderId/review
// @desc    Add customer review for completed order
// @access  Public
router.post('/:orderId/review', [
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1-5'),
    body('comment').optional().trim().isLength({ max: 500 }).withMessage('Comment too long')
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

        const { orderId } = req.params;
        const { rating, comment } = req.body;

        const order = await Order.findOne({ orderId });
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        if (order.status !== 'completed' && order.status !== 'delivered') {
            return res.status(400).json({
                success: false,
                error: 'Order must be completed to leave a review'
            });
        }

        if (order.review.rating) {
            return res.status(400).json({
                success: false,
                error: 'Order has already been reviewed'
            });
        }

        order.review = {
            rating: rating,
            comment: comment || '',
            reviewedAt: new Date()
        };

        await order.save();

        // TODO: Update restaurant's overall rating
        // This could be implemented to update Restaurant model's rating

        console.log(`⭐ New review: ${orderId} → ${rating} stars`);

        res.json({
            success: true,
            message: 'Review added successfully',
            data: {
                orderId: order.orderId,
                rating: rating,
                reviewedAt: order.review.reviewedAt
            }
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;