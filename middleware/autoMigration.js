/**
 * Auto-Migration Middleware
 * Ensures all users have latest schema automatically
 */

const Consumer = require('../models/Consumer');

async function autoMigrationMiddleware(req, res, next) {
    try {
        // Only for authenticated users
        if (!req.user || !req.user.id) {
            return next();
        }

        // Check if user needs schema updates
        const user = await Consumer.findById(req.user.id);
        if (!user) {
            return next();
        }

        let needsUpdate = false;
        let updates = {};

        // Ensure favoriteRestaurants array exists
        if (!user.favoriteRestaurants || !Array.isArray(user.favoriteRestaurants)) {
            updates.favoriteRestaurants = [];
            needsUpdate = true;
        }

        // Ensure pushTokens array exists
        if (!user.pushTokens || !Array.isArray(user.pushTokens)) {
            updates.pushTokens = [];
            needsUpdate = true;
        }

        // Ensure inAppNotifications array exists
        if (!user.inAppNotifications || !Array.isArray(user.inAppNotifications)) {
            updates.inAppNotifications = [];
            needsUpdate = true;
        }

        // Ensure notificationPreferences exist
        if (!user.notificationPreferences) {
            updates.notificationPreferences = {
                push: true,
                email: true,
                favorites: true,
                proximity: true,
                promotions: true
            };
            needsUpdate = true;
        }

        // Apply updates if needed
        if (needsUpdate) {
            await Consumer.findByIdAndUpdate(
                req.user.id,
                { $set: updates },
                { new: true }
            );
            console.log(`🔄 Auto-migrated user schema: ${user.email} - Updates: ${Object.keys(updates).join(', ')}`);
        }

        next();
    } catch (error) {
        console.error('Auto-migration error:', error);
        // Don't fail the request, just log and continue
        next();
    }
}

module.exports = autoMigrationMiddleware;