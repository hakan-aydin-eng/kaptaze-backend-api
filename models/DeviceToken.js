const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
        unique: true
    },
    consumerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Consumer',
        required: false // Not required - device can exist without user
    },
    deviceId: {
        type: String,
        required: false
    },
    platform: {
        type: String,
        enum: ['ios', 'android', 'expo'],
        default: 'expo'
    },
    deviceInfo: {
        brand: String,
        model: String,
        osVersion: String
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for faster queries
deviceTokenSchema.index({ token: 1 });
deviceTokenSchema.index({ consumerId: 1 });
deviceTokenSchema.index({ isActive: 1 });

const DeviceToken = mongoose.model('DeviceToken', deviceTokenSchema);

module.exports = DeviceToken;