/**
 * UNIFIED ORDER TRANSFORM
 * Single source of truth for order data format across:
 * - MongoDB storage
 * - Backend API responses
 * - Mobile app consumption
 * - Restaurant panel consumption
 * - Socket.IO real-time notifications
 *
 * See: UNIFIED_ORDER_SCHEMA.md for full documentation
 */

function transformOrderToUnified(order) {
    const orderObj = order.toObject ? order.toObject() : order;

    // Extract items - Support legacy formats during migration
    let items = [];

    // Priority 1: Use items array if exists (new format)
    if (orderObj.items && Array.isArray(orderObj.items) && orderObj.items.length > 0) {
        items = orderObj.items.map(item => ({
            packageId: item.packageId || item._id,
            name: item.name || item.packageName || 'Paket',
            description: item.description || '',
            originalPrice: Number(item.originalPrice || item.price || 0),
            price: Number(item.price || 0),
            quantity: Number(item.quantity || 1),
            total: Number(item.total || (item.price * item.quantity) || 0)
        }));
    }
    // Priority 2: Convert packages array to items (legacy format)
    else if (orderObj.packages && Array.isArray(orderObj.packages) && orderObj.packages.length > 0) {
        items = orderObj.packages.map(pkg => ({
            packageId: pkg.packageId || pkg._id,
            name: pkg.packageName || pkg.name || 'Paket',
            description: pkg.description || '',
            originalPrice: Number(pkg.originalPrice || pkg.price || 0),
            price: Number(pkg.price || 0),
            quantity: Number(pkg.quantity || 1),
            total: Number(pkg.total || (pkg.price * pkg.quantity) || 0)
        }));
    }
    // Priority 3: Create single item from package object (legacy mobile format)
    else if (orderObj.package) {
        const pkg = orderObj.package;
        items = [{
            packageId: pkg.id || pkg._id,
            name: pkg.name || 'Paket',
            description: pkg.description || '',
            originalPrice: Number(pkg.originalPrice || pkg.price || 0),
            price: Number(pkg.price || 0),
            quantity: Number(orderObj.quantity || pkg.quantity || 1),
            total: Number(pkg.price || 0) * Number(orderObj.quantity || pkg.quantity || 1)
        }];
    }

    // Calculate total price
    const totalPrice = items.reduce((sum, item) => sum + item.total, 0) ||
                      orderObj.totalPrice ||
                      orderObj.pricing?.total ||
                      orderObj.totalAmount ||
                      0;

    // Calculate total savings
    const totalSavings = items.reduce((sum, item) => {
        return sum + ((item.originalPrice - item.price) * item.quantity);
    }, 0);

    // Unified format (single source of truth)
    return {
        // Identifiers
        _id: orderObj._id,
        orderId: orderObj.orderId,
        pickupCode: orderObj.pickupCode || orderObj.orderId || 'N/A',

        // Customer Info - ALWAYS use String IDs
        customer: {
            id: String(orderObj.customer?.id || ''),
            name: orderObj.customer?.name || 'Unknown',
            email: orderObj.customer?.email || '',
            phone: orderObj.customer?.phone || ''
        },

        // Restaurant Info - ALWAYS use String IDs
        restaurant: {
            id: String(orderObj.restaurant?.id || ''),
            name: orderObj.restaurant?.name || 'Unknown',
            address: orderObj.restaurant?.address || ''
        },

        // ITEMS ARRAY - Single format for all consumers
        items: items,

        // Pricing - Always numbers
        totalPrice: Number(totalPrice || 0),
        savings: Number(totalSavings || 0),

        // Payment
        paymentMethod: orderObj.paymentMethod || orderObj.payment?.method || 'cash',
        paymentStatus: orderObj.paymentStatus || orderObj.payment?.status || 'pending',
        paymentDetails: orderObj.paymentDetails || orderObj.payment?.details || null,

        // Status & Lifecycle
        status: orderObj.status || 'pending',
        createdAt: orderObj.createdAt?.toISOString ? orderObj.createdAt.toISOString() : orderObj.createdAt || new Date().toISOString(),
        updatedAt: orderObj.updatedAt?.toISOString ? orderObj.updatedAt.toISOString() : orderObj.updatedAt || new Date().toISOString(),

        // Optional fields
        notes: orderObj.notes || '',
        pickupTime: orderObj.pickupTime || orderObj.estimatedPickupTime || '',
        estimatedPickupTime: orderObj.estimatedPickupTime || null,
        actualPickupTime: orderObj.actualPickupTime || null
    };
}

module.exports = { transformOrderToUnified };
