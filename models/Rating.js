/**
 * Rating Model - For order ratings and reviews
 */

const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
    // Core rating data
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: [true, 'Order ID is required'],
        index: true
    },

    // User who submitted the rating
    consumerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Consumer',
        required: [true, 'Consumer ID is required'],
        index: true
    },

    // Restaurant being rated
    restaurantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Restaurant',
        required: [true, 'Restaurant ID is required'],
        index: true
    },

    // Rating details
    rating: {
        type: Number,
        required: [true, 'Rating is required'],
        min: [1, 'Rating must be at least 1'],
        max: [5, 'Rating cannot exceed 5'],
        validate: {
            validator: function(v) {
                return Number.isInteger(v);
            },
            message: 'Rating must be a whole number'
        }
    },

    comment: {
        type: String,
        trim: true,
        maxlength: [500, 'Comment cannot exceed 500 characters']
    },

    // Photos uploaded with the rating
    photos: [{
        url: {
            type: String,
            required: true
        },
        filename: String,
        originalName: String,
        size: Number,
        mimeType: String,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],

    // Additional metadata
    helpful: {
        type: Number,
        default: 0
    },

    reported: {
        type: Boolean,
        default: false
    },

    isPublic: {
        type: Boolean,
        default: true
    },

    // Package information
    packageInfo: {
        packageId: String,
        packageName: String,
        packagePrice: Number
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
ratingSchema.index({ orderId: 1 }, { unique: true }); // One rating per order
ratingSchema.index({ restaurantId: 1, createdAt: -1 });
ratingSchema.index({ consumerId: 1, createdAt: -1 });
ratingSchema.index({ rating: 1 });

// Virtual for rating text
ratingSchema.virtual('ratingText').get(function() {
    const ratingTexts = {
        1: 'Çok Kötü',
        2: 'Kötü',
        3: 'Orta',
        4: 'İyi',
        5: 'Mükemmel'
    };
    return ratingTexts[this.rating] || 'Bilinmeyen';
});

// Static method to get restaurant average rating
ratingSchema.statics.getRestaurantAverageRating = async function(restaurantId) {
    const stats = await this.aggregate([
        { $match: { restaurantId: new mongoose.Types.ObjectId(restaurantId), isPublic: true } },
        {
            $group: {
                _id: null,
                averageRating: { $avg: '$rating' },
                totalRatings: { $sum: 1 },
                ratingDistribution: {
                    $push: '$rating'
                }
            }
        }
    ]);

    if (stats.length === 0) {
        return {
            averageRating: 0,
            totalRatings: 0,
            ratingDistribution: [0, 0, 0, 0, 0]
        };
    }

    const result = stats[0];

    // Calculate rating distribution
    const distribution = [0, 0, 0, 0, 0];
    result.ratingDistribution.forEach(rating => {
        distribution[rating - 1]++;
    });

    return {
        averageRating: Math.round(result.averageRating * 10) / 10, // Round to 1 decimal
        totalRatings: result.totalRatings,
        ratingDistribution: distribution
    };
};

// Static method to get recent ratings for a restaurant
ratingSchema.statics.getRestaurantRatings = async function(restaurantId, limit = 10, offset = 0) {
    return this.find({
        restaurantId: new mongoose.Types.ObjectId(restaurantId),
        isPublic: true
    })
    .populate('consumerId', 'name email')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(offset)
    .lean();
};

// Method to check if rating can be edited (within 24 hours)
ratingSchema.methods.canEdit = function() {
    const twentyFourHours = 24 * 60 * 60 * 1000;
    return (Date.now() - this.createdAt.getTime()) < twentyFourHours;
};

// Pre-save middleware
ratingSchema.pre('save', function(next) {
    // Ensure photos array is not too large
    if (this.photos && this.photos.length > 1) {
        return next(new Error('Maximum 1 photo allowed per rating'));
    }
    next();
});

// Post-save middleware to update restaurant average rating
ratingSchema.post('save', async function() {
    try {
        const Restaurant = mongoose.model('Restaurant');
        const stats = await this.constructor.getRestaurantAverageRating(this.restaurantId);

        await Restaurant.findByIdAndUpdate(this.restaurantId, {
            'rating.average': stats.averageRating,
            'rating.total': stats.totalRatings
        });

        console.log(`✅ Updated restaurant ${this.restaurantId} rating: ${stats.averageRating}/5 (${stats.totalRatings} reviews)`);
    } catch (error) {
        console.error('❌ Error updating restaurant rating:', error);
    }
});

module.exports = mongoose.model('Rating', ratingSchema);