/**
 * User Model - For all system users (admin, restaurant owners)
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    // Basic Info
    firstName: {
        type: String,
        required: [true, 'First name is required'],
        trim: true,
        maxlength: [50, 'First name cannot exceed 50 characters']
    },
    lastName: {
        type: String,
        required: [true, 'Last name is required'],
        trim: true,
        maxlength: [50, 'Last name cannot exceed 50 characters']
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
        match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
    },
    
    // Authentication
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        minlength: [3, 'Username must be at least 3 characters'],
        maxlength: [30, 'Username cannot exceed 30 characters'],
        match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers and underscores']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters']
    },
    
    // Role & Status
    role: {
        type: String,
        enum: ['admin', 'restaurant'],
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    },
    
    // Restaurant-specific fields
    restaurantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Restaurant'
    },
    
    // Security
    lastLogin: {
        type: Date
    },
    passwordResetToken: String,
    passwordResetExpires: Date,
    emailVerificationToken: String,
    emailVerified: {
        type: Boolean,
        default: false
    },
    
    // Metadata
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    loginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: Date
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
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ restaurantId: 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
    return `${this.firstName} ${this.lastName}`;
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
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
userSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Method to check if account is locked
userSchema.methods.isLocked = function() {
    return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Method to increment login attempts
userSchema.methods.incLoginAttempts = function() {
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
userSchema.methods.resetLoginAttempts = function() {
    return this.updateOne({
        $unset: {
            loginAttempts: 1,
            lockUntil: 1
        }
    });
};

// Static method to find by credentials
userSchema.statics.findByCredentials = async function(username, password) {
    const user = await this.findOne({ 
        username: username,
        status: 'active'
    });
    
    if (!user) {
        throw new Error('Invalid credentials');
    }
    
    if (user.isLocked()) {
        throw new Error('Account locked due to too many failed login attempts');
    }
    
    const isMatch = await user.matchPassword(password);
    
    if (!isMatch) {
        await user.incLoginAttempts();
        throw new Error('Invalid credentials');
    }
    
    // Reset login attempts on successful login
    if (user.loginAttempts > 0) {
        await user.resetLoginAttempts();
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    return user;
};

module.exports = mongoose.model('User', userSchema);