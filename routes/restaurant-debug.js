const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { transformOrderToUnified } = require('../utils/orderTransform');

// Debug HTML page to view orders and fix toFixed() error
router.get('/debug-orders/:restaurantId', async (req, res) => {
    try {
        const { restaurantId } = req.params;

        // Get orders for this restaurant
        const orders = await Order.find({
            'restaurant.id': restaurantId,
            status: { $ne: 'cancelled' }
        })
        .sort({ orderDate: -1 })
        .limit(50);

        const transformedOrders = orders.map(order => transformOrderToUnified(order));

        // Create HTML page with working order display
        const html = `
<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <title>Restaurant Orders Debug - ${restaurantId}</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
        h1 { color: #333; }
        .stats { background: #fff; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .order-card { background: #fff; padding: 20px; margin-bottom: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .order-header { display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        .order-id { font-weight: bold; color: #2c3e50; }
        .order-status { padding: 5px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; }
        .status-pending { background: #ffeaa7; color: #fdcb6e; }
        .status-confirmed { background: #74b9ff; color: #0984e3; }
        .status-completed { background: #55efc4; color: #00b894; }
        .order-details { margin-top: 10px; }
        .detail-row { display: flex; justify-content: space-between; padding: 5px 0; }
        .price { font-weight: bold; color: #27ae60; font-size: 18px; }
        .package-list { background: #f8f9fa; padding: 10px; border-radius: 5px; margin-top: 10px; }
        .package-item { padding: 5px 0; border-bottom: 1px solid #dee2e6; }
        .package-item:last-child { border-bottom: none; }
        .error { background: #ff6b6b; color: white; padding: 10px; border-radius: 5px; margin-bottom: 10px; }
        .success { background: #27ae60; color: white; padding: 10px; border-radius: 5px; margin-bottom: 10px; }
        .debug-info { background: #3498db; color: white; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
        .raw-data { background: #2c3e50; color: #ecf0f1; padding: 15px; border-radius: 5px; margin-top: 10px; font-family: monospace; font-size: 12px; overflow-x: auto; }
    </style>
</head>
<body>
    <h1>🍽️ Restaurant Orders Debug Panel</h1>

    <div class="debug-info">
        <strong>Restaurant ID:</strong> ${restaurantId}<br>
        <strong>Total Orders Found:</strong> ${orders.length}<br>
        <strong>Debug Mode:</strong> Active - All fields are safely rendered with fallbacks
    </div>

    <div class="stats">
        <h2>📊 Order Statistics</h2>
        <div class="detail-row">
            <span>Total Orders:</span>
            <strong>${orders.length}</strong>
        </div>
        <div class="detail-row">
            <span>Pending Orders:</span>
            <strong>${orders.filter(o => o.status === 'pending').length}</strong>
        </div>
        <div class="detail-row">
            <span>Total Revenue:</span>
            <strong>₺${transformedOrders.reduce((sum, o) => sum + (o.totalPrice || 0), 0).toFixed(2)}</strong>
        </div>
    </div>

    <h2>📋 Orders (Safe Display)</h2>
    <div id="orders-container">
        ${transformedOrders.map((order, index) => `
            <div class="order-card">
                <div class="order-header">
                    <div>
                        <span class="order-id">Order #${order.pickupCode || order.orderId || 'N/A'}</span>
                        <br>
                        <small>Customer: ${order.customer?.name || 'Unknown'} ${order.customer?.phone || ''}</small>
                    </div>
                    <div>
                        <span class="order-status status-${order.status || 'pending'}">${order.status || 'pending'}</span>
                    </div>
                </div>

                <div class="order-details">
                    <div class="detail-row">
                        <span>Order Date:</span>
                        <span>${order.orderDate ? new Date(order.orderDate).toLocaleString('tr-TR') : 'Unknown'}</span>
                    </div>

                    <div class="package-list">
                        <strong>Packages:</strong>
                        ${(order.packages || []).map(pkg => `
                            <div class="package-item">
                                ${pkg.packageName || 'Unknown Package'} x${pkg.quantity || 1}
                                - ₺${typeof pkg.price === 'number' ? pkg.price.toFixed(2) : '0.00'}
                            </div>
                        `).join('')}
                        ${order.packages?.length === 0 ? '<div>No packages found</div>' : ''}
                    </div>

                    <div class="detail-row" style="margin-top: 15px;">
                        <span><strong>Total Price:</strong></span>
                        <span class="price">₺${typeof order.totalPrice === 'number' ? order.totalPrice.toFixed(2) : '0.00'}</span>
                    </div>
                </div>

                <details style="margin-top: 15px;">
                    <summary style="cursor: pointer; color: #3498db;">🔍 View Raw Data (Debug)</summary>
                    <div class="raw-data">
                        <strong>Order Index: ${index}</strong><br>
                        ${JSON.stringify(order, null, 2)}
                    </div>
                </details>
            </div>
        `).join('')}

        ${orders.length === 0 ? '<div class="error">No orders found for this restaurant</div>' : ''}
    </div>

    <script>
        console.log('Debug Page Loaded');
        console.log('Total Orders:', ${orders.length});
        console.log('Transformed Orders:', ${JSON.stringify(transformedOrders, null, 2)});

        // Test toFixed() on all price fields
        const priceFields = [];
        ${JSON.stringify(transformedOrders)}.forEach((order, index) => {
            // Test totalPrice
            try {
                const totalPrice = order.totalPrice;
                if (totalPrice !== undefined && totalPrice !== null) {
                    const fixed = totalPrice.toFixed(2);
                    priceFields.push({ index, field: 'totalPrice', value: totalPrice, fixed, success: true });
                } else {
                    priceFields.push({ index, field: 'totalPrice', value: totalPrice, error: 'undefined or null' });
                }
            } catch (e) {
                priceFields.push({ index, field: 'totalPrice', error: e.message });
            }

            // Test package prices
            (order.packages || []).forEach((pkg, pkgIndex) => {
                try {
                    const price = pkg.price;
                    if (price !== undefined && price !== null) {
                        const fixed = price.toFixed(2);
                        priceFields.push({ index, field: \`packages[\${pkgIndex}].price\`, value: price, fixed, success: true });
                    } else {
                        priceFields.push({ index, field: \`packages[\${pkgIndex}].price\`, value: price, error: 'undefined or null' });
                    }
                } catch (e) {
                    priceFields.push({ index, field: \`packages[\${pkgIndex}].price\`, error: e.message });
                }
            });
        });

        console.log('Price Field Test Results:', priceFields);

        // Find problematic fields
        const errors = priceFields.filter(f => f.error);
        if (errors.length > 0) {
            console.error('🔴 FOUND PROBLEMATIC FIELDS:', errors);
            document.body.insertAdjacentHTML('afterbegin',
                '<div class="error">⚠️ Found ' + errors.length + ' fields with toFixed() errors. Check console for details.</div>'
            );
        } else {
            console.log('✅ All price fields are safe for toFixed()');
            document.body.insertAdjacentHTML('afterbegin',
                '<div class="success">✅ All price fields are properly formatted and safe for toFixed()</div>'
            );
        }
    </script>
</body>
</html>
        `;

        res.send(html);
    } catch (error) {
        console.error('Debug page error:', error);
        res.status(500).send(`
            <h1>Error Loading Debug Page</h1>
            <pre style="background: #ff6b6b; color: white; padding: 20px;">
${error.stack}
            </pre>
        `);
    }
});

