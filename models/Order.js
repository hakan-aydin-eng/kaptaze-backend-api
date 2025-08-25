/**
 * Order Model - Mobile App Orders
 */

const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    orderId: {
        type: String,
        required: true,
        unique: true,
        default: function() {
            // Generate order ID: ORD-YYYYMMDD-XXXXX
            const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const random = Math.floor(Math.random() * 99999).toString().padStart(5, '0');
            return `ORD-${date}-${random}`;
        }
    },

    // Customer Information
    customer: {
        id: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true
        },
        email: {
            type: String,
            required: true
        },
        phone: {
            type: String,
            required: true
        }
    },

    // Restaurant Information
    restaurant: {
        id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Restaurant',
            required: true
        },
        name: {
            type: String,
            required: true
        },
        phone: {
            type: String
        },
        address: {
            street: String,
            district: String,
            city: String
        }
    },

    // Order Items (Packages)
    items: [{
        packageId: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true
        },
        description: String,
        price: {
            type: Number,
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        totalPrice: {
            type: Number,
            required: true
        }
    }],

    // Pricing
    pricing: {
        subtotal: {
            type: Number,
            required: true
        },
        deliveryFee: {
            type: Number,
            default: 0
        },
        tax: {
            type: Number,
            default: 0
        },
        discount: {
            type: Number,
            default: 0
        },
        total: {
            type: Number,
            required: true
        }
    },

    // Delivery Information
    delivery: {
        type: {
            type: String,
            enum: ['delivery', 'pickup'],
            default: 'delivery'
        },
        address: {
            street: String,
            district: String,
            city: String,
            coordinates: {
                latitude: Number,
                longitude: Number
            },
            notes: String
        },
        estimatedTime: {
            type: Number,
            default: 30 // minutes
        }
    },

    // Order Status
    status: {
        type: String,
        enum: [
            'pending',      // Siparişi alındı, onay bekleniyor
            'confirmed',    // Restaurant onayladı
            'preparing',    // Hazırlanıyor
            'ready',        // Hazır, teslim bekliyor
            'delivering',   // Yolda (delivery için)
            'delivered',    // Teslim edildi
            'completed',    // Tamamlandı
            'cancelled'     // İptal edildi
        ],
        default: 'pending'
    },

    // Payment Information
    payment: {
        method: {
            type: String,
            enum: ['cash', 'credit_card', 'mobile_payment'],
            default: 'cash'
        },
        status: {
            type: String,
            enum: ['pending', 'completed', 'failed', 'refunded'],
            default: 'pending'
        },
        transactionId: String,
        paidAt: Date
    },

    // Timestamps
    orderDate: {
        type: Date,
        default: Date.now
    },
    estimatedDeliveryTime: {
        type: Date
    },
    actualDeliveryTime: {
        type: Date
    },

    // Additional Information
    notes: {
        type: String,
        maxlength: 500
    },
    
    // Rating and Review (after completion)
    review: {
        rating: {
            type: Number,
            min: 1,
            max: 5
        },
        comment: {
            type: String,
            maxlength: 500
        },
        reviewedAt: Date
    },

    // Status History for tracking
    statusHistory: [{
        status: String,
        timestamp: {
            type: Date,
            default: Date.now
        },
        note: String
    }]
}, {
    timestamps: true
});

// Indexes
orderSchema.index({ orderId: 1 });
orderSchema.index({ 'customer.id': 1 });
orderSchema.index({ 'restaurant.id': 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ orderDate: -1 });

// Methods
orderSchema.methods.updateStatus = function(newStatus, note = '') {
    this.status = newStatus;
    this.statusHistory.push({
        status: newStatus,
        timestamp: new Date(),
        note: note
    });
    
    // Set delivery time if status is delivered
    if (newStatus === 'delivered') {
        this.actualDeliveryTime = new Date();
    }
    
    return this.save();
};

orderSchema.methods.calculateTotal = function() {
    // Calculate subtotal from items
    this.pricing.subtotal = this.items.reduce((sum, item) => sum + item.totalPrice, 0);
    
    // Calculate total
    this.pricing.total = this.pricing.subtotal + 
                        this.pricing.deliveryFee + 
                        this.pricing.tax - 
                        this.pricing.discount;
    
    return this.pricing.total;
};

// Virtual for order summary
orderSchema.virtual('summary').get(function() {
    return {
        orderId: this.orderId,
        restaurant: this.restaurant.name,
        itemCount: this.items.length,
        total: this.pricing.total,
        status: this.status,
        orderDate: this.orderDate
    };
});

// Ensure virtual fields are serialized
orderSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Order', orderSchema);