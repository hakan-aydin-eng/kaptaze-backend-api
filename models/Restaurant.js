/**
 * Restaurant Model - Approved restaurant profiles
 */

const mongoose = require('mongoose');

const restaurantSchema = new mongoose.Schema({
    // Basic Information
    name: {
        type: String,
        required: [true, 'Restaurant name is required'],
        trim: true,
        maxlength: [100, 'Restaurant name cannot exceed 100 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    imageUrl: {
        type: String,
        trim: true,
        maxlength: [500, 'Image URL cannot exceed 500 characters']
    },
    category: {
        type: String,
        required: [true, 'Category is required'],
        trim: true
    },
    
    // Contact Information
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    
    // Address Information
    address: {
        street: {
            type: String,
            required: [true, 'Street address is required'],
            trim: true
        },
        district: {
            type: String,
            required: [true, 'District is required'],
            trim: true
        },
        city: {
            type: String,
            required: [true, 'City is required'],
            trim: true
        },
        postalCode: {
            type: String,
            trim: true
        }
    },
    
    // Location
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            index: '2dsphere'
        }
    },
    
    // Owner Information (from application)
    owner: {
        firstName: {
            type: String,
            required: [true, 'Owner first name is required']
        },
        lastName: {
            type: String,
            required: [true, 'Owner last name is required']
        },
        email: {
            type: String,
            required: [true, 'Owner email is required']
        },
        phone: {
            type: String,
            required: [true, 'Owner phone is required']
        }
    },
    
    // Business Information
    businessLicense: {
        number: String,
        issueDate: Date,
        expiryDate: Date
    },
    taxNumber: String,
    
    // Operational Information
    openingHours: [{
        day: {
            type: String,
            enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        },
        open: String,
        close: String,
        closed: {
            type: Boolean,
            default: false
        }
    }],
    
    // Service Options
    serviceOptions: {
        delivery: {
            type: Boolean,
            default: true
        },
        pickup: {
            type: Boolean,
            default: true
        },
        dineIn: {
            type: Boolean,
            default: false
        }
    },
    
    // Delivery Information
    deliveryInfo: {
        radius: {
            type: Number,
            default: 5 // km
        },
        fee: {
            type: Number,
            default: 0
        },
        minimumOrder: {
            type: Number,
            default: 0
        },
        estimatedTime: {
            type: Number,
            default: 30 // minutes
        }
    },
    
    // Images
    images: {
        logo: String,
        cover: String,
        gallery: [String]
    },
    profileImage: {
        type: String,
        trim: true
    },
    
    // Social Media
    socialMedia: {
        website: String,
        facebook: String,
        instagram: String,
        twitter: String
    },
    
    // Status and Settings
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended', 'pending_verification'],
        default: 'active'
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    
    // Ratings and Reviews
    rating: {
        average: {
            type: Number,
            default: 0,
            min: 0,
            max: 5
        },
        count: {
            type: Number,
            default: 0
        }
    },
    
    // Packages/Menu Items
    packages: [{
        id: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            trim: true
        },
        price: {
            type: Number,
            required: true,
            min: 0
        },
        originalPrice: {
            type: Number,
            min: 0
        },
        discountedPrice: {
            type: Number,
            min: 0
        },
        quantity: {
            type: Number,
            default: 1,
            min: 1
        },
        category: {
            type: String,
            default: 'general',
            trim: true
        },
        tags: [{
            type: String,
            trim: true
        }],
        availableUntil: {
            type: Date
        },
        specialInstructions: {
            type: String,
            trim: true
        },
        status: {
            type: String,
            enum: ['active', 'inactive', 'deleted'],
            default: 'active'
        },
        createdAt: {
            type: Date,
            default: Date.now
        },
        updatedAt: {
            type: Date,
            default: Date.now
        }
    }],

    // Statistics
    stats: {
        totalOrders: {
            type: Number,
            default: 0
        },
        totalRevenue: {
            type: Number,
            default: 0
        },
        activeMenuItems: {
            type: Number,
            default: 0
        }
    },
    
    // Linked Records
    applicationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Application',
        required: true
    },
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Settings
    settings: {
        autoAcceptOrders: {
            type: Boolean,
            default: false
        },
        notifications: {
            email: {
                type: Boolean,
                default: true
            },
            sms: {
                type: Boolean,
                default: false
            },
            push: {
                type: Boolean,
                default: true
            }
        }
    },
    
    // Metadata
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    lastActivity: Date
}, {
    timestamps: true
});

// Indexes for performance
restaurantSchema.index({ status: 1 });
restaurantSchema.index({ category: 1 });
restaurantSchema.index({ 'owner.email': 1 });
restaurantSchema.index({ applicationId: 1 });
restaurantSchema.index({ ownerId: 1 });
restaurantSchema.index({ location: '2dsphere' });

// Virtual for full address
restaurantSchema.virtual('fullAddress').get(function() {
    const addr = this.address;
    return `${addr.street}, ${addr.district}, ${addr.city}`;
});

// Virtual for owner full name
restaurantSchema.virtual('ownerFullName').get(function() {
    return `${this.owner.firstName} ${this.owner.lastName}`;
});

// Method to update statistics
restaurantSchema.methods.updateStats = async function() {
    // This would be called when orders are placed
    // Implementation would depend on Order model
    const Order = mongoose.model('Order');
    
    const stats = await Order.aggregate([
        { $match: { restaurantId: this._id, status: 'completed' } },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: '$totalAmount' }
            }
        }
    ]);
    
    if (stats.length > 0) {
        this.stats.totalOrders = stats[0].totalOrders;
        this.stats.totalRevenue = stats[0].totalRevenue;
        await this.save();
    }
};

// Method to calculate delivery availability for a location
restaurantSchema.methods.canDeliverTo = function(latitude, longitude) {
    if (!this.serviceOptions.delivery) return false;
    if (!this.location.coordinates) return false;
    
    // Calculate distance using Haversine formula (simplified)
    const R = 6371; // Earth's radius in km
    const dLat = (latitude - this.location.coordinates[1]) * Math.PI / 180;
    const dLon = (longitude - this.location.coordinates[0]) * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.location.coordinates[1] * Math.PI / 180) * 
              Math.cos(latitude * Math.PI / 180) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
              
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return distance <= this.deliveryInfo.radius;
};

// Static method to find nearby restaurants
restaurantSchema.statics.findNearby = function(longitude, latitude, maxDistance = 10000) {
    return this.find({
        status: 'active',
        location: {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates: [longitude, latitude]
                },
                $maxDistance: maxDistance // meters
            }
        }
    });
};

// Static method to search restaurants
restaurantSchema.statics.searchRestaurants = function(query, filters = {}) {
    const searchFilter = { status: 'active' };
    
    // Text search
    if (query) {
        searchFilter.$or = [
            { name: { $regex: query, $options: 'i' } },
            { category: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } }
        ];
    }
    
    // Category filter
    if (filters.category) {
        searchFilter.category = filters.category;
    }
    
    // Rating filter
    if (filters.minRating) {
        searchFilter['rating.average'] = { $gte: filters.minRating };
    }
    
    // Service options
    if (filters.delivery) {
        searchFilter['serviceOptions.delivery'] = true;
    }
    
    if (filters.pickup) {
        searchFilter['serviceOptions.pickup'] = true;
    }
    
    return this.find(searchFilter).sort({ 'rating.average': -1, 'stats.totalOrders': -1 });
};

module.exports = mongoose.model('Restaurant', restaurantSchema);