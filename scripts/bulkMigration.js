/**
 * Bulk Migration Script
 * One-time migration for all existing users
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Consumer = require('../models/Consumer');

async function runBulkMigration() {
    try {
        console.log('🚀 Starting bulk migration for all consumers...');

        // Find all consumers that need migration
        const consumersToUpdate = await Consumer.find({
            $or: [
                { favoriteRestaurants: { $exists: false } },
                { favoriteRestaurants: { $type: "string" } }, // Old single restaurant format
                { pushTokens: { $exists: false } },
                { inAppNotifications: { $exists: false } },
                { notificationPreferences: { $exists: false } }
            ]
        });

        console.log(`📊 Found ${consumersToUpdate.length} consumers that need migration`);

        let migratedCount = 0;

        for (const consumer of consumersToUpdate) {
            const updates = {};

            // Fix favoriteRestaurants array
            if (!consumer.favoriteRestaurants || !Array.isArray(consumer.favoriteRestaurants)) {
                if (typeof consumer.favoriteRestaurants === 'string') {
                    // Old format: single restaurant ID as string
                    updates.favoriteRestaurants = [consumer.favoriteRestaurants];
                } else {
                    updates.favoriteRestaurants = [];
                }
            }

            // Ensure pushTokens array
            if (!consumer.pushTokens || !Array.isArray(consumer.pushTokens)) {
                updates.pushTokens = [];
            }

            // Ensure inAppNotifications array
            if (!consumer.inAppNotifications || !Array.isArray(consumer.inAppNotifications)) {
                updates.inAppNotifications = [];
            }

            // Ensure notificationPreferences
            if (!consumer.notificationPreferences) {
                updates.notificationPreferences = {
                    push: true,
                    email: true,
                    favorites: true,
                    proximity: true,
                    promotions: true
                };
            }

            // Apply updates if needed
            if (Object.keys(updates).length > 0) {
                await Consumer.findByIdAndUpdate(
                    consumer._id,
                    { $set: updates },
                    { new: true }
                );

                console.log(`✅ Migrated: ${consumer.email} - Fixed: ${Object.keys(updates).join(', ')}`);
                migratedCount++;
            }
        }

        console.log(`🎉 Bulk migration completed! Updated ${migratedCount} consumers.`);
        return { success: true, migratedCount };

    } catch (error) {
        console.error('❌ Bulk migration failed:', error);
        return { success: false, error: error.message };
    }
}

// Run if called directly
if (require.main === module) {
    mongoose.connect(process.env.MONGODB_URI)
        .then(async () => {
            await runBulkMigration();
            process.exit(0);
        })
        .catch(error => {
            console.error('Database connection failed:', error);
            process.exit(1);
        });
}

module.exports = { runBulkMigration };