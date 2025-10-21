/**
 * Push Notification Service
 * Handles sending push notifications to mobile app users
 */

const Consumer = require('../models/Consumer');
const { Expo } = require('expo-server-sdk');

// Create a new Expo SDK client
const expo = new Expo();

/**
 * Send push notification to a consumer
 * @param {string} consumerId - MongoDB ObjectId of the consumer
 * @param {Object} notification - Notification object { title, body, data }
 * @returns {Promise<Object>} - Result of the push notification
 */
const sendPushNotification = async (consumerId, notification) => {
    try {
        console.log(`📤 Sending push notification to consumer: ${consumerId}`);

        // Get consumer from database
        const consumer = await Consumer.findById(consumerId);

        if (!consumer) {
            console.log(`❌ Consumer not found: ${consumerId}`);
            return { success: false, error: 'Consumer not found' };
        }

        if (!consumer.pushToken || !consumer.pushToken.token) {
            console.log(`❌ No push token found for consumer: ${consumer.email}`);
            return { success: false, error: 'No push token found' };
        }

        const pushToken = consumer.pushToken.token;

        // Check that the push token is valid
        if (!Expo.isExpoPushToken(pushToken)) {
            console.log(`❌ Invalid push token for consumer ${consumer.email}: ${pushToken}`);
            return { success: false, error: 'Invalid push token' };
        }

        // Construct the push notification message
        const message = {
            to: pushToken,
            sound: 'default',
            title: notification.title || 'KapTaze Bildirim',
            body: notification.body || '',
            data: notification.data || {},
            badge: 1,
            priority: 'high',
        };

        console.log(`📱 Sending notification to ${consumer.email}:`, message);

        // Send the push notification
        const chunks = expo.chunkPushNotifications([message]);
        const tickets = [];

        for (let chunk of chunks) {
            try {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
            } catch (error) {
                console.error('❌ Error sending push notification chunk:', error);
            }
        }

        console.log(`✅ Push notification sent successfully to ${consumer.email}`);
        return { success: true, tickets };

    } catch (error) {
        console.error('❌ Error sending push notification:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send push notification to multiple consumers
 * @param {Array<string>} consumerIds - Array of MongoDB ObjectIds
 * @param {Object} notification - Notification object { title, body, data }
 * @returns {Promise<Object>} - Results of the push notifications
 */
const sendBulkPushNotifications = async (consumerIds, notification) => {
    try {
        console.log(`📤 Sending bulk push notifications to ${consumerIds.length} consumers`);

        // Get all consumers
        const consumers = await Consumer.find({ _id: { $in: consumerIds } });

        if (!consumers || consumers.length === 0) {
            console.log('❌ No consumers found');
            return { success: false, error: 'No consumers found' };
        }

        // Create messages for all consumers with valid push tokens
        const messages = [];

        for (const consumer of consumers) {
            if (consumer.pushToken && consumer.pushToken.token) {
                const pushToken = consumer.pushToken.token;

                // Check that the push token is valid
                if (Expo.isExpoPushToken(pushToken)) {
                    messages.push({
                        to: pushToken,
                        sound: 'default',
                        title: notification.title || 'KapTaze Bildirim',
                        body: notification.body || '',
                        data: notification.data || {},
                        badge: 1,
                        priority: 'high',
                    });
                } else {
                    console.log(`❌ Invalid push token for consumer ${consumer.email}`);
                }
            }
        }

        if (messages.length === 0) {
            console.log('❌ No valid push tokens found');
            return { success: false, error: 'No valid push tokens found' };
        }

        console.log(`📱 Sending ${messages.length} push notifications`);

        // Send the push notifications in chunks
        const chunks = expo.chunkPushNotifications(messages);
        const tickets = [];

        for (let chunk of chunks) {
            try {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
            } catch (error) {
                console.error('❌ Error sending push notification chunk:', error);
            }
        }

        console.log(`✅ Sent ${tickets.length} push notifications successfully`);
        return { success: true, sent: messages.length, tickets };

    } catch (error) {
        console.error('❌ Error sending bulk push notifications:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send push notification to users who favorited a restaurant
 * @param {string} restaurantId - MongoDB ObjectId of the restaurant
 * @param {Object} notification - Notification object { title, body, data, type }
 * @returns {Promise<Object>} - Results of the push notifications
 */
const sendToRestaurantFavorites = async (restaurantId, notification) => {
    try {
        console.log(`📤 Sending favorite restaurant notification for restaurant: ${restaurantId}`);

        // Find all consumers who have this restaurant in their favoriteRestaurants array
        const consumers = await Consumer.find({
            favoriteRestaurants: restaurantId
        });

        if (!consumers || consumers.length === 0) {
            console.log(`❌ No users have favorited restaurant: ${restaurantId}`);
            return { success: true, sent: 0, message: 'No users favorited this restaurant' };
        }

        console.log(`👥 Found ${consumers.length} users who favorited this restaurant`);

        // Create messages for all consumers with valid push tokens
        const messages = [];

        for (const consumer of consumers) {
            if (consumer.pushToken && consumer.pushToken.token) {
                const pushToken = consumer.pushToken.token;

                // Check that the push token is valid Expo token
                if (Expo.isExpoPushToken(pushToken)) {
                    messages.push({
                        to: pushToken,
                        sound: 'default',
                        title: notification.title || 'Favori Restoranından Yeni Paket!',
                        body: notification.body || '',
                        data: notification.data || {},
                        badge: 1,
                        priority: 'high',
                    });
                    console.log(`✅ Added ${consumer.email} to notification list`);
                } else {
                    console.log(`⚠️ Skipping non-Expo token for ${consumer.email}: ${pushToken}`);
                }
            }
        }

        if (messages.length === 0) {
            console.log('❌ No valid Expo push tokens found for favorite users');
            return { success: true, sent: 0, message: 'No valid Expo tokens found' };
        }

        console.log(`📱 Sending ${messages.length} push notifications to favorite users`);

        // Send the push notifications in chunks
        const chunks = expo.chunkPushNotifications(messages);
        const tickets = [];

        for (let chunk of chunks) {
            try {
                const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
                tickets.push(...ticketChunk);
                console.log(`✅ Sent chunk of ${chunk.length} notifications`);
            } catch (error) {
                console.error('❌ Error sending push notification chunk:', error);
            }
        }

        console.log(`✅ Sent ${tickets.length}/${messages.length} push notifications to favorite users`);
        return { success: true, sent: messages.length, tickets };

    } catch (error) {
        console.error('❌ Error sending favorite restaurant notifications:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendPushNotification,
    sendBulkPushNotifications,
    sendToRestaurantFavorites,
};
