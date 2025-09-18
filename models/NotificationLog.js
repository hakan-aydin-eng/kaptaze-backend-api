/**
 * NotificationLog Model - For tracking sent notifications
 */

const mongoose = require('mongoose');

const notificationLogSchema = new mongoose.Schema({
    // Notification Details
    title: {
        type: String,
        required: [true, 'Notification title is required'],
        trim: true,
        maxlength: [100, 'Title cannot exceed 100 characters']
    },
    message: {
        type: String,
        required: [true, 'Notification message is required'],
        trim: true,
        maxlength: [500, 'Message cannot exceed 500 characters']
    },
    type: {
        type: String,
        enum: ['general', 'promotion', 'city', 'restaurant', 'test'],
        required: true
    },
    priority: {
        type: String,
        enum: ['normal', 'high', 'urgent'],
        default: 'normal'
    },

    // Targeting Information
    targetType: {
        type: String,
        enum: ['all', 'city', 'restaurant', 'location'],
        required: true
    },
    targetDetails: {
        // For city-based notifications
        city: String,
        coordinates: {
            latitude: Number,
            longitude: Number
        },
        radius: Number,

        // For restaurant-based notifications
        restaurantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Restaurant'
        },
        restaurantName: String
    },

    // Delivery Statistics
    stats: {
        totalTokens: { type: Number, default: 0 },
        validTokens: { type: Number, default: 0 },
        skippedTokens: { type: Number, default: 0 },
        successCount: { type: Number, default: 0 },
        failureCount: { type: Number, default: 0 },
        consumerCount: { type: Number, default: 0 }
    },

    // Status and Timing
    status: {
        type: String,
        enum: ['pending', 'sending', 'completed', 'failed'],
        default: 'pending'
    },
    sentAt: Date,
    completedAt: Date,

    // Admin Info
    sentBy: {
        type: String,
        default: 'Admin Panel'
    },
    ipAddress: String,

    // Additional Data
    data: {
        action: String,
        url: String,
        imageUrl: String,
        extra: mongoose.Schema.Types.Mixed
    },

    // Error Information
    error: {
        message: String,
        code: String,
        details: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
notificationLogSchema.index({ type: 1, createdAt: -1 });
notificationLogSchema.index({ status: 1, createdAt: -1 });
notificationLogSchema.index({ sentAt: -1 });
notificationLogSchema.index({ 'targetDetails.restaurantId': 1 });
notificationLogSchema.index({ 'targetDetails.city': 1 });

// Virtual for delivery rate
notificationLogSchema.virtual('deliveryRate').get(function() {
    if (this.stats.validTokens === 0) return 0;
    return Math.round((this.stats.successCount / this.stats.validTokens) * 100);
});

// Virtual for duration
notificationLogSchema.virtual('duration').get(function() {
    if (!this.sentAt || !this.completedAt) return null;
    return Math.round((this.completedAt - this.sentAt) / 1000); // seconds
});

// Static method to get stats
notificationLogSchema.statics.getStats = async function(startDate, endDate) {
    const matchStage = {};

    if (startDate && endDate) {
        matchStage.createdAt = {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        };
    }

    const stats = await this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: null,
                totalNotifications: { $sum: 1 },
                totalReached: { $sum: '$stats.successCount' },
                totalFavoriteNotifications: {
                    $sum: {
                        $cond: [{ $eq: ['$type', 'restaurant'] }, 1, 0]
                    }
                },
                totalProximityNotifications: {
                    $sum: {
                        $cond: [{ $eq: ['$targetType', 'location'] }, 1, 0]
                    }
                },
                averageDeliveryRate: { $avg: '$deliveryRate' },
                totalConsumersReached: { $sum: '$stats.consumerCount' }
            }
        }
    ]);

    return stats[0] || {
        totalNotifications: 0,
        totalReached: 0,
        totalFavoriteNotifications: 0,
        totalProximityNotifications: 0,
        averageDeliveryRate: 0,
        totalConsumersReached: 0
    };
};

// Static method to get recent notifications
notificationLogSchema.statics.getRecentNotifications = async function(limit = 10) {
    return this.find({})
        .populate('targetDetails.restaurantId', 'name')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
};

module.exports = mongoose.model('NotificationLog', notificationLogSchema);