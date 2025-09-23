/**
 * Payment Routes - Iyzico Test Integration
 */

const express = require('express');
const router = express.Router();
const Iyzipay = require('iyzipay');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const Consumer = require('../models/Consumer');

// Iyzico Test Configuration with debugging - Updated working sandbox credentials
const iyzicoApiKey = process.env.IYZICO_API_KEY || 'sandbox-8mSp0YHi11QvAjBErYNxvaQLhBZrQnLI';
const iyzicoSecretKey = process.env.IYZICO_SECRET_KEY || 'sandbox-Hxgm51ZvcJLpF5mEKLHgRm1aDyiD64yt';
// Force sandbox mode for testing even in production environment
const iyzicoUri = 'https://sandbox-api.iyzipay.com';

console.log('💳 Iyzico Configuration:', {
    apiKeyPresent: !!iyzicoApiKey,
    secretKeyPresent: !!iyzicoSecretKey,
    uri: iyzicoUri,
    environment: process.env.NODE_ENV,
    apiKeyPrefix: iyzicoApiKey?.substring(0, 10) + '...'
});

const iyzipay = new Iyzipay({
    apiKey: iyzicoApiKey,
    secretKey: iyzicoSecretKey,
    uri: iyzicoUri
});

// @route   POST /payment/create
// @desc    Create payment with Iyzico
// @access  Private (Consumer)
router.post('/create', authenticate, async (req, res, next) => {
    try {
        console.log('💳 Payment request received from:', req.user.email);
        console.log('💳 Payment data:', JSON.stringify(req.body, null, 2));

        const { amount, basketItems, restaurantId, cardInfo, billingInfo } = req.body;

        // Validate input
        if (!amount || !basketItems || !restaurantId || !cardInfo || !billingInfo) {
            return res.status(400).json({
                success: false,
                error: 'Missing required payment information'
            });
        }

        // Get restaurant info
        const restaurant = await Restaurant.findById(restaurantId);
        if (!restaurant) {
            return res.status(404).json({
                success: false,
                error: 'Restaurant not found'
            });
        }

        // Create order first (pending payment)
        const orderCode = `KT${Date.now().toString().slice(-6)}`;
        const order = new Order({
            customer: {
                id: req.user.id.toString(),
                name: `${billingInfo.name} ${billingInfo.surname}`,
                phone: billingInfo.phone || '+905551234567',
                address: billingInfo.address || `${billingInfo.city}, Turkey`
            },
            restaurant: {
                id: restaurantId,
                name: restaurant.name
            },
            consumerId: req.user.id,
            restaurantId,
            packages: basketItems,
            totalAmount: amount,
            status: 'pending_payment',
            paymentStatus: 'waiting',
            paymentMethod: 'online',
            orderCode,
            pickupTime: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes from now
        });

        await order.save();
        console.log('📋 Order created:', orderCode);

        // Prepare Iyzico payment request
        const conversationId = order._id.toString();

        const paymentRequest = {
            locale: 'tr',
            conversationId,
            price: amount.toString(),
            paidPrice: amount.toString(),
            currency: 'TRY',
            basketId: order._id.toString(),
            callbackUrl: process.env.NODE_ENV === 'production'
                ? 'https://kaptaze-backend-api.onrender.com/payment/3ds-callback'
                : 'http://localhost:3001/payment/3ds-callback',
            paymentCard: {
                cardHolderName: cardInfo.cardHolderName,
                cardNumber: cardInfo.cardNumber,
                expireMonth: cardInfo.expireMonth,
                expireYear: cardInfo.expireYear,
                cvc: cardInfo.cvc,
                registerCard: cardInfo.saveCard ? '1' : '0' // Kartı kaydet seçeneği
            },
            buyer: {
                id: req.user.id.toString(),
                name: billingInfo.name,
                surname: billingInfo.surname,
                gsmNumber: billingInfo.phone || '+905551234567',
                email: billingInfo.email,
                identityNumber: '11111111111', // Test identity number
                registrationAddress: billingInfo.address || 'Test Address',
                ip: req.ip || '127.0.0.1',
                city: billingInfo.city || 'Antalya',
                country: 'Turkey',
                zipCode: billingInfo.zipCode || '07000'
            },
            shippingAddress: {
                contactName: `${billingInfo.name} ${billingInfo.surname}`,
                city: billingInfo.city || 'Antalya',
                country: 'Turkey',
                address: restaurant.district + ' - ' + restaurant.name,
                zipCode: billingInfo.zipCode || '07000'
            },
            billingAddress: {
                contactName: `${billingInfo.name} ${billingInfo.surname}`,
                city: billingInfo.city || 'Antalya',
                country: 'Turkey',
                address: billingInfo.address || 'Test Address',
                zipCode: billingInfo.zipCode || '07000'
            },
            basketItems: basketItems.map((item, index) => ({
                id: item.packageId || index.toString(),
                name: item.packageName,
                category1: 'Food',
                category2: 'Package',
                itemType: 'PHYSICAL',
                price: item.price.toString()
            }))
        };

        console.log('💳 Sending payment request to Iyzico...');
        console.log('💳 Payment request details:', JSON.stringify({
            ...paymentRequest,
            paymentCard: { ...paymentRequest.paymentCard, cardNumber: '****', cvc: '***' } // Hide sensitive data
        }, null, 2));

        // Initialize 3D Secure payment with Iyzico
        iyzipay.threedsInitialize.create(paymentRequest, async (err, result) => {
            try {
                if (err) {
                    console.error('💳 Iyzico error details:', {
                        message: err.message,
                        stack: err.stack,
                        errorData: err
                    });

                    // Update order status to failed
                    order.status = 'payment_failed';
                    order.paymentStatus = 'failed';
                    await order.save();

                    return res.status(400).json({
                        success: false,
                        error: err.message || 'Payment processing error',
                        errorCode: err.errorCode || 'UNKNOWN'
                    });
                }

                console.log('💳 Iyzico response:', JSON.stringify(result, null, 2));

                if (result.status === 'success') {
                    // 3D Secure initialized successfully
                    console.log('✅ 3D Secure initialized:', result.threeDSHtmlContent);

                    // Update order status to waiting for 3D Secure
                    order.status = 'waiting_3d_secure';
                    order.paymentStatus = 'waiting_3d_secure';
                    order.iyzicoToken = result.token;
                    order.threeDSHtmlContent = result.threeDSHtmlContent;
                    await order.save();

                    // Save card token if requested
                    if (cardInfo.saveCard && result.cardToken) {
                        console.log('💾 Saving card token for user');
                        const Consumer = require('../models/Consumer');
                        await Consumer.findByIdAndUpdate(req.user.id, {
                            savedCard: {
                                cardToken: result.cardToken,
                                lastFourDigits: cardInfo.cardNumber.slice(-4),
                                cardType: result.cardType || 'Unknown',
                                expiryMonth: cardInfo.expireMonth,
                                expiryYear: cardInfo.expireYear,
                                holderName: cardInfo.cardHolderName,
                                savedAt: new Date()
                            }
                        });
                        console.log('✅ Card token saved securely');
                    }

                    // Reduce package quantities
                    for (const item of basketItems) {
                        const packageToUpdate = restaurant.packages.id(item.packageId);
                        if (packageToUpdate && packageToUpdate.quantity > 0) {
                            packageToUpdate.quantity -= item.quantity || 1;

                            // Auto-deactivate if quantity reaches 0
                            if (packageToUpdate.quantity <= 0) {
                                packageToUpdate.status = 'inactive';
                                console.log(`📦 Package ${packageToUpdate.packageName} auto-deactivated (out of stock)`);
                            }
                        }
                    }
                    await restaurant.save();

                    console.log('✅ Order confirmed and stock updated');

                    // Send 3D Secure response
                    res.json({
                        success: true,
                        message: '3D Secure initialized',
                        orderId: order._id,
                        orderCode: order.orderCode,
                        threeDSHtmlContent: result.threeDSHtmlContent,
                        status: 'waiting_3d_secure',
                        restaurant: {
                            name: restaurant.name,
                            address: restaurant.district + ' - ' + restaurant.city
                        }
                    });

                } else {
                    // Payment failed
                    console.log('❌ Payment failed:', result.errorMessage);

                    // Update order status
                    order.status = 'payment_failed';
                    order.paymentStatus = 'failed';
                    order.iyzicoErrorMessage = result.errorMessage;
                    await order.save();

                    res.status(400).json({
                        success: false,
                        error: result.errorMessage || 'Payment failed',
                        errorCode: result.errorCode
                    });
                }

            } catch (updateError) {
                console.error('💳 Error updating order:', updateError);
                res.status(500).json({
                    success: false,
                    error: 'Payment processing error'
                });
            }
        });

    } catch (error) {
        console.error('💳 Payment route error:', error);
        next(error);
    }
});

