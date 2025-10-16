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
                    id: consumerId.toString(), // ✅ String for consistent queries
                    name: consumer.name || (billingInfo.name + ' ' + billingInfo.surname),
                    email: consumer.email || billingInfo.email,
                    phone: consumer.phone || billingInfo.phone || ''
                },

                // Restaurant information (required by schema)
                restaurant: {
                    id: restaurantDoc._id.toString(), // ✅ String for consistent queries
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
                    originalPrice: item.originalPrice || item.price, // ✅ Use originalPrice from frontend
                    price: item.price, // ✅ Discounted price
                    quantity: item.quantity,
                    total: item.price * item.quantity
                })),

                // Unified pricing - single totalPrice field
                totalPrice: finalAmount,

                // ✅ Calculate savings: (originalPrice × quantity) - totalPrice
                savings: basketItems.reduce((sum, item) => {
                    const itemOriginalTotal = (item.originalPrice || item.price) * item.quantity;
                    const itemDiscountedTotal = item.price * item.quantity;
                    return sum + (itemOriginalTotal - itemDiscountedTotal);
                }, 0),

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

                // Unified payment fields
                paymentMethod: (paymentMethodToUse === 'cash') ? 'cash' : 'card',
                paymentStatus: (paymentMethodToUse === 'cash') ? 'pending' : 'paid',
                paymentDetails: (paymentMethodToUse !== 'cash') ? {
                    transactionId: orderId,
                    paidAt: new Date()
                } : null,

                // Order status
                status: 'pending',

                // Additional notes
                notes: req.body.notes || ''
            });

            console.log('💾 Attempting to save order to MongoDB...');
            await order.save();
            console.log('✅ Order saved successfully with ID:', order._id);

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

            // 🐛 DEBUG: Order created - log full details
            console.log('\n=== 🎯 ORDER CREATED DEBUG ===');
            console.log('📦 Order ID:', order._id);
            console.log('📋 Order Code:', orderId);
            console.log('👤 Customer:', order.customer);
            console.log('🏪 Restaurant:', order.restaurant);
            console.log('💰 Total Price:', order.totalPrice);
            console.log('📦 Items:', order.items);
            console.log('📍 Payment Method:', order.paymentMethod);
            console.log('📊 Order Status:', order.status);
            console.log('=== END DEBUG ===\n');

            // Send Socket.IO notification if available
            const io = req.app.get('io');
            if (io) {
                const roomName = `restaurant-${restaurantDoc._id}`;
                const notification = {
                    orderId: order._id,
                    orderCode: orderId,
                    customerName: consumer.name,
                    totalAmount: finalAmount,
                    paymentMethod: paymentMethodToUse,
                    items: basketItems
                };

                console.log(`🔔 Sending Socket.IO notification to room: ${roomName}`);
                console.log(`📦 Notification data:`, notification);

                io.to(roomName).emit('new-order', notification);

                console.log(`✅ Socket.IO notification sent to ${restaurantDoc.name}`);
            } else {
                console.warn('⚠️ Socket.IO not available - notification not sent');
            }

            console.log('✅ Order created successfully:', order._id);

            // 🐛 DEBUG: Preparing response
            const responseData = {
                orderId: order._id.toString(),
                orderCode: orderId,
                status: order.status,
                pickupCode: orderId, // ✅ For restaurant panel compatibility
                message: 'Siparişiniz başarıyla oluşturuldu!'
            };
            console.log('📤 Sending response to client:', responseData);

            return res.json({
                success: true,
                data: responseData
            });

            /* OLD CODE:
            return res.json({
                success: true,
            */
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
                callbackUrl: 'https://kaptaze-backend-api.onrender.com/payment/3ds-callback',
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

            // ✅ PRE-CREATE ORDER (will be finalized after 3DS success)
            const orderBefore3DS = new Order({
                orderId: orderId,
                customer: {
                    id: consumerId.toString(),
                    name: consumer.name || (billingInfo.name + ' ' + billingInfo.surname),
                    email: consumer.email || billingInfo.email,
                    phone: consumer.phone || billingInfo.phone || ''
                },
                restaurant: {
                    id: restaurantDoc._id.toString(),
                    name: restaurantDoc.name,
                    phone: restaurantDoc.phone || restaurantDoc.contactPhone || '',
                    address: {
                        street: (restaurantDoc.address && restaurantDoc.address.street) || restaurantDoc.address || '',
                        district: (restaurantDoc.address && restaurantDoc.address.district) || '',
                        city: (restaurantDoc.address && restaurantDoc.address.city) || restaurantDoc.city || ''
                    }
                },
                items: basketItems.map(item => ({
                    packageId: item.packageId,
                    name: item.packageName,
                    description: item.description || '',
                    originalPrice: item.originalPrice || item.price, // ✅ Use originalPrice from frontend
                    price: item.price, // ✅ Discounted price
                    quantity: item.quantity,
                    total: item.price * item.quantity
                })),
                totalPrice: finalAmount,

                // ✅ Calculate savings: (originalPrice × quantity) - totalPrice
                savings: basketItems.reduce((sum, item) => {
                    const itemOriginalTotal = (item.originalPrice || item.price) * item.quantity;
                    const itemDiscountedTotal = item.price * item.quantity;
                    return sum + (itemOriginalTotal - itemDiscountedTotal);
                }, 0),

                delivery: {
                    type: (deliveryOption === 'delivery') ? 'delivery' : 'pickup',
                    address: (deliveryOption === 'delivery') ? {
                        street: billingInfo.address || '',
                        district: '',
                        city: billingInfo.city || '',
                        notes: req.body.notes || ''
                    } : undefined
                },
                paymentMethod: 'card',
                paymentStatus: 'awaiting_3ds', // Will be updated in callback
                status: 'awaiting_payment', // Will change to 'pending' after payment
                notes: req.body.notes || ''
            });

            await orderBefore3DS.save();
            console.log('✅ Order pre-created (awaiting 3DS payment):', orderBefore3DS._id, 'orderId:', orderId);

            console.log('💳 Sending 3D Secure Initialize request to Iyzico...');

            // Use 3D Secure Initialize for SMS verification
            iyzico.threedsInitialize.create(paymentRequest, async (err, result) => {
                if (err) {
                    console.error('❌ 3D Secure Initialize error:', err);
                    return res.status(400).json({
                        success: false,
                        error: err.message || '3D Secure başlatılamadı'
                    });
                }

                console.log('🔒 3D Secure Initialize result status:', result.status);

                if (result.status === 'success') {
                    // Return 3D Secure HTML content for SMS verification
                    return res.json({
                        success: true,
                        status: 'waiting_3d_secure',
                        threeDSHtmlContent: result.threeDSHtmlContent,
                        paymentId: result.paymentId,
                        conversationId: orderId
                    });
                } else {
                    console.error('❌ 3D Secure failed:', result);
                    return res.status(400).json({
                        success: false,
                        error: result.errorMessage || '3D Secure başarısız'
                    });
                }
            });

        } else if (paymentMethodToUse === 'cash') {
            // Cash on delivery - create order directly
            console.log('💵 Processing cash payment for restaurant:', restaurantDoc.name);
            console.log('💵 Basket items:', basketItems);
            
            try {
                const result = await createOrderAfterPayment();
                console.log('💵 Cash order created successfully');
                return result;
            } catch (cashError) {
                console.error('❌ Cash payment error:', cashError);
                console.error('❌ Error stack:', cashError.stack);
                return res.status(500).json({
                    success: false,
                    error: cashError.message || 'Failed to create cash order'
                });
            }
        }

    } catch (error) {
        console.error('❌ Payment error:', error);
        next(error);
    }
});

