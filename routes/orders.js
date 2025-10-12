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

        // Create order object matching Order schema
        const pickupCode = `KB${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
        const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        const orderData = {
            orderId: orderId,

            // Customer information (schema compliant)
            customer: {
                id: customer.id || customer._id,
                name: customer.name,
                email: customer.email,
                phone: customer.phone || ''
            },

            // Restaurant information (schema compliant)
            restaurant: {
                id: restaurant._id,
                name: restaurant.name,
                phone: restaurant.phone || restaurant.contactPhone || '',
                address: {
                    street: (restaurant.address && restaurant.address.street) || restaurant.address || '',
                    district: (restaurant.address && restaurant.address.district) || '',
                    city: (restaurant.address && restaurant.address.city) || restaurant.city || ''
                }
            },

            // Items array (already correct)
            items: items,

            // Pricing information (schema compliant)
            pricing: {
                subtotal: totalAmount,
                deliveryFee: 0,
                tax: 0,
                discount: 0,
                total: totalAmount
            },

            // Delivery information (schema compliant)
            delivery: {
                type: 'pickup',
                address: undefined
            },

            // Payment information (schema compliant)
            payment: {
                method: paymentMethod === 'credit_card' ? 'credit_card' : 'cash',
                status: 'pending',
                transactionId: orderId
            },

            // Order status
            status: 'pending',

            // Additional notes
            notes: notes || '',

            // Pickup code (for backward compatibility)
            pickupCode: pickupCode
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

// Get all orders (for admin/testing)
router.get('/', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 }).limit(50);
        res.json({
            success: true,
            count: orders.length,
            data: orders
        });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

module.exports = router;

// Get user orders - for mobile app
// @route   GET /orders/user/:userId
// @desc    Get all orders for a specific user
// @access  Public (but should verify userId matches auth token in production)
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('📱 Fetching orders for user:', userId);

        // Find all orders for this user - support both String and ObjectId formats
        let query;
        
        try {
            // Try to create ObjectId for old orders
            const objectId = new mongoose.Types.ObjectId(userId);
            query = {
                $or: [
                    { 'customer.id': userId },  // New orders (String)
                    { 'customer.id': objectId }  // Old orders (ObjectId)
                ]
            };
        } catch (err) {
            // If userId is not valid ObjectId format, just search as String
            console.log('⚠️ userId is not valid ObjectId, searching as String only');
            query = { 'customer.id': userId };
        }
        
        const orders = await Order.find(query)
            .sort({ createdAt: -1 })
            .limit(100);

        console.log(`✅ Found ${orders.length} orders for user ${userId}`);

        // Transform orders to unified format
        const { transformOrderToUnified } = require('../utils/orderTransform');
        const transformedOrders = orders.map(order => transformOrderToUnified(order));

        res.json({
            success: true,
            count: transformedOrders.length,
            data: transformedOrders
        });

    } catch (error) {
        console.error('❌ Error fetching user orders:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch user orders',
            message: error.message
        });
    }
});
module.exports = router;