// @route   GET /payment/debug-env
// @desc    Debug environment variables
// @access  Public (for testing)
router.get('/debug-env', (req, res) => {
    res.json({
        success: true,
        environment: {
            nodeEnv: process.env.NODE_ENV,
            iyzicoApiKeyPresent: !!process.env.IYZICO_API_KEY,
            iyzicoSecretKeyPresent: !!process.env.IYZICO_SECRET_KEY,
            iyzicoApiKeyPrefix: process.env.IYZICO_API_KEY?.substring(0, 15) + '...',
            iyzicoSecretKeyPrefix: process.env.IYZICO_SECRET_KEY?.substring(0, 15) + '...',
            allEnvKeys: Object.keys(process.env).filter(key => key.includes('IYZICO'))
        }
    });
});

// @route   GET /payment/test-connection
// @desc    Test Iyzico connection
// @access  Public (for testing)
router.get('/test-connection', (req, res) => {
    try {
        // Test request to check Iyzico connection
        const testRequest = {
            locale: 'tr',
            conversationId: 'test-' + Date.now()
        };

        iyzipay.installment.retrieve(testRequest, (err, result) => {
            if (err) {
                console.error('Iyzico connection test failed:', err);
                return res.status(500).json({
                    success: false,
                    error: 'Iyzico connection failed',
                    details: err.message
                });
            }

            console.log('✅ Iyzico connection test successful');
            res.json({
                success: true,
                message: 'Iyzico connection successful',
                environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
            });
        });

    } catch (error) {
        console.error('Test connection error:', error);
        res.status(500).json({
            success: false,
            error: 'Connection test failed'
        });
    }
});

