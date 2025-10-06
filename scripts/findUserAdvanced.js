/**
 * Advanced User Finder - Uses server connection context
 * Usage: node scripts/findUserAdvanced.js rsmcihan@hotmail.com
 */

require('dotenv').config();

// Use the database connection from the server setup
const { connectDB } = require('../utils/db-setup');

// Import models after connection
let User, Application, Restaurant;

async function findUserByEmail(email) {
    try {
        // Connect to database using server's method
        console.log('🔗 Connecting to database...');
        await connectDB();

        // Import models after successful connection
        User = require('../models/User');
        Application = require('../models/Application');
        Restaurant = require('../models/Restaurant');

        const searchEmail = email.toLowerCase().trim();
        console.log(`\n🔍 Searching for user with email: ${searchEmail}\n`);

        // Search in all collections simultaneously
        const [user, application, restaurant] = await Promise.all([
            User.findOne({ email: searchEmail }).populate('restaurantId').catch(err => {
                console.log(`Warning: Error searching User collection: ${err.message}`);
                return null;
            }),
            Application.findOne({ email: searchEmail })
                .populate('restaurantId')
                .populate('userId')
                .catch(err => {
                    console.log(`Warning: Error searching Application collection: ${err.message}`);
                    return null;
                }),
            Restaurant.findOne({ 'owner.email': searchEmail }).catch(err => {
                console.log(`Warning: Error searching Restaurant collection: ${err.message}`);
                return null;
            })
        ]);

        // Report findings
        console.log('📋 SEARCH RESULTS:');
        console.log('═══════════════════\n');

        if (user) {
            console.log('✅ FOUND IN USER COLLECTION:');
            console.log(`📧 Email: ${user.email}`);
            console.log(`👤 Name: ${user.firstName} ${user.lastName}`);
            console.log(`🔑 Username: ${user.username}`);
            console.log(`📱 Phone: ${user.phone || 'N/A'}`);
            console.log(`🏷️  Role: ${user.role}`);
            console.log(`📊 Status: ${user.status}`);
            console.log(`✉️  Email Verified: ${user.emailVerified}`);
            console.log(`🕐 Last Login: ${user.lastLogin || 'Never'}`);
            console.log(`📅 Created: ${user.createdAt}`);

            if (user.restaurantId) {
                console.log(`🏪 Restaurant: ${user.restaurantId.name} (${user.restaurantId.status})`);
            }
            console.log('');
        } else {
            console.log('❌ NOT FOUND IN USER COLLECTION\n');
        }

        if (application) {
            console.log('✅ FOUND IN APPLICATION COLLECTION:');
            console.log(`📧 Email: ${application.email}`);
            console.log(`👤 Name: ${application.firstName} ${application.lastName}`);
            console.log(`🏢 Business: ${application.businessName}`);
            console.log(`📍 Location: ${application.businessAddress}, ${application.district}, ${application.city}`);
            console.log(`📊 Status: ${application.status}`);
            console.log(`🔑 Requested Username: ${application.restaurantUsername || 'Not provided'}`);
            console.log(`🔐 Password Set: ${application.restaurantPassword ? 'Yes' : 'No'}`);

            if (application.generatedCredentials) {
                console.log(`🆔 Generated Username: ${application.generatedCredentials.username}`);
                console.log(`📅 Credentials Generated: ${application.generatedCredentials.createdAt}`);
            } else {
                console.log(`🆔 Generated Credentials: No`);
            }

            console.log(`✉️  Email Sent: ${application.emailSent ? 'Yes' : 'No'}`);
            if (application.emailSentAt) {
                console.log(`📨 Email Sent At: ${application.emailSentAt}`);
            }
            if (application.emailError) {
                console.log(`❌ Email Error: ${application.emailError}`);
            }

            console.log(`👔 Reviewed By: ${application.reviewedBy || 'Not reviewed'}`);
            console.log(`📅 Reviewed At: ${application.reviewedAt || 'Not reviewed'}`);
            console.log(`📅 Applied: ${application.createdAt}`);

            if (application.rejectionReason) {
                console.log(`❌ Rejection Reason: ${application.rejectionReason}`);
            }
            console.log('');
        } else {
            console.log('❌ NOT FOUND IN APPLICATION COLLECTION\n');
        }

        if (restaurant) {
            console.log('✅ FOUND IN RESTAURANT COLLECTION:');
            console.log(`🏪 Name: ${restaurant.name}`);
            console.log(`📊 Status: ${restaurant.status}`);
            console.log(`👤 Owner: ${restaurant.owner.firstName} ${restaurant.owner.lastName}`);
            console.log(`📧 Owner Email: ${restaurant.owner.email}`);
            console.log(`📱 Owner Phone: ${restaurant.owner.phone}`);
            console.log(`🆔 Application ID: ${restaurant.applicationId}`);
            console.log(`👔 Owner User ID: ${restaurant.ownerId}`);
            console.log(`📅 Created: ${restaurant.createdAt}`);
            console.log('');
        } else {
            console.log('❌ NOT FOUND IN RESTAURANT COLLECTION\n');
        }

        // Generate action recommendations
        console.log('🎯 RECOMMENDATION:');
        console.log('═══════════════════');

        if (user && user.role === 'restaurant') {
            console.log('✅ USER IS FULLY SET UP');
            console.log('📧 LOGIN CREDENTIALS TO SEND:');
            console.log(`   Username: ${user.username}`);
            console.log(`   Password: [Need to reset - see recommendation below]`);
            console.log(`   Login URL: https://kaptaze.com/restaurant-login`);

            if (user.status !== 'active') {
                console.log(`⚠️  WARNING: Account status is "${user.status}" - may need to activate`);
            }

            console.log('\n🔧 RECOMMENDED ACTION:');
            console.log('1. Send password reset email using the system');
            console.log('2. Or manually reset password and send new credentials');
            console.log('3. Ensure account status is "active"');

        } else if (application) {
            if (application.status === 'pending') {
                console.log('⏳ APPLICATION IS PENDING APPROVAL');
                console.log('🔧 RECOMMENDED ACTION:');
                console.log('1. Review and approve the application first');
                console.log('2. System will auto-generate login credentials');
                console.log('3. Approval email will be sent automatically');

            } else if (application.status === 'approved' && !user) {
                console.log('❗ APPLICATION APPROVED BUT USER NOT CREATED');
                console.log('🔧 RECOMMENDED ACTION:');
                console.log('1. There may be a system error');
                console.log('2. Check application approval process');
                console.log('3. May need to manually create user account');

            } else if (application.status === 'rejected') {
                console.log('❌ APPLICATION WAS REJECTED');
                console.log(`📝 Reason: ${application.rejectionReason || 'Not specified'}`);
                console.log('🔧 RECOMMENDED ACTION:');
                console.log('1. Review rejection reason with applicant');
                console.log('2. If appropriate, ask them to reapply');

            } else if (application.status === 'approved' && user) {
                console.log('✅ APPLICATION APPROVED AND USER EXISTS');
                console.log('🔧 RECOMMENDED ACTION:');
                console.log('1. Send password reset email');
                console.log('2. Or provide manual login credentials');
            }
        } else {
            console.log('❌ NO RECORDS FOUND');
            console.log('🔧 RECOMMENDED ACTION:');
            console.log('1. Double-check the email address');
            console.log('2. Check if they used a different email to apply');
            console.log('3. Ask them to submit a new application');
        }

        return { user, application, restaurant };

    } catch (error) {
        console.error('❌ Error during search:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

// Get email from command line arguments
const email = process.argv[2];

if (!email) {
    console.log('Usage: node scripts/findUserAdvanced.js <email>');
    console.log('Example: node scripts/findUserAdvanced.js rsmcihan@hotmail.com');
    process.exit(1);
}

// Run the search
findUserByEmail(email).then(() => {
    console.log('\n✅ Search completed');
    process.exit(0);
}).catch((error) => {
    console.error('\n❌ Search failed:', error.message);
    process.exit(1);
});