/**
 * Application Model - Customer applications for restaurant registration
 */

const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
    // Application ID (for external reference)
    applicationId: {
        type: String,
        unique: true
    },
    
    // Personal Information
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
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true,
        match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
    },
    
    // Business Information
    businessName: {
        type: String,
        required: [true, 'Business name is required'],
        trim: true,
        maxlength: [100, 'Business name cannot exceed 100 characters']
    },
    businessCategory: {
        type: String,
        required: [true, 'Business category is required'],
        trim: true
    },
    businessAddress: {
        type: String,
        required: [true, 'Business address is required'],
        trim: true
    },
    city: {
        type: String,
        required: [true, 'City is required'],
        trim: true
    },
    district: {
        type: String,
        required: [true, 'District is required'],
        trim: true
    },
    
    // Location
    businessLatitude: {
        type: Number,
        validate: {
            validator: function(v) {
                return v >= -90 && v <= 90;
            },
            message: 'Latitude must be between -90 and 90'
        }
    },
    businessLongitude: {
        type: Number,
        validate: {
            validator: function(v) {
                return v >= -180 && v <= 180;
            },
            message: 'Longitude must be between -180 and 180'
        }
    },
    
    // Credentials (for restaurant login)
    restaurantUsername: {
        type: String,
        trim: true,
        minlength: [3, 'Username must be at least 3 characters'],
        maxlength: [30, 'Username cannot exceed 30 characters']
    },
    restaurantPassword: {
        type: String,
        minlength: [6, 'Password must be at least 6 characters']
    },
    
    // Application Status
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    
    // Processing Information
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewedAt: Date,
    rejectionReason: String,
    
    // Generated credentials (when approved)
    generatedCredentials: {
        username: String,
        passwordHash: String,
        createdAt: Date
    },
    
    // Linked Restaurant (after approval)
    restaurantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Restaurant'
    },
    
    // Linked User (after approval)
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    
    // Additional Notes
    notes: String,
    adminNotes: String,
    
    // Source tracking
    source: {
        type: String,
        default: 'web_form'
    },
    
    // IP and User Agent for security
    ipAddress: String,
    userAgent: String
}, {
    timestamps: true
});

// Indexes for performance
applicationSchema.index({ applicationId: 1 });
applicationSchema.index({ status: 1 });
applicationSchema.index({ email: 1 });
applicationSchema.index({ businessName: 1 });
applicationSchema.index({ createdAt: -1 });
applicationSchema.index({ reviewedBy: 1 });

// Virtual for full name
applicationSchema.virtual('applicantName').get(function() {
    return `${this.firstName} ${this.lastName}`;
});

// Virtual for full address
applicationSchema.virtual('fullAddress').get(function() {
    return `${this.businessAddress}, ${this.district}, ${this.city}`;
});

// Pre-save middleware to generate applicationId
applicationSchema.pre('save', function(next) {
    if (!this.applicationId) {
        // Generate unique application ID
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 11);
        this.applicationId = `APP_${timestamp}_${randomStr}`;
    }
    next();
});

// Method to approve application
applicationSchema.methods.approve = async function(adminUserId, credentials) {
    this.status = 'approved';
    this.reviewedBy = adminUserId;
    this.reviewedAt = new Date();
    
    if (credentials) {
        this.generatedCredentials = {
            username: credentials.username,
            passwordHash: credentials.passwordHash,
            createdAt: new Date()
        };
    }
    
    return this.save();
};

// Method to reject application
applicationSchema.methods.reject = async function(adminUserId, reason) {
    this.status = 'rejected';
    this.reviewedBy = adminUserId;
    this.reviewedAt = new Date();
    this.rejectionReason = reason;
    
    return this.save();
};

// Static method to get pending applications
applicationSchema.statics.getPending = function() {
    return this.find({ status: 'pending' })
        .sort({ createdAt: -1 })
        .populate('reviewedBy', 'firstName lastName email');
};

// Static method to search applications
applicationSchema.statics.searchApplications = function(query, status, page = 1, limit = 20) {
    const filter = {};
    
    if (status && status !== 'all') {
        filter.status = status;
    }
    
    if (query) {
        filter.$or = [
            { businessName: { $regex: query, $options: 'i' } },
            { firstName: { $regex: query, $options: 'i' } },
            { lastName: { $regex: query, $options: 'i' } },
            { email: { $regex: query, $options: 'i' } },
            { applicationId: { $regex: query, $options: 'i' } }
        ];
    }
    
    const skip = (page - 1) * limit;
    
    return this.find(filter)
        .populate('reviewedBy', 'firstName lastName email')
        .populate('restaurantId', 'name status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
};

module.exports = mongoose.model('Application', applicationSchema);