// @route   POST /payment/3ds-callback
// @desc    3D Secure callback after SMS verification
// @access  Public
router.post('/3ds-callback', async (req, res, next) => {
    try {
        console.log('🔔 3D Secure callback received');
        console.log('📦 Request body:', req.body);
        console.log('🔍 Query params:', req.query);

        const { paymentId, conversationId } = req.body;
        const token = req.query.token || req.body.token || paymentId;
        const orderId = req.query.conversationId || req.body.conversationId || conversationId;

        if (!token) {
            console.error('❌ Missing payment token');
            return res.status(400).send('<html><body><h1>Hata: Ödeme token bulunamadı</h1></body></html>');
        }

        console.log('🔒 Verifying 3D Secure payment with token:', token);

        // Create 3DS payment verification request
        const request = {
            locale: Iyzipay.LOCALE.TR,
            conversationId: orderId || 'conv' + Date.now(),
            paymentId: token
        };

        iyzico.threedsPayment.create(request, async (err, result) => {
            if (err) {
                console.error('❌ 3D Secure payment error:', err);
                return res.send(`<html><body>
                    <h1>❌ Ödeme Başarısız</h1>
                    <p>${err.message}</p>
                    <script>
                        setTimeout(() => {
                            if (window.ReactNativeWebView) {
                                window.ReactNativeWebView.postMessage(JSON.stringify({
                                    type: 'payment-failed',
                                    error: '${err.message}'
                                }));
                            }
                        }, 1000);
                    </script>
                </body></html>`);
            }

            console.log('✅ 3D Secure payment result status:', result.status);

            if (result.status === 'success') {
                // Payment verified! Now update order and send notification
                console.log('💳 3DS Payment verified! Finding order:', orderId);

                try {
                    // Find order by orderId (pre-created before 3DS)
                    const order = await Order.findOne({ orderId: orderId });

                    if (!order) {
                        console.error('❌ Order not found with orderId:', orderId);
                        return res.send(`<html><body>
                            <h1>⚠️ Sipariş Bulunamadı</h1>
                            <p>Order ID: ${orderId}</p>
                            <script>
                                setTimeout(() => {
                                    if (window.ReactNativeWebView) {
                                        window.ReactNativeWebView.postMessage(JSON.stringify({
                                            type: 'payment-failed',
                                            error: 'Sipariş bulunamadı'
                                        }));
                                    }
                                }, 1000);
                            </script>
                        </body></html>`);
                    }

                    console.log('✅ Order found:', order._id, 'Current status:', order.status);

                    // Update order status to paid and pending
                    order.paymentStatus = 'paid';
                    order.status = 'pending'; // Restaurant can now approve
                    order.paymentDetails = {
                        transactionId: result.paymentId || result.authCode || 'unknown',
                        paidAt: new Date()
                    };
                    await order.save();
                    console.log('✅ Order updated to paid/pending status');

                    // Update package quantities
                    const restaurant = await Restaurant.findById(order.restaurant.id);
                    if (restaurant) {
                        for (const item of order.items) {
                            const pkg = restaurant.packages?.find(p =>
                                (p._id && p._id.toString() === item.packageId) || p.packageName === item.name
                            );
                            if (pkg) {
                                pkg.quantity = Math.max(0, pkg.quantity - item.quantity);
                                if (pkg.quantity === 0) {
                                    pkg.status = 'inactive';
                                }
                                console.log(`📦 Updated package "${pkg.name}" quantity: ${pkg.quantity}`);
                            }
                        }
                        await restaurant.save();
                        console.log('✅ Package quantities updated');
                    }

                    // 🔔 SEND SOCKET.IO NOTIFICATION (CRITICAL FOR RESTAURANT PANEL!)
                    const io = req.app.get('io');
                    if (io) {
                        const { transformOrderToUnified } = require('../utils/orderTransform');
                        const transformedOrder = transformOrderToUnified(order);
                        const roomName = `restaurant-${order.restaurant.id}`;

                        const notification = {
                            order: transformedOrder
                        };

                        console.log(`🔔 Sending Socket.IO notification to room: ${roomName}`);
                        io.to(roomName).emit('new-order', notification);
                        console.log('✅ Socket.IO notification sent for ONLINE payment! Restaurant will hear sound now.');
                    } else {
                        console.warn('⚠️ Socket.IO not available - notification not sent');
                    }

                    // Success HTML
                    const successHtml = `<html>
                        <head>
                            <meta charset="UTF-8">
                            <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            <style>
                                body { font-family: Arial; text-align: center; padding: 50px; background: #f0f9ff; }
                                h1 { color: #10b981; }
                                .order-code { font-size: 24px; font-weight: bold; margin: 20px 0; }
                            </style>
                        </head>
                        <body>
                            <h1>✅ Ödeme Başarılı!</h1>
                            <p class="order-code">Sipariş Kodu: ${orderId}</p>
                            <p>Siparişiniz oluşturuldu. Restorana giderek teslim alabilirsiniz.</p>
                            <script>
                                setTimeout(() => {
                                    if (window.ReactNativeWebView) {
                                        window.ReactNativeWebView.postMessage(JSON.stringify({
                                            type: 'payment-success',
                                            orderId: '${orderId}',
                                            orderCode: '${orderId}'
                                        }));
                                    }
                                }, 2000);
                            </script>
                        </body>
                    </html>`;

                    return res.send(successHtml);

                } catch (orderUpdateError) {
                    console.error('❌ 3DS success handler error:', orderUpdateError);
                    return res.send(`<html><body>
                        <h1>❌ Bir Hata Oluştu</h1>
                        <p>${orderUpdateError.message}</p>
                        <script>
                            setTimeout(() => {
                                if (window.ReactNativeWebView) {
                                    window.ReactNativeWebView.postMessage(JSON.stringify({
                                        type: 'payment-failed',
                                        error: '${orderUpdateError.message}'
                                    }));
                                }
                            }, 1000);
                        </script>
                    </body></html>`);
                }
            } else {
                console.error('❌ Payment verification failed:', result);
                return res.send(`<html><body>
                    <h1>❌ Ödeme Doğrulanamadı</h1>
                    <p>${result.errorMessage || 'Bilinmeyen hata'}</p>
                    <script>
                        setTimeout(() => {
                            if (window.ReactNativeWebView) {
                                window.ReactNativeWebView.postMessage(JSON.stringify({
                                    type: 'payment-failed',
                                    error: '${result.errorMessage}'
                                }));
                            }
                        }, 1000);
                    </script>
                </body></html>`);
            }
        });
    } catch (error) {
        console.error('❌ 3DS callback error:', error);
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
