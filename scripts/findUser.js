/**
 * Script to find user by email in MongoDB database
 * Usage: node scripts/findUser.js rsmcihan@hotmail.com
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const User = require('../models/User');
const Application = require('../models/Application');
const Restaurant = require('../models/Restaurant');

async function findUserByEmail(email) {
    try {
        // Connect to MongoDB using the same configuration as the server
        console.log(`🔗 Connecting to MongoDB...`);
        const mongoUri = process.env.MONGODB_URI;
        console.log(`📍 URI: ${mongoUri ? mongoUri.replace(/:[^:]*@/, ':****@') : 'undefined'}`);

        const conn = await mongoose.connect(mongoUri, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            useNewUrlParser: true,
            useUnifiedTopology: true,
            bufferCommands: false
        });

        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        console.log(`📊 Database: ${conn.connection.name}`);

        const searchEmail = email.toLowerCase().trim();
        console.log(`\n🔍 Searching for user with email: ${searchEmail}\n`);

        // Search in User collection
        console.log('📋 Checking User collection...');
        const user = await User.findOne({ email: searchEmail }).populate('restaurantId');

        if (user) {
            console.log('✅ Found in User collection:');
            console.log(`   - ID: ${user._id}`);
            console.log(`   - Name: ${user.firstName} ${user.lastName}`);
            console.log(`   - Username: ${user.username}`);
            console.log(`   - Email: ${user.email}`);
            console.log(`   - Phone: ${user.phone || 'N/A'}`);
            console.log(`   - Role: ${user.role}`);
            console.log(`   - Status: ${user.status}`);
            console.log(`   - Email Verified: ${user.emailVerified}`);
            console.log(`   - Restaurant ID: ${user.restaurantId ? user.restaurantId._id : 'N/A'}`);
            console.log(`   - Last Login: ${user.lastLogin || 'Never'}`);
            console.log(`   - Created: ${user.createdAt}`);

            if (user.restaurantId) {
                console.log(`   - Restaurant Name: ${user.restaurantId.name}`);
                console.log(`   - Restaurant Status: ${user.restaurantId.status}`);
            }
        } else {
            console.log('❌ Not found in User collection');
        }

        // Search in Application collection
        console.log('\n📋 Checking Application collection...');
        const application = await Application.findOne({ email: searchEmail })
            .populate('restaurantId')
            .populate('userId');

        if (application) {
            console.log('✅ Found in Application collection:');
            console.log(`   - Application ID: ${application.applicationId}`);
            console.log(`   - ID: ${application._id}`);
            console.log(`   - Name: ${application.firstName} ${application.lastName}`);
            console.log(`   - Email: ${application.email}`);
            console.log(`   - Phone: ${application.phone}`);
            console.log(`   - Business Name: ${application.businessName}`);
            console.log(`   - Business Category: ${application.businessCategory}`);
            console.log(`   - Business Address: ${application.businessAddress}, ${application.district}, ${application.city}`);
            console.log(`   - Status: ${application.status}`);
            console.log(`   - Restaurant Username: ${application.restaurantUsername || 'Not set'}`);
            console.log(`   - Password Hash: ${application.restaurantPassword ? '[SET]' : 'Not set'}`);
            console.log(`   - Generated Credentials: ${application.generatedCredentials ? 'Yes' : 'No'}`);

            if (application.generatedCredentials) {
                console.log(`   - Generated Username: ${application.generatedCredentials.username}`);
                console.log(`   - Generated at: ${application.generatedCredentials.createdAt}`);
            }

            console.log(`   - Email Sent: ${application.emailSent}`);
            console.log(`   - Email Sent At: ${application.emailSentAt || 'Never'}`);
            console.log(`   - Email Error: ${application.emailError || 'None'}`);
            console.log(`   - Reviewed By: ${application.reviewedBy || 'Not reviewed'}`);
            console.log(`   - Reviewed At: ${application.reviewedAt || 'Not reviewed'}`);
            console.log(`   - Rejection Reason: ${application.rejectionReason || 'N/A'}`);
            console.log(`   - Restaurant ID: ${application.restaurantId ? application.restaurantId._id : 'Not created'}`);
            console.log(`   - User ID: ${application.userId ? application.userId._id : 'Not created'}`);
            console.log(`   - Created: ${application.createdAt}`);
            console.log(`   - Notes: ${application.notes || 'None'}`);
            console.log(`   - Admin Notes: ${application.adminNotes || 'None'}`);
        } else {
            console.log('❌ Not found in Application collection');
        }

        // Search in Restaurant collection (by owner email)
        console.log('\n📋 Checking Restaurant collection...');
        const restaurant = await Restaurant.findOne({ 'owner.email': searchEmail });

        if (restaurant) {
            console.log('✅ Found in Restaurant collection:');
            console.log(`   - Restaurant ID: ${restaurant._id}`);
            console.log(`   - Restaurant Name: ${restaurant.name}`);
            console.log(`   - Status: ${restaurant.status}`);
            console.log(`   - Owner: ${restaurant.owner.firstName} ${restaurant.owner.lastName}`);
            console.log(`   - Owner Email: ${restaurant.owner.email}`);
            console.log(`   - Owner Phone: ${restaurant.owner.phone}`);
            console.log(`   - Application ID: ${restaurant.applicationId}`);
            console.log(`   - Owner User ID: ${restaurant.ownerId}`);
            console.log(`   - Created: ${restaurant.createdAt}`);
        } else {
            console.log('❌ Not found in Restaurant collection');
        }

        // Summary and recommendations
        console.log('\n📋 SUMMARY:');

        if (user && application) {
            console.log('✅ Complete records found - User has been fully processed');
            console.log('📧 LOGIN CREDENTIALS:');
            console.log(`   Username: ${user.username}`);
            console.log(`   Status: Account ${user.status}`);
            if (user.restaurantId) {
                console.log(`   Restaurant: ${user.restaurantId.name} (${user.restaurantId.status})`);
            }
        } else if (application && !user) {
            console.log('⚠️  Application exists but User account not created yet');
            console.log('📧 POTENTIAL CREDENTIALS:');
            if (application.restaurantUsername) {
                console.log(`   Requested Username: ${application.restaurantUsername}`);
            }
            if (application.generatedCredentials) {
                console.log(`   Generated Username: ${application.generatedCredentials.username}`);
            }
            console.log(`   Status: ${application.status}`);

            if (application.status === 'pending') {
                console.log('❗ Action needed: Application needs to be approved first');
            } else if (application.status === 'approved' && !user) {
                console.log('❗ Issue: Application approved but User account not created');
            }
        } else if (user && !application) {
            console.log('⚠️  User account exists but no application record found');
        } else {
            console.log('❌ No records found for this email address');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

// Get email from command line arguments
const email = process.argv[2];

if (!email) {
    console.log('Usage: node scripts/findUser.js <email>');
    console.log('Example: node scripts/findUser.js rsmcihan@hotmail.com');
    process.exit(1);
}

findUserByEmail(email);