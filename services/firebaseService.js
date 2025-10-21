const admin = require('firebase-admin');

class FirebaseService {
  constructor() {
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) {
      return;
    }

    try {
      const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

      if (!serviceAccountKey) {
        console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT_KEY not found in environment variables');
        console.warn('⚠️ Push notifications will not work until you add this to Render dashboard');
        return;
      }

      const serviceAccount = JSON.parse(serviceAccountKey);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });

      this.initialized = true;
      console.log('✅ Firebase Admin SDK initialized successfully');
    } catch (error) {
      console.error('❌ Firebase Admin SDK initialization failed:', error.message);
    }
  }

  async sendPushNotification(tokens, notification, data = {}) {
    if (!this.initialized) {
      throw new Error('Firebase Admin SDK not initialized');
    }

    if (!tokens || tokens.length === 0) {
      throw new Error('No FCM tokens provided');
    }

    try {
      const stringData = {};
      if (data && typeof data === 'object') {
        Object.keys(data).forEach(key => {
          stringData[key] = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
        });
      }

      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
          ...(notification.imageUrl && { imageUrl: notification.imageUrl })
        },
        tokens: Array.isArray(tokens) ? tokens : [tokens]
      };

      if (Object.keys(stringData).length > 0) {
        message.data = stringData;
      }

      const response = await admin.messaging().sendEachForMulticast(message);

      console.log(`✅ FCM sent: ${response.successCount} success, ${response.failureCount} failed`);

      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.error(`❌ Token ${idx + 1} failed:`, resp.error?.code, resp.error?.message);
          }
        });
      }

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        responses: response.responses
      };
    } catch (error) {
      console.error('❌ FCM send error:', error);
      throw error;
    }
  }

  async sendToTopic(topic, notification, data = {}) {
    if (!this.initialized) {
      throw new Error('Firebase Admin SDK not initialized');
    }

    try {
      const stringData = {};
      if (data && typeof data === 'object') {
        Object.keys(data).forEach(key => {
          stringData[key] = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
        });
      }

      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
          ...(notification.imageUrl && { imageUrl: notification.imageUrl })
        },
        topic: topic
      };

      if (Object.keys(stringData).length > 0) {
        message.data = stringData;
      }

      const response = await admin.messaging().send(message);
      console.log(`✅ FCM sent to topic "${topic}":`, response);

      return { messageId: response };
    } catch (error) {
      console.error('❌ FCM topic send error:', error);
      throw error;
    }
  }
}

module.exports = new FirebaseService();
