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
            required: false,
            default: ''
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

    // Order Items (Unified Format)
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
        originalPrice: {
            type: Number,
            default: 0
        },
        price: {
            type: Number,
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        total: {
            type: Number,
            required: true
        }
    }],

    // Unified Pricing - Single totalPrice field
    totalPrice: {
        type: Number,
        required: true
    },
    savings: {
        type: Number,
        default: 0
    },

    // Legacy pricing object (optional, for backward compatibility)
    pricing: {
        subtotal: {
            type: Number,
            required: false
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
            required: false
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

    // Pickup Information (Unified Format)
    pickupCode: {
        type: String,
        default: function() {
            // Will be set to orderId in payment.js
            return this.orderId;
        }
    },
    pickupTime: {
        type: String,
        default: '18:00 - 21:00'
    },

    // Order Status
    // Restaurant Acknowledgment (GÖRDÜM)
    acknowledged: {
        type: Boolean,
        default: false
    },
    acknowledgedAt: {
        type: Date,
        default: null
    },

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

    // Unified Payment Fields
    paymentMethod: {
        type: String,
        enum: ['cash', 'card', 'online', 'mobile_payment'],
        default: 'cash'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    paymentDetails: {
        transactionId: String,
        conversationId: String,
        paymentId: String,
        paidAt: Date
    },

    // Legacy payment object (optional, for backward compatibility)
    payment: {
        method: {
            type: String,
            enum: ['cash', 'credit_card', 'card', 'online', 'mobile_payment'],
            required: false
        },
        status: {
            type: String,
            enum: ['pending', 'completed', 'paid', 'failed', 'refunded'],
            required: false
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
    
    // Rating and Review (after completion) - Unified Format
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
        photos: [{
            url: {
                type: String,
                required: true
            },
            cloudinaryId: {
                type: String,
                default: null
            },
            uploadedAt: {
                type: Date,
                default: Date.now
            },
            isApproved: {
                type: Boolean,
                default: false  // Default: waiting for admin approval
            },
            approvedAt: {
                type: Date,
                default: null
            },
            approvedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                default: null
            },
            rejectedReason: {
                type: String,
                default: null
            }
        }],
        reviewedAt: Date,
        isRated: {  // For easy queries
            type: Boolean,
            default: false
        }
    },

    // Commission & Settlement (calculated when order completed) - Unified Format
    commission: {
        rate: {
            type: Number,
            default: 10,  // Default: 10% commission
            min: 0,
            max: 100
        },
        amount: {
            type: Number,
            default: 0  // Platform commission amount (₺)
        },
        platformRevenue: {
            type: Number,
            default: 0  // Same as amount (for clarity)
        },
        restaurantPayout: {
            type: Number,
            default: 0  // Amount to be paid to restaurant (₺)
        },
        calculatedAt: {
            type: Date,
            default: null
        },
        customRate: {
            type: Boolean,
            default: false  // Was a custom rate applied?
        },
        rateReason: {
            type: String,
            default: null  // Reason for custom rate
        }
    },

    settlement: {
        status: {
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed'],
            default: 'pending'
        },
        scheduledDate: {
            type: Date,
            default: null  // Scheduled payment date (e.g., next Monday)
        },
        completedDate: {
            type: Date,
            default: null  // Actual payment date
        },
        method: {
            type: String,
            enum: ['bank_transfer', 'cash', 'wallet'],
            default: 'bank_transfer'
        },
        reference: {
            type: String,
            default: null  // Bank transfer reference (e.g., TRF-2025-001)
        },
        processedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null  // Admin who processed payment
        },
        notes: {
            type: String,
            maxlength: 500,
            default: null
        }
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
orderSchema.index({ 'settlement.status': 1 });
orderSchema.index({ 'settlement.scheduledDate': 1 });

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

// Calculate commission (called when order is completed)
orderSchema.methods.calculateCommission = async function(customRate = null, reason = null) {
    // Get commission rate (custom or default)
    const commissionRate = customRate !== null ? customRate : (this.commission.rate || 10);

    // Calculate amounts
    const platformRevenue = (this.totalPrice * commissionRate) / 100;
    const restaurantPayout = this.totalPrice - platformRevenue;

    // Update commission fields
    this.commission.rate = commissionRate;
    this.commission.amount = platformRevenue;
    this.commission.platformRevenue = platformRevenue;
    this.commission.restaurantPayout = restaurantPayout;
    this.commission.calculatedAt = new Date();
    this.commission.customRate = customRate !== null;
    this.commission.rateReason = reason;

    // Schedule settlement for next Monday
    const nextMonday = this.getNextMonday();
    this.settlement.scheduledDate = nextMonday;
    this.settlement.status = 'pending';

    console.log(`💰 Commission calculated for order ${this.orderId}:`, {
        totalPrice: this.totalPrice,
        rate: commissionRate + '%',
        platformRevenue: platformRevenue.toFixed(2),
        restaurantPayout: restaurantPayout.toFixed(2),
        settlementDate: nextMonday
    });

    return this;
};

// Helper: Get next Monday for settlement scheduling
orderSchema.methods.getNextMonday = function() {
    const today = new Date();
    const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    nextMonday.setHours(0, 0, 0, 0);
    return nextMonday;
};

// Virtual for order summary
orderSchema.virtual('summary').get(function() {
    return {
        orderId: this.orderId,
        restaurant: this.restaurant.name,
        itemCount: this.items.length,
        total: this.totalPrice,
        status: this.status,
        orderDate: this.orderDate
    };
});

// Ensure virtual fields are serialized
orderSchema.set('toJSON', { virtuals: true });

// Post-save hook: Calculate commission when order is created/paid
orderSchema.post('save', async function(doc) {
    // Only calculate commission if:
    // 1. Payment is completed (paymentStatus = 'paid')
    // 2. Commission not already calculated
    if (doc.paymentStatus === 'paid' && !doc.commission.calculatedAt) {
        try {
            console.log(`💰 Auto-calculating commission for order ${doc.orderId}...`);

            // Get restaurant to check for custom commission rate
            const Restaurant = mongoose.model('Restaurant');
            const restaurant = await Restaurant.findById(doc.restaurant.id);

            const customRate = restaurant?.customCommissionRate || null;
            const reason = restaurant?.commissionReason || null;

            // Calculate commission
            await doc.calculateCommission(customRate, reason);
            await doc.save();

            // Update restaurant wallet (add to pending balance)
            if (restaurant) {
                restaurant.wallet.pendingBalance = (restaurant.wallet.pendingBalance || 0) + doc.commission.restaurantPayout;
                restaurant.wallet.totalEarned = (restaurant.wallet.totalEarned || 0) + doc.commission.restaurantPayout;
                await restaurant.save();
                console.log(`💰 Restaurant wallet updated: +₺${doc.commission.restaurantPayout.toFixed(2)} pending`);
            }

        } catch (error) {
            console.error(`❌ Error calculating commission for order ${doc.orderId}:`, error.message);
            // Don't throw - commission can be calculated manually if needed
        }
    }
});

module.exports = mongoose.model('Order', orderSchema);