/**
 * Package Model - Restaurant packages/deals
 */

const mongoose = require('mongoose');

const packageSchema = new mongoose.Schema({
    // Package Information
    name: {
        type: String,
        required: [true, 'Package name is required'],
        trim: true,
        maxlength: [100, 'Package name cannot exceed 100 characters']
    },
    description: {
        type: String,
        required: [true, 'Package description is required'],
        trim: true,
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    
    // Pricing
    originalPrice: {
        type: Number,
        required: [true, 'Original price is required'],
        min: [0, 'Original price cannot be negative']
    },
    discountedPrice: {
        type: Number,
        required: [true, 'Discounted price is required'],
        min: [0, 'Discounted price cannot be negative']
    },
    discountPercentage: {
        type: Number,
        default: function() {
            return Math.round((1 - this.discountedPrice / this.originalPrice) * 100);
        }
    },
    
    // Availability
    quantity: {
        type: Number,
        required: [true, 'Quantity is required'],
        min: [0, 'Quantity cannot be negative'],
        default: 1
    },
    remainingQuantity: {
        type: Number,
        default: function() {
            return this.quantity;
        }
    },
    
    // Time Information
    availableFrom: {
        type: Date,
        default: Date.now
    },
    availableUntil: {
        type: Date,
        required: [true, 'Available until time is required']
    },
    expiryTime: {
        type: String, // Format: "18:00"
        required: [true, 'Expiry time is required']
    },
    
    // Restaurant Reference
    restaurant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Restaurant',
        required: [true, 'Restaurant reference is required']
    },
    restaurantName: {
        type: String,
        required: [true, 'Restaurant name is required']
    },
    
    // Category
    category: {
        type: String,
        required: [true, 'Category is required'],
        enum: ['Ana Yemek', 'Çorba', 'Salata', 'Tatlı', 'İçecek', 'Karma Menü', 'Diğer'],
        default: 'Karma Menü'
    },
    
    // Status
    status: {
        type: String,
        enum: ['active', 'inactive', 'sold_out', 'expired'],
        default: 'active'
    },
    
    // Image
    imageUrl: {
        type: String,
        default: 'https://via.placeholder.com/300x200?text=Paket+Görseli'
    },
    
    // Metadata
    tags: [{
        type: String,
        trim: true
    }],
    
    // Statistics
    views: {
        type: Number,
        default: 0
    },
    orders: {
        type: Number,
        default: 0
    },
    
    // Ratings
    rating: {
        type: Number,
        min: 0,
        max: 5,
        default: 0
    },
    reviewCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
packageSchema.index({ restaurant: 1, status: 1 });
packageSchema.index({ category: 1, status: 1 });
packageSchema.index({ availableUntil: 1 });
packageSchema.index({ createdAt: -1 });

// Virtual for availability status
packageSchema.virtual('isAvailable').get(function() {
    const now = new Date();
    return this.status === 'active' && 
           this.remainingQuantity > 0 && 
           now >= this.availableFrom && 
           now <= this.availableUntil;
});

// Virtual for discount amount
packageSchema.virtual('discountAmount').get(function() {
    return this.originalPrice - this.discountedPrice;
});

// Pre-save middleware to update status based on availability
packageSchema.pre('save', function(next) {
    const now = new Date();
    
    // Check if expired
    if (now > this.availableUntil) {
        this.status = 'expired';
    }
    
    // Check if sold out
    if (this.remainingQuantity <= 0) {
        this.status = 'sold_out';
    }
    
    next();
});

// Static method to find active packages
packageSchema.statics.findActive = function(filter = {}) {
    return this.find({
        ...filter,
        status: 'active',
        remainingQuantity: { $gt: 0 },
        availableUntil: { $gte: new Date() }
    });
};

// Static method to find by restaurant
packageSchema.statics.findByRestaurant = function(restaurantId, filter = {}) {
    return this.find({
        ...filter,
        restaurant: restaurantId
    }).populate('restaurant', 'name category');
};

// Instance method to check if can be ordered
packageSchema.methods.canBeOrdered = function() {
    return this.isAvailable && this.status === 'active';
};

// Instance method to reserve package
packageSchema.methods.reserve = function(quantity = 1) {
    if (this.remainingQuantity >= quantity) {
        this.remainingQuantity -= quantity;
        this.orders += quantity;
        return true;
    }
    return false;
};

const Package = mongoose.model('Package', packageSchema);

module.exports = Package;