// JSON endpoint for testing
router.get('/debug-orders-json/:restaurantId', async (req, res) => {
    try {
        const { restaurantId } = req.params;

        const orders = await Order.find({
            'restaurant.id': restaurantId,
            status: { $ne: 'cancelled' }
        })
        .sort({ orderDate: -1 })
        .limit(50);

        const transformedOrders = orders.map(order => transformOrderToUnified(order));

        // Test each field that might cause toFixed() error
        const fieldTests = [];
        transformedOrders.forEach((order, index) => {
            // Test totalPrice
            fieldTests.push({
                orderIndex: index,
                orderId: order.orderId,
                field: 'totalPrice',
                value: order.totalPrice,
                type: typeof order.totalPrice,
                canUseToFixed: typeof order.totalPrice === 'number'
            });

            // Test package prices
            (order.packages || []).forEach((pkg, pkgIndex) => {
                fieldTests.push({
                    orderIndex: index,
                    orderId: order.orderId,
                    field: `packages[${pkgIndex}].price`,
                    value: pkg.price,
                    type: typeof pkg.price,
                    canUseToFixed: typeof pkg.price === 'number'
                });
            });
        });

        const problematicFields = fieldTests.filter(f => !f.canUseToFixed);

        res.json({
            restaurantId,
            totalOrders: orders.length,
            transformedOrders,
            fieldTests,
            problematicFields,
            summary: {
                totalProblematicFields: problematicFields.length,
                allFieldsSafe: problematicFields.length === 0
            }
        });
    } catch (error) {
        console.error('Debug JSON error:', error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

module.exports = router;