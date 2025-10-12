// UNIVERSAL ORDER TRANSFORM - Use everywhere for consistency
function transformOrderToUnified(order) {
    const orderObj = order.toObject ? order.toObject() : order;
    
    // Get first item for package info
    const firstItem = orderObj.items?.[0] || {};
    const totalPrice = orderObj.pricing?.total || orderObj.totalPrice || 0;
    const originalPrice = firstItem.originalPrice || firstItem.price || totalPrice;
    
    return {
        // IDs
        _id: orderObj._id,  // Restaurant panel needs _id
        id: orderObj._id,
        orderId: orderObj.orderId,
        pickupCode: orderObj.orderId || orderObj.pickupCode || 'N/A',
        
        // Restaurant
        restaurant: orderObj.restaurant || {},
        
        // Customer  
        customer: {
            ...orderObj.customer,
            phone: orderObj.customer?.phone || ''  // Ensure phone is never undefined
        },
        
        // PACKAGE - Singular for mobile
        package: {
            id: firstItem.packageId || firstItem._id,
            name: firstItem.name || firstItem.packageName || 'Paket',
            description: firstItem.description || '',
            price: Number(firstItem.price) || totalPrice,
            originalPrice: Number(originalPrice) || totalPrice,
            quantity: firstItem.quantity || 1
        },
        
        // PACKAGES - Array for restaurant panel
        packages: orderObj.items?.map(item => ({
            packageId: item.packageId || item._id,
            packageName: item.name || item.packageName,
            price: Number(item.price) || 0,
            quantity: item.quantity || 1,
            totalPrice: Number(item.price) * (item.quantity || 1)
        })) || [],
        
        // ROOT LEVEL (both mobile and restaurant use these)
        quantity: firstItem.quantity || 1,
        totalPrice: Number(totalPrice) || 0,
        originalPrice: Number(originalPrice) * (firstItem.quantity || 1),
        savings: (Number(originalPrice) * (firstItem.quantity || 1)) - Number(totalPrice),
        // Status & Dates
        status: orderObj.status || 'pending',
        orderDate: orderObj.orderDate || orderObj.createdAt?.toISOString ? orderObj.createdAt.toISOString() : orderObj.createdAt || new Date().toISOString(),
        pickupTime: orderObj.pickupTime || '18:00-21:00',
        createdAt: orderObj.createdAt?.toISOString ? orderObj.createdAt.toISOString() : orderObj.createdAt || new Date().toISOString(),
        
        // Payment
        paymentMethod: orderObj.payment?.method || orderObj.paymentMethod || 'unknown',
        paymentStatus: orderObj.payment?.status || 'pending',
        
        // LEGACY - Keep for backward compatibility
        items: orderObj.items || [],
        pricing: orderObj.pricing || {},
        totalAmount: Number(totalPrice) || 0,
        payment: orderObj.payment || {},
        delivery: orderObj.delivery || {}
    };
}

module.exports = { transformOrderToUnified };
