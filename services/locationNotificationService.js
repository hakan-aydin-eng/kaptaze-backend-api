/**
 * Location-based Notification Service
 * Handles proximity-based push notifications for new restaurants
 */

const Consumer = require('../models/Consumer');
const Restaurant = require('../models/Restaurant');
const pushNotificationService = require('./pushNotificationService');

class LocationNotificationService {
    constructor() {
        this.PROXIMITY_RADIUS_KM = 5; // 5km radius for proximity notifications
    }

    /**
     * Send notification when a new restaurant is created near consumers
     */
    async notifyNearbyConsumersOfNewRestaurant(restaurant) {
        try {
            if (!restaurant.location || !restaurant.location.coordinates) {
                console.log('⚠️ Restaurant has no location coordinates, skipping proximity notifications');
                return;
            }

            const [longitude, latitude] = restaurant.location.coordinates;

            console.log(`📍 Checking for consumers near new restaurant: ${restaurant.name} (${latitude}, ${longitude})`);

            // Find consumers within 5km radius
            const nearbyConsumers = await Consumer.find({
                status: 'active',
                coordinates: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [longitude, latitude]
                        },
                        $maxDistance: this.PROXIMITY_RADIUS_KM * 1000 // Convert to meters
                    }
                },
                'notifications.news': true // Only send to consumers who accept news notifications
            });

            if (nearbyConsumers.length === 0) {
                console.log(`📍 No consumers found within ${this.PROXIMITY_RADIUS_KM}km of new restaurant`);
                return;
            }

            // Prepare notification
            const notification = {
                title: '🏪 Yakınınızda yeni restoran!',
                body: `${restaurant.name} artık KapTaze'de! ${restaurant.category} lezzetlerini keşfedin.`,
                type: 'new_restaurant',
                priority: 'normal',
                data: {
                    restaurantId: restaurant._id.toString(),
                    restaurantName: restaurant.name,
                    restaurantCategory: restaurant.category,
                    distance: this.PROXIMITY_RADIUS_KM,
                    action: 'view_restaurant'
                }
            };

            // Send notification to nearby consumers
            const tokens = [];
            nearbyConsumers.forEach(consumer => {
                const activeTokens = consumer.pushTokens.filter(t => t.active);
                activeTokens.forEach(tokenObj => {
                    tokens.push(tokenObj.token);
                });
            });

            const result = await pushNotificationService.sendToTokens(tokens, notification);

            console.log(`📱 New restaurant notification sent to ${nearbyConsumers.length} consumers (${tokens.length} devices)`);
            console.log(`✅ Success: ${result.successCount}, Failed: ${result.failureCount}`);

            return {
                success: true,
                consumerCount: nearbyConsumers.length,
                tokenCount: tokens.length,
                ...result
            };

        } catch (error) {
            console.error('Error sending new restaurant proximity notifications:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send notification when consumer is near restaurants with active packages
     */
    async notifyConsumerOfNearbyDeals(consumerLocation, consumerEmail) {
        try {
            const { latitude, longitude } = consumerLocation;

            console.log(`📍 Checking for restaurants with deals near consumer location: (${latitude}, ${longitude})`);

            // Find restaurants within 5km radius that have active packages
            const nearbyRestaurants = await Restaurant.find({
                status: 'active',
                location: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [longitude, latitude]
                        },
                        $maxDistance: this.PROXIMITY_RADIUS_KM * 1000
                    }
                },
                'packages.0': { $exists: true }, // Has at least one package
                'packages.status': 'active' // Has active packages
            }).limit(5); // Limit to top 5 nearest restaurants

            if (nearbyRestaurants.length === 0) {
                console.log(`📍 No restaurants with active packages found within ${this.PROXIMITY_RADIUS_KM}km`);
                return;
            }

            // Count total active packages
            let totalActivePackages = 0;
            nearbyRestaurants.forEach(restaurant => {
                const activePackages = restaurant.packages.filter(pkg => pkg.status === 'active');
                totalActivePackages += activePackages.length;
            });

            // Prepare notification
            const notification = {
                title: '🔥 Yakınınızda harika fırsatlar!',
                body: `${nearbyRestaurants.length} restoranda ${totalActivePackages} paket sizi bekliyor!`,
                type: 'nearby_deals',
                priority: 'normal',
                data: {
                    restaurantCount: nearbyRestaurants.length.toString(),
                    packageCount: totalActivePackages.toString(),
                    distance: this.PROXIMITY_RADIUS_KM.toString(),
                    action: 'view_nearby_deals',
                    latitude: latitude.toString(),
                    longitude: longitude.toString()
                }
            };

            // Send to specific consumer
            const result = await pushNotificationService.sendToConsumer(consumerEmail, notification);

            console.log(`📱 Nearby deals notification sent to consumer: ${consumerEmail}`);

            return {
                success: true,
                restaurantCount: nearbyRestaurants.length,
                packageCount: totalActivePackages,
                ...result
            };

        } catch (error) {
            console.error('Error sending nearby deals notification:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send weekly digest of nearby restaurants to all consumers
     */
    async sendWeeklyNearbyDigest() {
        try {
            console.log('📅 Sending weekly nearby restaurants digest...');

            // Get all active consumers with location data
            const consumersWithLocation = await Consumer.find({
                status: 'active',
                coordinates: { $exists: true },
                'notifications.promotions': true
            });

            let totalSent = 0;

            for (const consumer of consumersWithLocation) {
                try {
                    const { latitude, longitude } = consumer.coordinates;

                    // Find nearby restaurants
                    const nearbyRestaurants = await Restaurant.find({
                        status: 'active',
                        location: {
                            $near: {
                                $geometry: {
                                    type: 'Point',
                                    coordinates: [longitude, latitude]
                                },
                                $maxDistance: this.PROXIMITY_RADIUS_KM * 1000
                            }
                        }
                    }).limit(10);

                    if (nearbyRestaurants.length >= 3) { // Only send if there are at least 3 nearby restaurants
                        const notification = {
                            title: '📍 Haftalık yakın restoranlar özeti',
                            body: `Yakınınızda ${nearbyRestaurants.length} restoran bulundu. Yeni lezzetleri keşfet!`,
                            type: 'weekly_digest',
                            priority: 'low',
                            data: {
                                restaurantCount: nearbyRestaurants.length.toString(),
                                distance: this.PROXIMITY_RADIUS_KM.toString(),
                                action: 'view_nearby_restaurants'
                            }
                        };

                        await pushNotificationService.sendToConsumer(consumer.email, notification);
                        totalSent++;
                    }

                } catch (consumerError) {
                    console.error(`Error sending digest to consumer ${consumer.email}:`, consumerError);
                    continue;
                }
            }

            console.log(`✅ Weekly digest sent to ${totalSent} consumers`);

            return {
                success: true,
                totalSent,
                totalConsumers: consumersWithLocation.length
            };

        } catch (error) {
            console.error('Error sending weekly digest:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new LocationNotificationService();