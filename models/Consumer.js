/**
 * Consumer Model - For mobile app users
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const consumerSchema = new mongoose.Schema({
    // Basic Info
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        maxlength: [50, 'Name cannot exceed 50 characters']
    },
    surname: {
        type: String,
        required: [true, 'Surname is required'],
        trim: true,
        maxlength: [50, 'Surname cannot exceed 50 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    phone: {
        type: String,
        trim: true,
        match: [/^(\+90|0)?[5][0-9]{9}$/, 'Please enter a valid Turkish phone number']
    },
    
    // Authentication
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters']
    },
    
    // Status & Activity
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    
    // Location preferences
    preferredLocation: {
        type: String,
        trim: true
    },
    coordinates: {
        latitude: Number,
        longitude: Number
    },
    
    // App usage statistics
    orderCount: {
        type: Number,
        default: 0
    },
    totalSpent: {
        type: Number,
        default: 0
    },
    favoriteRestaurants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Restaurant'
    }],
    
    // Security & Verification
    emailVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationToken: String,
    passwordResetToken: String,
    passwordResetExpires: Date,
    
    // Account security
    loginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: Date,
    
    // Device info (optional)
    deviceInfo: {
        platform: String, // 'ios' or 'android'
        version: String,
        deviceId: String
    },
    // Push notification token
    pushToken: {
        token: String,
        platform: {
            type: String,
            enum: ['ios', 'android', 'expo']
        },
        deviceInfo: {
            brand: String,
            model: String,
            osVersion: String
        },
        lastUpdated: {
            type: Date,
            default: Date.now
        }
    },

    
    // Notification preferences
    notifications: {
        orders: { type: Boolean, default: true },
        promotions: { type: Boolean, default: true },
        news: { type: Boolean, default: false }
    }
}, {
    timestamps: true,
    toJSON: { 
        transform: function(doc, ret) {
            delete ret.password;
            delete ret.passwordResetToken;
            delete ret.emailVerificationToken;
            return ret;
        }
    }
});

// Indexes for performance
consumerSchema.index({ email: 1 });
consumerSchema.index({ phone: 1 });
consumerSchema.index({ status: 1 });
consumerSchema.index({ createdAt: -1 });
consumerSchema.index({ lastActivity: -1 });

// Virtual for full name
consumerSchema.virtual('fullName').get(function() {
    return `${this.name} ${this.surname}`;
});

// Pre-save middleware to hash password
consumerSchema.pre('save', async function(next) {
    // Only hash the password if it has been modified (or is new)
    if (!this.isModified('password')) return next();
    
    try {
        // Hash password with cost of 12
        const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
        this.password = await bcrypt.hash(this.password, saltRounds);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to check password
consumerSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Method to check if account is locked
consumerSchema.methods.isLocked = function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Method to increment login attempts
consumerSchema.methods.incLoginAttempts = function() {
    const maxAttempts = 5;
    const lockTime = 2 * 60 * 60 * 1000; // 2 hours
    
    // If we have previous lock that has expired, restart at 1
    if (this.lockUntil && this.lockUntil < Date.now()) {
        return this.updateOne({
            $unset: {
                lockUntil: 1
            },
            $set: {
                loginAttempts: 1
            }
        });
    }
    
    const updates = { $inc: { loginAttempts: 1 } };
    
    // Lock account after max attempts and we're not locked already
    if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked()) {
        updates.$set = {
            lockUntil: Date.now() + lockTime
        };
    }
    
    return this.updateOne(updates);
};

// Method to reset login attempts
consumerSchema.methods.resetLoginAttempts = function() {
    return this.updateOne({
        $unset: {
            loginAttempts: 1,
            lockUntil: 1
        }
    });
};

// Static method to find by credentials
consumerSchema.statics.findByCredentials = async function(email, password) {
    const consumer = await this.findOne({ 
        email: email.toLowerCase(),
        status: 'active'
    });
    
    if (!consumer) {
        throw new Error('Invalid credentials');
    }
    
    if (consumer.isLocked()) {
        throw new Error('Account locked due to too many failed login attempts');
    }
    
    const isMatch = await consumer.matchPassword(password);
    
    if (!isMatch) {
        await consumer.incLoginAttempts();
        throw new Error('Invalid credentials');
    }
    
    // Reset login attempts on successful login
    if (consumer.loginAttempts > 0) {
        await consumer.resetLoginAttempts();
    }
    
    // Update last activity
    consumer.lastActivity = new Date();
    await consumer.save();
    
    return consumer;
};

module.exports = mongoose.model('Consumer', consumerSchema);