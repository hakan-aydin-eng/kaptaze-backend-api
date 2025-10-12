# Unified Order Data Schema

## 🎯 Goal
Single, consistent order format across:
- MongoDB storage
- Backend API responses
- Mobile app consumption
- Restaurant panel consumption
- Socket.IO real-time notifications

## 📦 Unified Order Object

```javascript
{
  // Identifiers
  "_id": "67658e25e7fcb47a983b37a6",           // MongoDB ObjectId (required)
  "orderId": "ORD-20251012-001",               // Human-readable ID (required)
  "pickupCode": "ORD-20251012-001",            // Same as orderId for display (required)

  // Customer Info (required)
  "customer": {
    "id": "userId123",                         // String (NOT ObjectId)
    "name": "Hakan Aydın",
    "email": "hakan@example.com",
    "phone": "+905551234567"
  },

  // Restaurant Info (required)
  "restaurant": {
    "id": "restaurantId456",                   // String (NOT ObjectId)
    "name": "61 Tava Balık",
    "address": "Kadıköy, İstanbul"
  },

  // Order Items (required) - SINGLE FORMAT
  "items": [
    {
      "packageId": "packageId789",             // String reference to Package model
      "name": "Tavuk Döner Paket",            // Display name
      "description": "Pilav + İçecek dahil",  // Optional description
      "originalPrice": 100,                    // Original price before discount
      "price": 50,                            // Discounted price per unit
      "quantity": 2,                          // Number of packages
      "total": 100                            // price * quantity (calculated)
    }
  ],

  // Pricing (required)
  "totalPrice": 100,                          // Sum of all items[].total
  "savings": 100,                             // Total savings (sum of originalPrice - price)

  // Payment (required)
  "paymentMethod": "cash",                    // "cash" | "card" | "online"
  "paymentStatus": "pending",                 // "pending" | "paid" | "failed"
  "paymentDetails": {                         // Optional, only for card payments
    "conversationId": "iyzico-123",
    "paymentId": "iyzico-456",
    "paidAt": "2025-10-12T10:30:00Z"
  },

  // Status & Lifecycle (required)
  "status": "pending",                        // "pending" | "confirmed" | "ready" | "completed" | "cancelled"
  "createdAt": "2025-10-12T10:00:00Z",       // ISO 8601 string
  "updatedAt": "2025-10-12T10:05:00Z",       // ISO 8601 string

  // Optional fields
  "notes": "Acısız olsun lütfen",            // Customer notes
  "estimatedPickupTime": "2025-10-12T11:00:00Z",
  "actualPickupTime": "2025-10-12T11:15:00Z"
}
```

## 🔄 Data Flow

### 1. Mobile App → Backend (Order Creation)
```javascript
// POST /orders or POST /payment/process
{
  packageId: "packageId789",
  quantity: 2,
  paymentMethod: "cash",
  notes: "Acısız olsun"
}

// Backend creates unified order:
{
  items: [{ name: "...", price: 50, quantity: 2, total: 100 }],
  totalPrice: 100,
  ...
}
```

### 2. Backend → Mobile App (Order History)
```javascript
// GET /orders
{
  success: true,
  data: [
    {
      _id: "...",
      orderId: "ORD-123",
      items: [{ name: "...", price: 50, quantity: 2, total: 100 }],
      totalPrice: 100,
      status: "pending"
    }
  ]
}
```

### 3. Backend → Restaurant Panel (Order List)
```javascript
// GET /restaurant/orders
{
  success: true,
  data: {
    orders: [
      {
        _id: "...",
        orderId: "ORD-123",
        customer: { name: "...", phone: "..." },
        items: [{ name: "...", price: 50, quantity: 2, total: 100 }],
        totalPrice: 100,
        status: "pending"
      }
    ]
  }
}
```

### 4. Backend → Socket.IO → Restaurant Panel (Real-time)
```javascript
// Socket.IO event: "new-order"
{
  _id: "...",
  orderId: "ORD-123",
  customer: { name: "...", phone: "..." },
  items: [{ name: "...", price: 50, quantity: 2, total: 100 }],
  totalPrice: 100,
  status: "pending"
}
```

## ⚠️ Important Rules

