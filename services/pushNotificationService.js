/**
 * Push Notification Service - Firebase Cloud Messaging (FCM) Integration
 */

const admin = require('firebase-admin');
const Consumer = require('../models/Consumer');
const NotificationLog = require('../models/NotificationLog');

class PushNotificationService {
    constructor() {
        this.initialized = false;
        this.init();
    }

    init() {
        try {
            console.log('🔥 Firebase initialization debug:', {
                hasFullKey: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
                hasBase64Key: !!process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
                hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
                hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
                hasPrivateKeyBase64: !!process.env.FIREBASE_PRIVATE_KEY_BASE64,
                envKeys: Object.keys(process.env).filter(key => key.includes('FIREBASE')),
                adminAppsLength: admin.apps.length
            });

            // Initialize Firebase Admin SDK
            if (!admin.apps.length) {
                let serviceAccount = null;

                // Try firebase.json file first (easiest for deployment)
                const fs = require('fs');
                const path = require('path');
                const firebaseJsonPath = path.join(__dirname, '..', 'firebase.json');

                if (fs.existsSync(firebaseJsonPath)) {
                    try {
                        serviceAccount = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));
                        console.log('✅ Using firebase.json file for Firebase service account');
                    } catch (error) {
                        console.error('❌ Failed to read firebase.json:', error.message);
                    }
                }
                // Try Base64 encoded full service account (for Render)
                else if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
                    try {
                        const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8');
                        serviceAccount = JSON.parse(decoded);
                        console.log('✅ Using Base64 decoded Firebase service account');
                    } catch (error) {
                        console.error('❌ Failed to decode Base64 service account:', error.message);
                    }
                }
                // Try full JSON (for local development)
                else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
                    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
                    console.log('✅ Using full JSON Firebase service account');
                }
                // Try separate environment variables (for Render deployment)
                else if (process.env.FIREBASE_PROJECT_ID && (process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY_BASE64)) {
                    let privateKey = '';

                    // Handle Base64 encoded private key (recommended for Render)
                    if (process.env.FIREBASE_PRIVATE_KEY_BASE64) {
                        try {
                            privateKey = Buffer.from(process.env.FIREBASE_PRIVATE_KEY_BASE64, 'base64').toString('utf-8');
                            console.log('🔑 Using Base64 decoded Firebase private key');
                        } catch (error) {
                            console.error('❌ Failed to decode Base64 private key:', error.message);
                            throw error;
                        }
                    }
                    // Fallback to regular private key
                    else if (process.env.FIREBASE_PRIVATE_KEY) {
                        // Combine private key parts if they're split
                        privateKey = process.env.FIREBASE_PRIVATE_KEY;
                        if (process.env.FIREBASE_PRIVATE_KEY_1) {
                            privateKey = process.env.FIREBASE_PRIVATE_KEY_1 +
                                       (process.env.FIREBASE_PRIVATE_KEY_2 || '') +
                                       (process.env.FIREBASE_PRIVATE_KEY_3 || '');
                        }
                        privateKey = privateKey.replace(/\\n/g, '\n'); // Convert escaped newlines
                    }

                    serviceAccount = {
                        type: "service_account",
                        project_id: process.env.FIREBASE_PROJECT_ID,
                        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
                        private_key: privateKey,
                        client_email: process.env.FIREBASE_CLIENT_EMAIL,
                        client_id: process.env.FIREBASE_CLIENT_ID,
                        auth_uri: "https://accounts.google.com/o/oauth2/auth",
                        token_uri: "https://oauth2.googleapis.com/token",
                        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
                        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.FIREBASE_CLIENT_EMAIL)}`,
                        universe_domain: "googleapis.com"
                    };
                }

                if (serviceAccount) {
                    admin.initializeApp({
                        credential: admin.credential.cert(serviceAccount)
                    });
                    console.log('✅ Firebase Admin SDK initialized from environment variables');
                } else {
                    console.log('⚠️ Firebase service account key not found. Push notifications will be mocked.');
                    this.initialized = false;
                    return;
                }
            }

            this.messaging = admin.messaging();
            this.initialized = true;
            console.log('✅ Firebase Admin SDK initialized for push notifications');

        } catch (error) {
            console.error('❌ Failed to initialize Firebase Admin SDK:', error.message);
            this.initialized = false;
        }
    }

    /**
     * Send push notification to specific consumer
     */
    async sendToConsumer(consumerEmail, notification) {
        try {
            const consumer = await Consumer.findOne({ email: consumerEmail });
            if (!consumer) {
                throw new Error('Consumer not found');
            }

            const activeTokens = consumer.pushTokens.filter(t => t.active);
            if (activeTokens.length === 0) {
                throw new Error('No active push tokens found for consumer');
            }

            const tokens = activeTokens.map(t => t.token);
            return await this.sendToTokens(tokens, notification);

        } catch (error) {
            console.error('Error sending push notification to consumer:', error);
            throw error;
        }
    }

    /**
     * Send push notification to multiple tokens
     */
    async sendToTokens(tokens, notification) {
        if (!this.initialized) {
            console.log('🔔 MOCK: Would send push notification to', tokens.length, 'tokens:', notification);
            return {
                success: true,
                mock: true,
                message: 'Push notification mocked (Firebase not configured)',
                tokenCount: tokens.length
            };
        }

        console.log('🔥 Firebase SDK status:', {
            initialized: this.initialized,
            messagingExists: !!this.messaging,
            appsLength: admin.apps.length
        });

        try {
            // Filter out Expo tokens - only send to valid FCM tokens
            const validTokens = tokens.filter(token => !token.startsWith('ExponentPushToken'));
            const invalidTokens = tokens.filter(token => token.startsWith('ExponentPushToken'));

            if (invalidTokens.length > 0) {
                console.log(`⚠️ Skipping ${invalidTokens.length} Expo tokens (not compatible with FCM):`);
                invalidTokens.forEach(token => {
                    console.log(`   ${token.substring(0, 30)}...`);
                });
            }

            if (validTokens.length === 0) {
                console.log('⚠️ No valid FCM tokens found after filtering');
                return {
                    success: true,
                    successCount: 0,
                    failureCount: tokens.length,
                    tokenCount: tokens.length,
                    message: 'No valid FCM tokens (all were Expo tokens)'
                };
            }

            // Use sendEach instead of sendMulticast for multiple tokens
            const messages = validTokens.map(token => ({
                notification: {
                    title: notification.title,
                    body: notification.body
                    // Note: icon field not supported in FCM v1 API
                },
                data: {
                    type: notification.type || 'general',
                    timestamp: new Date().toISOString(),
                    icon: notification.icon || 'https://kaptaze.com/images/kaptaze-icon.png',
                    ...notification.data
                },
                token: token
            }));

            const response = await this.messaging.sendEach(messages);

            console.log(`🔔 Push notification sent successfully: ${response.successCount}/${validTokens.length} (${tokens.length} total, ${invalidTokens.length} skipped)`);

            // Handle failed tokens (invalid/expired)
            if (response.failureCount > 0) {
                const failedTokens = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        failedTokens.push({
                            token: validTokens[idx], // Use validTokens index since we filtered
                            error: resp.error?.code || 'unknown',
                            errorMessage: resp.error?.message || 'Unknown error'
                        });
                        console.log(`❌ Failed to send to token ${validTokens[idx].substring(0, 20)}...`);
                        console.log(`   Error Code: ${resp.error?.code || 'unknown'}`);
                        console.log(`   Error Message: ${resp.error?.message || 'No error message'}`);
                    }
                });

                // Clean up invalid tokens from database
                await this.cleanupInvalidTokens(failedTokens);
            }

            return {
                success: true,
                successCount: response.successCount,
                failureCount: response.failureCount + invalidTokens.length, // Include skipped tokens in failure count
                tokenCount: tokens.length,
                validTokenCount: validTokens.length,
                skippedTokenCount: invalidTokens.length
            };

        } catch (error) {
            console.error('Firebase messaging error:', error);
            throw error;
        }
    }

    /**
     * Send notification to all consumers with specific notification preferences
     */
    async sendToAllConsumers(notification, preferences = {}) {
        try {
            // Build query based on preferences
            const query = { status: 'active' };

            // Add notification preferences filter
            if (preferences.orders !== undefined) {
                query['notifications.orders'] = preferences.orders;
            }
            if (preferences.promotions !== undefined) {
                query['notifications.promotions'] = preferences.promotions;
            }
            if (preferences.news !== undefined) {
                query['notifications.news'] = preferences.news;
            }

            console.log('🔍 Query for consumers:', JSON.stringify(query));

            const consumers = await Consumer.find(query);
            console.log(`👥 Found ${consumers.length} consumers matching preferences`);

            const allTokens = [];

            consumers.forEach(consumer => {
                const activeTokens = consumer.pushTokens.filter(t => t.active);
                console.log(`📧 Consumer ${consumer.email}: ${activeTokens.length} active tokens`);
                activeTokens.forEach(tokenObj => {
                    allTokens.push(tokenObj.token);
                    console.log(`   Token: ${tokenObj.token.substring(0, 20)}... (${tokenObj.platform})`);
                });
            });

            if (allTokens.length === 0) {
                return {
                    success: true,
                    message: 'No active push tokens found for broadcast',
                    tokenCount: 0
                };
            }

            // Send in batches of 500 (FCM limit)
            const batchSize = 500;
            let totalSuccess = 0;
            let totalFailure = 0;

            for (let i = 0; i < allTokens.length; i += batchSize) {
                const batch = allTokens.slice(i, i + batchSize);
                const result = await this.sendToTokens(batch, notification);

                if (result.successCount) totalSuccess += result.successCount;
                if (result.failureCount) totalFailure += result.failureCount;
            }

            console.log(`🚀 Broadcast notification sent to ${totalSuccess}/${allTokens.length} devices`);

            return {
                success: true,
                successCount: totalSuccess,
                failureCount: totalFailure,
                tokenCount: allTokens.length,
                consumerCount: consumers.length
            };

        } catch (error) {
            console.error('Error sending broadcast notification:', error);
            throw error;
        }
    }

    /**
     * Send notification to consumers near a location (5km radius)
     */
    async sendToNearbyConsumers(latitude, longitude, notification, radiusKm = 5) {
        try {
            // Find consumers within radius using MongoDB geospatial query
            const consumers = await Consumer.find({
                status: 'active',
                coordinates: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [longitude, latitude]
                        },
                        $maxDistance: radiusKm * 1000 // Convert km to meters
                    }
                }
            });

            if (consumers.length === 0) {
                return {
                    success: true,
                    message: `No consumers found within ${radiusKm}km radius`,
                    tokenCount: 0
                };
            }

            const tokens = [];
            consumers.forEach(consumer => {
                const activeTokens = consumer.pushTokens.filter(t => t.active);
                activeTokens.forEach(tokenObj => {
                    tokens.push(tokenObj.token);
                });
            });

            const result = await this.sendToTokens(tokens, notification);
            console.log(`📍 Location-based notification sent to ${consumers.length} consumers within ${radiusKm}km`);

            return {
                ...result,
                consumerCount: consumers.length,
                radiusKm
            };

        } catch (error) {
            console.error('Error sending location-based notification:', error);
            throw error;
        }
    }

    /**
     * Send notification to consumers who favorited a specific restaurant
     */
    async sendToRestaurantFavorites(restaurantId, notification) {
        try {
            console.log(`🔍 Searching for consumers who favorited restaurant: ${restaurantId}`);

            const consumers = await Consumer.find({
                status: 'active',
                favoriteRestaurants: restaurantId
            });

            console.log(`📊 Found ${consumers.length} consumers who favorited this restaurant:`);
            consumers.forEach((consumer, index) => {
                console.log(`  ${index + 1}. ${consumer.name} (${consumer.email}) - status: ${consumer.status}`);
                console.log(`     favorites: [${consumer.favoriteRestaurants.join(', ')}]`);
            });

            if (consumers.length === 0) {
                return {
                    success: true,
                    message: 'No consumers have favorited this restaurant',
                    tokenCount: 0
                };
            }

            const tokens = [];
            consumers.forEach(consumer => {
                const activeTokens = consumer.pushTokens.filter(t => t.active);
                activeTokens.forEach(tokenObj => {
                    tokens.push(tokenObj.token);
                });
            });

            // Save in-app notification to each consumer's database
            await this.saveInAppNotifications(consumers, notification);

            const result = await this.sendToTokens(tokens, notification);
            console.log(`⭐ Restaurant favorite notification sent to ${consumers.length} consumers`);

            return {
                ...result,
                consumerCount: consumers.length,
                restaurantId
            };

        } catch (error) {
            console.error('Error sending restaurant favorite notification:', error);
            throw error;
        }
    }

    /**
     * Clean up invalid/expired push tokens
     */
    async cleanupInvalidTokens(failedTokens) {
        try {
            for (const failed of failedTokens) {
                if (failed.error === 'messaging/invalid-registration-token' ||
                    failed.error === 'messaging/registration-token-not-registered') {

                    // Mark token as inactive
                    await Consumer.updateMany(
                        { 'pushTokens.token': failed.token },
                        { $set: { 'pushTokens.$.active': false } }
                    );

                    console.log(`🗑️ Marked invalid token as inactive: ${failed.token.substring(0, 20)}...`);
                }
            }
        } catch (error) {
            console.error('Error cleaning up invalid tokens:', error);
        }
    }

    /**
     * Test push notification functionality
     */
    async testNotification(consumerEmail) {
        const testNotification = {
            title: '🎉 KapTaze Test',
            body: 'Push bildirimleri başarıyla çalışıyor!',
            type: 'test',
            data: {
                action: 'test',
                timestamp: new Date().toISOString()
            }
        };

        return await this.sendToConsumer(consumerEmail, testNotification);
    }

    /**
     * Save in-app notification to consumers' database records
     */
    async saveInAppNotifications(consumers, notification) {
        try {
            const notificationId = new Date().getTime().toString() + Math.random().toString(36).substr(2, 9);

            const inAppNotification = {
                id: notificationId,
                title: notification.title,
                message: notification.body,
                type: notification.type || 'general',
                data: notification.data || {},
                read: false,
                createdAt: new Date()
            };

            // Add notification to each consumer
            const bulkOps = consumers.map(consumer => ({
                updateOne: {
                    filter: { _id: consumer._id },
                    update: {
                        $push: {
                            inAppNotifications: {
                                $each: [inAppNotification],
                                $slice: -100 // Keep only last 100 notifications per user
                            }
                        }
                    }
                }
            }));

            await Consumer.bulkWrite(bulkOps);
            console.log(`💾 In-app notification saved for ${consumers.length} consumers`);

        } catch (error) {
            console.error('Error saving in-app notifications:', error);
            // Don't throw error - notification sending should continue even if database save fails
        }
    }

    /**
     * Log notification sending attempt
     */
    async logNotification(logData) {
        try {
            const notificationLog = new NotificationLog({
                title: logData.title,
                message: logData.message,
                type: logData.type || 'general',
                priority: logData.priority || 'normal',
                targetType: logData.targetType,
                targetDetails: logData.targetDetails || {},
                stats: {
                    totalTokens: logData.totalTokens || 0,
                    validTokens: logData.validTokens || 0,
                    skippedTokens: logData.skippedTokens || 0,
                    successCount: logData.successCount || 0,
                    failureCount: logData.failureCount || 0,
                    consumerCount: logData.consumerCount || 0
                },
                status: logData.status || 'completed',
                sentAt: logData.sentAt || new Date(),
                completedAt: logData.completedAt || new Date(),
                sentBy: logData.sentBy || 'Admin Panel',
                ipAddress: logData.ipAddress,
                data: logData.data || {},
                error: logData.error
            });

            await notificationLog.save();
            console.log(`📊 Notification logged: ${logData.title} - ${logData.successCount}/${logData.totalTokens} delivered`);

            return notificationLog;
        } catch (error) {
            console.error('Error logging notification:', error);
            // Don't throw error - logging failure shouldn't stop notification sending
        }
    }
}

module.exports = new PushNotificationService();