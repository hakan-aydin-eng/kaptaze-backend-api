/**
 * Validate and fix entire favorite notification system
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Consumer = require('../models/Consumer');
const Restaurant = require('../models/Restaurant');

async function validateFavoriteSystem() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔍 Validating entire favorite notification system...\n');

        // 1. Find all restaurants with favorites
        const restaurantsWithFavorites = await Consumer.aggregate([
            { $unwind: '$favoriteRestaurants' },
            {
                $group: {
                    _id: '$favoriteRestaurants',
                    userCount: { $sum: 1 },
                    users: {
                        $push: {
                            name: '$name',
                            email: '$email',
                            status: '$status',
                            activeTokens: {
                                $size: {
                                    $filter: {
                                        input: '$pushTokens',
                                        as: 'token',
                                        cond: { $eq: ['$$token.active', true] }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            { $sort: { userCount: -1 } }
        ]);

        console.log('📊 RESTAURANTS WITH FAVORITES:');
        console.log('=====================================');

        for (const item of restaurantsWithFavorites) {
            // Get restaurant name
            const restaurant = await Restaurant.findById(item._id, 'name');
            const restaurantName = restaurant?.name || 'Unknown Restaurant';

            console.log(`🍽️  Restaurant: ${restaurantName} (${item._id})`);
            console.log(`   Total Users: ${item.userCount}`);
            console.log(`   Users:`);

            item.users.forEach((user, i) => {
                console.log(`     ${i+1}. ${user.name} (${user.email}) - Status: ${user.status} - Tokens: ${user.activeTokens}`);
            });
            console.log('---');
        }

        // 2. Check for notification system issues
        console.log('\n🔧 SYSTEM VALIDATION:');
        console.log('=====================================');

        const allConsumers = await Consumer.find({}, 'name email status pushTokens favoriteRestaurants');
        let issues = [];

        allConsumers.forEach(consumer => {
            // Check for missing notification preferences
            if (!consumer.notificationPreferences) {
                issues.push(`${consumer.email}: Missing notification preferences`);
            }

            // Check for inactive tokens
            const activeTokens = consumer.pushTokens?.filter(t => t.active)?.length || 0;
            if (activeTokens === 0 && consumer.status === 'active') {
                issues.push(`${consumer.email}: No active push tokens`);
            }

            // Check for active Expo tokens
            const activeExpoTokens = consumer.pushTokens?.filter(t => t.active && t.token?.startsWith('ExponentPushToken'))?.length || 0;
            if (activeExpoTokens > 0) {
                issues.push(`${consumer.email}: Has ${activeExpoTokens} active Expo tokens (should be FCM only)`);
            }
        });

        if (issues.length > 0) {
            console.log('❌ ISSUES FOUND:');
            issues.forEach(issue => console.log(`   - ${issue}`));
        } else {
            console.log('✅ No system issues found');
        }

        // 3. Test notification query for most popular restaurant
        if (restaurantsWithFavorites.length > 0) {
            const topRestaurant = restaurantsWithFavorites[0];
            console.log(`\n🧪 TESTING NOTIFICATION QUERY FOR TOP RESTAURANT:`);
            console.log(`Restaurant: ${topRestaurant._id} (${topRestaurant.userCount} users)`);

            const testQuery = await Consumer.find({
                status: 'active',
                favoriteRestaurants: topRestaurant._id
            }, 'name email pushTokens');

            console.log(`Query Result: Found ${testQuery.length} active users`);
            testQuery.forEach((user, i) => {
                const activeTokens = user.pushTokens?.filter(t => t.active)?.length || 0;
                console.log(`   ${i+1}. ${user.name} - Active FCM tokens: ${activeTokens}`);
            });
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

validateFavoriteSystem();