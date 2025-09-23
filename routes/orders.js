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

// Create new order - alias for /create endpoint (for mobile app compatibility)
router.post('/', async (req, res) => {
    try {
        console.log('Received order request at /orders root:', req.body);

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
            console.log(`📦 Available packages in restaurant:`, restaurant.packages.map(pkg => ({
                id: pkg.id,
                _id: pkg._id,
                name: pkg.name,
                status: pkg.status,
                quantity: pkg.quantity
            })));

            // Find the package in restaurant's packages array - check multiple ID formats
            const packageIndex = restaurant.packages.findIndex(pkg =>
                (pkg.id === packageId || pkg._id === packageId || pkg.id?.toString() === packageId || pkg._id?.toString() === packageId)
            );

            if (packageIndex === -1) {
                console.log(`❌ Package not found with ID: ${packageId}`);
                stockErrors.push(`Package ${orderItem.name} not found or inactive`);
                continue;
            }

            const package = restaurant.packages[packageIndex];
            console.log(`📦 Found package: ${package.name}, Status: ${package.status}, Stock: ${package.quantity}`);

            // Check if package is active (remove strict status check for now)
            if (package.status === 'inactive') {
                console.log(`⚠️ Package ${package.name} is inactive`);
                stockErrors.push(`Package ${orderItem.name} is not available`);
                continue;
            }

            console.log(`📦 Package ${package.name} - Current stock: ${package.quantity}, Requested: ${orderItem.quantity}`);

            // Check if enough stock available
            if (package.quantity < orderItem.quantity) {
                stockErrors.push(`${package.name} - Sadece ${package.quantity} adet kaldı (${orderItem.quantity} adet istendi)`);
                continue;
            }

            // Prepare stock update
            packageUpdates.push({
                packageIndex: packageIndex,
                newQuantity: package.quantity - orderItem.quantity
            });
        }

        // If there are stock errors, return them
        if (stockErrors.length > 0) {
            console.log('Stock errors found:', stockErrors);
            return res.status(400).json({
                error: 'Stock not available',
                details: stockErrors
            });
        }

        // Create order object
        const orderData = {
            customer: customer,
            restaurant: {
                id: restaurant._id,
                name: restaurant.name
            },
            items: items,
            totalAmount: totalAmount,
            paymentMethod: paymentMethod || 'cash',
            notes: notes,
            status: 'pending',
            orderDate: new Date(),
            pickupCode: `KB${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`
        };

        console.log('Creating order with data:', orderData);

        // Save order to database
        const order = new Order(orderData);
        const savedOrder = await order.save();

        // Update package quantities
        for (const update of packageUpdates) {
            restaurant.packages[update.packageIndex].quantity = update.newQuantity;

            // If stock reaches 0, make package inactive
            if (update.newQuantity === 0) {
                restaurant.packages[update.packageIndex].status = 'inactive';
                console.log(`🔴 ${restaurant.packages[update.packageIndex].name} stok tükendi - paket inactive yapıldı`);
            } else {
                console.log(`📦 Updated ${restaurant.packages[update.packageIndex].name} stock to ${update.newQuantity}`);
            }
        }

        await restaurant.save();
        console.log('✅ Restaurant package quantities updated');

        // Send notification to restaurant via Socket.IO
        const io = req.app.get('io');
        const restaurantSockets = req.app.get('restaurantSockets');

        if (io && restaurantSockets.has(restaurantId)) {
            console.log(`📡 Sending real-time notification to restaurant ${restaurantId}`);
            io.to(`restaurant-${restaurantId}`).emit('new-order', {
                order: savedOrder,
                message: 'Yeni sipariş aldınız!'
            });
        }

        // Send email notification
        try {
            console.log('📧 Sending email notification...');
            await sendOrderNotification({
                restaurantEmail: restaurant.email,
                restaurantName: restaurant.name,
                customerName: customer.name,
                orderDetails: items,
                totalAmount: totalAmount,
                pickupCode: savedOrder.pickupCode,
                notes: notes
            });
            console.log('✅ Email notification sent successfully');
        } catch (emailError) {
            console.error('❌ Email notification failed:', emailError);
            // Don't fail the order if email fails
        }

        console.log('✅ Order created successfully:', savedOrder._id);

        res.status(200).json({
            success: true,
            message: 'Order placed successfully',
            orderId: savedOrder._id,
            data: savedOrder
        });

    } catch (error) {
        console.error('❌ Error creating order:', error);
        res.status(500).json({
            error: 'Failed to create order',
            message: error.message
        });
    }
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
            
            // If stock reaches 0, make package inactive
            if (update.newQuantity === 0) {
                restaurant.packages[update.packageIndex].status = 'inactive';
                console.log(`🔴 ${update.packageName} stok tükendi - paket inactive yapıldı`);
            } else {
                console.log(`✅ Updated ${update.packageName} stock: ${update.newQuantity} (${update.orderedQuantity} adet düşüldü)`);
            }
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
        console.log(`🔔 Sending Socket.IO notification to restaurant-${restaurantId}`);
        console.log(`📊 Order ID: ${order._id}, Status: ${order.status}`);

        io.to(`restaurant-${restaurantId}`).emit('new-order', {
            order: order,
            timestamp: new Date()
        });

        console.log(`✅ Socket.IO notification sent to restaurant-${restaurantId}`);

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
        console.log(`📱 Sending order status update to mobile app - order-update-${orderId}`);
        console.log(`📊 Status: ${order.status}, EstimatedDeliveryTime: ${order.estimatedDeliveryTime}`);

        io.emit(`order-update-${orderId}`, {
            status: order.status,
            estimatedDeliveryTime: order.estimatedDeliveryTime
        });

        console.log(`✅ Order status update sent to mobile app - order-update-${orderId}`);

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