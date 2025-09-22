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

// Iyzico Test Configuration
const iyzipay = new Iyzipay({
    apiKey: process.env.IYZICO_API_KEY || 'sandbox-rHJBhQIGpg9aWUg0cKHVPmPJfXIhCf5u',
    secretKey: process.env.IYZICO_SECRET_KEY || 'sandbox-wfhxYcZgK9zL2m9g0hgfhNJEQANzQzkd',
    uri: process.env.NODE_ENV === 'production'
        ? 'https://api.iyzipay.com'
        : 'https://sandbox-api.iyzipay.com'
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
            consumerId: req.user.id,
            restaurantId,
            packages: basketItems,
            totalAmount: amount,
            status: 'pending_payment',
            paymentStatus: 'waiting',
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

        // Create payment with Iyzico
        iyzipay.payment.create(paymentRequest, async (err, result) => {
            try {
                if (err) {
                    console.error('💳 Iyzico error:', err);

                    // Update order status to failed
                    order.status = 'payment_failed';
                    order.paymentStatus = 'failed';
                    await order.save();

                    return res.status(400).json({
                        success: false,
                        error: 'Payment processing error: ' + err.message
                    });
                }

                console.log('💳 Iyzico response:', JSON.stringify(result, null, 2));

                if (result.status === 'success') {
                    // Payment successful
                    console.log('✅ Payment successful:', result.paymentId);

                    // Update order status
                    order.status = 'confirmed';
                    order.paymentStatus = 'completed';
                    order.paymentId = result.paymentId;
                    order.iyzicoToken = result.token;
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

                    // Send success response
                    res.json({
                        success: true,
                        message: 'Payment successful',
                        orderId: order._id,
                        orderCode: order.orderCode,
                        paymentId: result.paymentId,
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

module.exports = router;