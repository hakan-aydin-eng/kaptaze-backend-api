const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const { sendOrderNotification } = require('../services/emailService');

// Test endpoint
router.get('/test', (req, res) => {
    res.json({ 
        message: 'Orders API is working!', 
        timestamp: new Date().toISOString() 
    });
});

// Create new order from mobile app
router.post('/create', async (req, res) => {
    try {
        console.log('Received order request:', req.body);
        
        const { 
            customer, 
            restaurantId, 
            items, 
            totalAmount, 
            paymentMethod, 
            notes 
        } = req.body;

        console.log('Looking for restaurant with ID:', restaurantId);

        // Get restaurant details
        const restaurant = await Restaurant.findById(restaurantId);
        console.log('Found restaurant:', restaurant ? restaurant.name : 'null');
        
        if (!restaurant) {
            console.log('Restaurant not found with ID:', restaurantId);
            return res.status(404).json({ error: 'Restaurant not found' });
        }

        // Check stock availability for each item
        const stockErrors = [];
        const packageUpdates = [];

        for (const orderItem of items) {
            const packageId = orderItem.id || orderItem.productId;
            console.log(`🔍 Checking stock for package ID: ${packageId}, quantity needed: ${orderItem.quantity}`);
            
            // Find the package in restaurant's packages array
            const packageIndex = restaurant.packages.findIndex(pkg => pkg.id === packageId && pkg.status === 'active');
            
            if (packageIndex === -1) {
                stockErrors.push(`Package ${orderItem.name} not found or inactive`);
                continue;
            }

            const package = restaurant.packages[packageIndex];
            console.log(`📦 Package ${package.name} - Current stock: ${package.quantity}, Requested: ${orderItem.quantity}`);

            // Check if enough stock available
            if (package.quantity < orderItem.quantity) {
                stockErrors.push(`${package.name} - Sadece ${package.quantity} adet kaldı (${orderItem.quantity} adet istendi)`);
                continue;
            }

            // Prepare stock update
            packageUpdates.push({
                packageIndex,
                newQuantity: package.quantity - orderItem.quantity,
                packageName: package.name,
                orderedQuantity: orderItem.quantity
            });
        }

        // Return error if any stock issues
        if (stockErrors.length > 0) {
            console.log('❌ Stock errors:', stockErrors);
            return res.status(400).json({ 
                error: 'Stok yetersiz',
                details: stockErrors,
                stockError: true
            });
        }

        // Update stock levels
        for (const update of packageUpdates) {
            restaurant.packages[update.packageIndex].quantity = update.newQuantity;
            console.log(`✅ Updated ${update.packageName} stock: ${update.newQuantity} (${update.orderedQuantity} adet düşüldü)`);
        }

        // Save restaurant with updated stock
        await restaurant.save();
        console.log('💾 Restaurant stock levels saved');

        // Create order
        const order = new Order({
            customer,
            restaurant: {
                id: restaurantId,
                name: restaurant.name
            },
            items,
            totalAmount,
            paymentMethod,
            notes,
            status: 'pending'
        });

        await order.save();

        // Send real-time notification via Socket.IO
        const io = req.app.get('io');
        io.to(`restaurant-${restaurantId}`).emit('new-order', {
            order: order,
            timestamp: new Date()
        });

        // Send email notification if email exists
        if (restaurant.email) {
            try {
                await sendOrderNotification(order, restaurant.email);
                console.log('✅ Email sent to:', restaurant.email);
            } catch (emailError) {
                console.error('❌ Email failed:', emailError.message);
            }
        }

        res.json({
            success: true,
            orderId: order._id,
            message: 'Order placed successfully'
        });

    } catch (error) {
        console.error('Order creation error:', error.message);
        console.error('Full error:', error);
        res.status(500).json({ 
            error: 'Failed to create order',
            message: error.message 
        });
    }
});

// Get orders for a restaurant
router.get('/restaurant/:restaurantId', async (req, res) => {
    try {
        const { restaurantId } = req.params;
        const { status, date } = req.query;
        
        console.log(`🔍 Getting orders for restaurant: ${restaurantId}`);

        // Handle both string and ObjectId comparisons
        let query = {
            $or: [
                { 'restaurant.id': restaurantId },
                { 'restaurant.id': new mongoose.Types.ObjectId(restaurantId) }
            ]
        };
        
        if (status) {
            query.status = status;
            console.log(`📋 Filtering by status: ${status}`);
        }
        
        if (date) {
            const startDate = new Date(date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);
            query.createdAt = { $gte: startDate, $lte: endDate };
            console.log(`📅 Filtering by date: ${date}`);
        }

        console.log('🔍 MongoDB query:', JSON.stringify(query, null, 2));

        const orders = await Order.find(query)
            .sort({ createdAt: -1 })
            .limit(100);

        console.log(`📦 Found ${orders.length} orders for restaurant ${restaurantId}`);
        
        // Debug: Show which restaurant each order belongs to
        orders.forEach((order, index) => {
            console.log(`Order ${index + 1}: ${order._id} -> Restaurant: ${order.restaurant.id} (${order.restaurant.name})`);
        });

        res.json(orders);
    } catch (error) {
        console.error('Get orders error:', error);
        res.status(500).json({ error: 'Failed to get orders' });
    }
});

// Update order status
router.put('/:orderId/status', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status, estimatedDeliveryTime } = req.body;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        order.status = status;
        if (estimatedDeliveryTime) {
            order.estimatedDeliveryTime = estimatedDeliveryTime;
        }
        
        await order.save();

        // Notify customer via Socket.IO
        const io = req.app.get('io');
        io.emit(`order-update-${orderId}`, {
            status: order.status,
            estimatedDeliveryTime: order.estimatedDeliveryTime
        });

        res.json({
            success: true,
            order
        });

    } catch (error) {
        console.error('Update order error:', error);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

// Get order details
router.get('/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const order = await Order.findById(orderId);
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json(order);
    } catch (error) {
        console.error('Get order error:', error);
        res.status(500).json({ error: 'Failed to get order' });
    }
});

// Get order statistics for restaurant
router.get('/restaurant/:restaurantId/stats', async (req, res) => {
    try {
        const { restaurantId } = req.params;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const stats = await Order.aggregate([
            { $match: { 'restaurant.id': mongoose.Types.ObjectId(restaurantId) } },
            {
                $facet: {
                    today: [
                        { $match: { createdAt: { $gte: today } } },
                        { $count: 'count' },
                        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
                    ],
                    pending: [
                        { $match: { status: 'pending' } },
                        { $count: 'count' }
                    ],
                    total: [
                        { $count: 'count' },
                        { $group: { _id: null, revenue: { $sum: '$totalAmount' } } }
                    ]
                }
            }
        ]);

        res.json({
            todayOrders: stats[0].today[0]?.count || 0,
            todayRevenue: stats[0].today[0]?.total || 0,
            pendingOrders: stats[0].pending[0]?.count || 0,
            totalOrders: stats[0].total[0]?.count || 0,
            totalRevenue: stats[0].total[0]?.revenue || 0
        });

    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

module.exports = router;