// @route   POST /payment/3ds-callback
// @desc    Handle 3D Secure callback from Iyzico
// @access  Public (Iyzico calls this)
router.post('/3ds-callback', async (req, res) => {
    try {
        console.log('🔒 3D Secure callback received - ALL DATA:', {
            body: req.body,
            query: req.query,
            headers: req.headers,
            method: req.method,
            url: req.url
        });

        // Try multiple parameter name variations that Iyzico might send
        const token = req.body.token || req.body.paymentId || req.query.token || req.query.paymentId;
        const conversationId = req.body.conversationId || req.body.orderId || req.query.conversationId || req.query.orderId;

        console.log('🔒 Extracted values:', { token, conversationId });

        if (!token || !conversationId) {
            console.log('🔒 Missing required values. Available keys in body:', Object.keys(req.body));
            console.log('🔒 Available keys in query:', Object.keys(req.query));
            return res.status(400).json({
                success: false,
                error: 'Missing token or conversationId',
                receivedData: {
                    bodyKeys: Object.keys(req.body),
                    queryKeys: Object.keys(req.query),
                    body: req.body,
                    query: req.query
                }
            });
        }

        // Find the order
        const order = await Order.findById(conversationId);
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        // Complete 3D Secure payment
        const request = {
            locale: 'tr',
            conversationId: conversationId,
            paymentId: token
        };

        iyzipay.threedsPayment.create(request, async (err, result) => {
            try {
                if (err) {
                    console.error('❌ 3D Secure payment error:', err);

                    // Update order status
                    order.status = 'payment_failed';
                    order.paymentStatus = 'failed';
                    await order.save();

                    return res.status(400).json({
                        success: false,
                        error: '3D Secure payment failed: ' + err.message
                    });
                }

                console.log('🔒 3D Secure payment result:', result);

                if (result.status === 'success') {
                    // Payment successful
                    console.log('✅ 3D Secure payment successful:', result.paymentId);

                    // Update order status
                    order.status = 'confirmed';
                    order.paymentStatus = 'completed';
                    order.paymentId = result.paymentId;
                    await order.save();

                    // Get restaurant and reduce package quantities
                    const restaurant = await Restaurant.findById(order.restaurantId);
                    if (restaurant) {
                        for (const item of order.packages) {
                            const packageToUpdate = restaurant.packages.id(item.packageId);
                            if (packageToUpdate && packageToUpdate.quantity > 0) {
                                packageToUpdate.quantity -= item.quantity || 1;

                                // Auto-deactivate if quantity reaches 0
                                if (packageToUpdate.quantity <= 0) {
                                    packageToUpdate.status = 'inactive';
                                    console.log(`📦 Package ${packageToUpdate.packageName} auto-deactivated (out of stock)`);
                                }
                            }
                        }
                        await restaurant.save();
                    }

                    console.log('✅ 3D Secure payment completed and stock updated');

                    // Redirect to mobile app success page
                    res.redirect(`kaptaze://payment-success?orderId=${order._id}&orderCode=${order.orderCode}`);

                } else {
                    // Payment failed
                    console.log('❌ 3D Secure payment failed:', result.errorMessage);

                    order.status = 'payment_failed';
                    order.paymentStatus = 'failed';
                    order.iyzicoErrorMessage = result.errorMessage;
                    await order.save();

                    // Redirect to mobile app failure page
                    res.redirect(`kaptaze://payment-failed?error=${encodeURIComponent(result.errorMessage)}`);
                }

            } catch (updateError) {
                console.error('❌ Error updating order after 3D Secure:', updateError);
                res.redirect(`kaptaze://payment-failed?error=${encodeURIComponent('Payment processing error')}`);
            }
        });

    } catch (error) {
        console.error('❌ 3D Secure callback error:', error);
        res.status(500).json({
            success: false,
            error: '3D Secure callback processing error'
        });
    }
});

module.exports = router;