1. **NEVER use multiple arrays** (`items` + `packages`)
2. **ALWAYS use String for IDs** (customer.id, restaurant.id) - NOT ObjectId
3. **ALWAYS include `total` field** in items (price * quantity)
4. **ALWAYS use `totalPrice`** (NOT totalAmount, pricing.total, etc.)
5. **ALWAYS use ISO 8601 strings** for dates (NOT Date objects)
6. **ALWAYS use `items` array** (NOT packages, NOT package singular)

## 📝 Field Name Consistency

| ❌ OLD (Multiple Names) | ✅ NEW (Single Name) |
|------------------------|---------------------|
| packages / items / package | `items` |
| totalAmount / pricing.total / totalPrice | `totalPrice` |
| packageName / name | `name` |
| total / price * quantity | `total` |
| orderDate / createdAt | `createdAt` |

## 🔧 Backend Transform Function

```javascript
// utils/orderTransform.js
function transformOrderToUnified(order) {
    const orderObj = order.toObject ? order.toObject() : order;

    // Extract items (support legacy formats during migration)
    let items = orderObj.items || [];
    if (!items.length && orderObj.packages) {
        items = orderObj.packages.map(pkg => ({
            name: pkg.packageName || pkg.name,
            price: pkg.price,
            quantity: pkg.quantity,
            total: pkg.price * pkg.quantity
        }));
    }

    return {
        _id: orderObj._id,
        orderId: orderObj.orderId,
        pickupCode: orderObj.pickupCode || orderObj.orderId,
        customer: {
            id: String(orderObj.customer?.id || ''),
            name: orderObj.customer?.name,
            email: orderObj.customer?.email,
            phone: orderObj.customer?.phone
        },
        restaurant: {
            id: String(orderObj.restaurant?.id || ''),
            name: orderObj.restaurant?.name,
            address: orderObj.restaurant?.address
        },
        items: items,
        totalPrice: orderObj.totalPrice || orderObj.pricing?.total || 0,
        paymentMethod: orderObj.paymentMethod,
        paymentStatus: orderObj.paymentStatus,
        status: orderObj.status,
        createdAt: orderObj.createdAt?.toISOString ? orderObj.createdAt.toISOString() : orderObj.createdAt,
        updatedAt: orderObj.updatedAt?.toISOString ? orderObj.updatedAt.toISOString() : orderObj.updatedAt,
        notes: orderObj.notes
    };
}
```

## 🗃️ MongoDB Migration

```javascript
// Migrate old orders: packages → items
db.orders.find({ packages: { $exists: true } }).forEach(order => {
    const items = order.packages.map(pkg => ({
        name: pkg.packageName || pkg.name,
        price: pkg.price,
        quantity: pkg.quantity,
        total: pkg.price * pkg.quantity
    }));

    db.orders.updateOne(
        { _id: order._id },
        {
            $set: { items: items },
            $unset: { packages: "" }
        }
    );
});

// Convert ObjectId IDs to Strings
db.orders.find({
    $or: [
        { "customer.id": { $type: "objectId" } },
        { "restaurant.id": { $type: "objectId" } }
    ]
}).forEach(order => {
    const update = {};
    if (order.customer?.id && typeof order.customer.id === 'object') {
        update["customer.id"] = String(order.customer.id);
    }
    if (order.restaurant?.id && typeof order.restaurant.id === 'object') {
        update["restaurant.id"] = String(order.restaurant.id);
    }
    db.orders.updateOne({ _id: order._id }, { $set: update });
});
```

## ✅ Benefits

1. **Single Source of Truth** - One format everywhere
2. **Less Code** - No more fallbacks (order.packages || order.items)
3. **Fewer Bugs** - Can't access wrong field
4. **Easy Maintenance** - Change one place, affects everywhere
5. **Better Performance** - No multiple field checks
6. **Clear Documentation** - Everyone knows exact structure

## 🚀 Migration Strategy

1. ✅ Define unified schema (this document)
2. Update backend transform function (backward compatible)
3. Update mobile app to use `items` only
4. Update restaurant panel to use `items` only
5. Test with new orders (should use `items`)
6. Test with old orders (transform converts `packages` → `items`)
7. Deploy backend + frontend
8. Run MongoDB migration to convert all old orders
9. Remove backward compatibility from transform function
10. Done! 🎉
