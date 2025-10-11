const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const Consumer = require('../models/Consumer');

// Initialize Iyzico
const Iyzipay = require('iyzipay');

const iyzico = new Iyzipay({
    apiKey: process.env.IYZICO_API_KEY || 'sandbox-VykP6e3GULjKALdJH27njpvVo6EELGcZ',
    secretKey: process.env.IYZICO_SECRET_KEY || 'sandbox-wGDY3wJ2JK5D7V6I36vI14k2FKGQhgBW',
    uri: process.env.IYZICO_URI || 'https://sandbox-api.iyzipay.com'
});

// @route   POST /payment/create
// @desc    Create payment with Iyzico
// @access  Private
router.post('/create', authenticate, async (req, res, next) => {
    try {
        console.log('📋 Full request body:', JSON.stringify(req.body));

        const {
            basketItems,
            totalAmount,
            amount,
            restaurant,
            restaurantId,
            cardInfo,
            billingInfo,
            deliveryOption,
            paymentMethod
        } = req.body;

        // Handle both totalAmount and amount (mobile app sends 'amount')
        const finalAmount = totalAmount || amount;

        if (!finalAmount) {
            return res.status(400).json({
                success: false,
                error: 'Amount is required (totalAmount or amount)'
            });
        }

        const consumerId = req.user.id;
        console.log('💳 Payment request from:', req.user.email);
        console.log('💳 Request body restaurant fields:', {
            restaurant,
            restaurantId,
            bodyKeys: Object.keys(req.body)
        });

        // Get consumer details
        const consumer = await Consumer.findById(consumerId);
        if (!consumer) {
            return res.status(404).json({
                success: false,
                error: 'Consumer not found'
            });
        }

        // Get restaurant details - handle both restaurantId and restaurant fields
        const restaurantIdToUse = restaurantId || (typeof restaurant === 'object' ? (restaurant.id || restaurant._id) : restaurant);

        console.log('🔍 Searching for restaurant with ID:', restaurantIdToUse);

        // Try to find restaurant
        let restaurantDoc = null;
        try {
            restaurantDoc = await Restaurant.findById(restaurantIdToUse);
        } catch (err) {
            console.log('❌ Invalid restaurant ID format:', restaurantIdToUse);
            // ID format is invalid, list all restaurants for debugging
            const allRestaurants = await Restaurant.find({}).select('_id name status').limit(10);
            console.log('📋 Available restaurants:', allRestaurants.map(r => ({
                id: r._id.toString(),
                name: r.name,
                status: r.status
            })));
        }

        if (!restaurantDoc) {
            // Try to find by any field to debug
            const allRestaurants = await Restaurant.find({}).select('_id name status').limit(10);
            console.log('📋 Available restaurants in DB:', allRestaurants.map(r => ({
                id: r._id.toString(),
                name: r.name,
                status: r.status
            })));

            return res.status(404).json({
                success: false,
                error: `Restaurant not found with ID: ${restaurantIdToUse}`,
                availableRestaurants: allRestaurants.map(r => ({
                    id: r._id.toString(),
                    name: r.name
                }))
            });
        }

        console.log('✅ Restaurant found:', restaurantDoc.name, 'Status:', restaurantDoc.status);

        // Create unique order ID
        const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        // Default to online payment if not specified
        const paymentMethodToUse = paymentMethod || 'online';

        // Helper function to create order after payment (defined before use)
        async function createOrderAfterPayment() {
            // Create order matching Order schema structure
            const order = new Order({
                orderId: orderId,

                // Customer information (required by schema)
                customer: {
                    id: consumerId,
                    name: consumer.name || (billingInfo.name + ' ' + billingInfo.surname),
                    email: consumer.email || billingInfo.email,
                    phone: consumer.phone || billingInfo.phone || ''
                },

                // Restaurant information (required by schema)
                restaurant: {
                    id: restaurantDoc._id,
                    name: restaurantDoc.name,
                    phone: restaurantDoc.phone || restaurantDoc.contactPhone || '',
                    address: {
                        street: (restaurantDoc.address && restaurantDoc.address.street) || restaurantDoc.address || '',
                        district: (restaurantDoc.address && restaurantDoc.address.district) || '',
                        city: (restaurantDoc.address && restaurantDoc.address.city) || restaurantDoc.city || ''
                    }
                },

                // Order items (not 'packages', schema expects 'items')
                items: basketItems.map(item => ({
                    packageId: item.packageId,
                    name: item.packageName,
                    description: item.description || '',
                    price: item.discountedPrice || item.price,
                    quantity: item.quantity,
                    totalPrice: (item.discountedPrice || item.price) * item.quantity
                })),

                // Pricing information (required by schema)
                pricing: {
                    subtotal: finalAmount,
                    deliveryFee: 0,
                    tax: 0,
                    discount: 0,
                    total: finalAmount
                },

                // Delivery information
                delivery: {
                    type: (deliveryOption === 'delivery') ? 'delivery' : 'pickup',
                    address: (deliveryOption === 'delivery') ? {
                        street: billingInfo.address || '',
                        district: '',
                        city: billingInfo.city || '',
                        notes: req.body.notes || ''
                    } : undefined
                },

                // Payment information
                payment: {
                    method: (paymentMethodToUse === 'cash') ? 'cash' : 'credit_card',
                    status: (paymentMethodToUse === 'cash') ? 'pending' : 'completed',
                    transactionId: orderId,
                    paidAt: (paymentMethodToUse !== 'cash') ? new Date() : undefined
                },

                // Order status
                status: 'pending',

                // Additional notes
                notes: req.body.notes || ''
            });

            await order.save();

            // Update package quantities
            for (const item of basketItems) {
                const pkg = restaurantDoc.packages && restaurantDoc.packages.find(p =>
                    (p._id && p._id.toString() === item.packageId) || p.packageName === item.packageName
                );
                if (pkg) {
                    pkg.quantity = Math.max(0, pkg.quantity - item.quantity);
                    if (pkg.quantity === 0) {
                        pkg.status = 'inactive';
                    }
                }
            }
            await restaurantDoc.save();

            // Send Socket.IO notification if available
            const io = req.app.get('io');
            if (io) {
                io.to(`restaurant-${restaurantDoc._id}`).emit('new-order', {
                    orderId: order._id,
                    orderCode: orderId,
                    customerName: consumer.name,
                    totalAmount: finalAmount,
                    paymentMethod: paymentMethodToUse,
                    items: basketItems
                });
            }

            console.log('✅ Order created successfully:', order._id);

            return res.json({
                success: true,
                data: {
                    orderId: order._id,
                    orderCode: orderId,
                    status: order.status,
                    message: 'Siparişiniz başarıyla oluşturuldu!'
                }
            });
        }

        // For now, simulate successful payment (remove when Iyzico integration is ready)
        if (paymentMethodToUse === 'online') {
            // Prepare Iyzico payment request
            const paymentRequest = {
                locale: Iyzipay.LOCALE.TR,
                conversationId: orderId,
                price: finalAmount.toString(),
                paidPrice: finalAmount.toString(),
                currency: Iyzipay.CURRENCY.TRY,
                installment: '1',
                basketId: orderId,
                paymentChannel: Iyzipay.PAYMENT_CHANNEL.WEB,
                paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
                paymentCard: {
                    cardHolderName: cardInfo.cardHolderName,
                    cardNumber: cardInfo.cardNumber,
                    expireMonth: cardInfo.expireMonth,
                    expireYear: cardInfo.expireYear,
                    cvc: cardInfo.cvc,
                    registerCard: cardInfo.saveCard ? '1' : '0'
                },
                buyer: {
                    id: consumerId,
                    name: billingInfo.name,
                    surname: billingInfo.surname,
                    gsmNumber: billingInfo.phone || consumer.phone,
                    email: billingInfo.email || consumer.email,
                    identityNumber: '11111111111', // Test TC
                    registrationAddress: billingInfo.address,
                    ip: req.ip || '127.0.0.1',
                    city: billingInfo.city,
                    country: 'Turkey',
                    zipCode: billingInfo.zipCode
                },
                shippingAddress: {
                    contactName: `${billingInfo.name} ${billingInfo.surname}`,
                    city: billingInfo.city,
                    country: 'Turkey',
                    address: billingInfo.address,
                    zipCode: billingInfo.zipCode
                },
                billingAddress: {
                    contactName: `${billingInfo.name} ${billingInfo.surname}`,
                    city: billingInfo.city,
                    country: 'Turkey',
                    address: billingInfo.address,
                    zipCode: billingInfo.zipCode
                },
                basketItems: basketItems.map((item, index) => ({
                    id: `ITEM${index + 1}`,
                    name: item.packageName,
                    category1: 'Food',
                    category2: restaurantDoc.category || 'Restaurant',
                    itemType: Iyzipay.BASKET_ITEM_TYPE.PHYSICAL,
                    price: ((item.discountedPrice || item.price) * item.quantity).toString()
                }))
            };

            console.log('💳 Sending payment to Iyzico...');

            // For testing, simulate success
            // In production, uncomment the actual Iyzico call below
            /*
            iyzico.payment.create(paymentRequest, (err, result) => {
                if (err || result.status !== 'success') {
                    console.error('❌ Payment failed:', err || result);
                    return res.status(400).json({
                        success: false,
                        error: err?.message || result.errorMessage || 'Payment failed'
                    });
                }

                // Payment successful, create order
                createOrderAfterPayment();
            });
            */

            // TEMPORARY: Simulate successful payment
            await createOrderAfterPayment();

        } else if (paymentMethodToUse === 'cash') {
            // Cash on delivery - create order directly
            await createOrderAfterPayment();
        }

    } catch (error) {
        console.error('❌ Payment error:', error);
        next(error);
    }
});

// @route   GET /payment/test
// @desc    Test payment endpoint
// @access  Public
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Payment routes are working',
        endpoints: [
            'POST /payment/create',
            'GET /payment/test'
        ]
    });
});

module.exports = router;
