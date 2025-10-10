# Backend Fixes - Mobil Uygulama İçin

## 🎯 Sorunlar ve Çözümler

### 1. Socket.IO Eksik - Real-time Updates Çalışmıyor ❌
### 2. Push Token Endpoint Yok ❌
### 3. Consumer Model'de pushToken Field Yok ❌
### 4. Kategori API Boş Dönüyor ❓

---

## 📝 Uygulanması Gereken Değişiklikler

### FIX 1: server.js - Socket.IO Kurulumu

**Dosya:** `server.js`

**İLK 30 SATIRI ŞU ŞEKİLDE DEĞİŞTİR:**

```javascript
/**
 * KapTaze Backend API Server
 * Professional Restaurant Management System
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');  // EKLE
const { Server } = require('socket.io');  // EKLE

// Import routes
const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const restaurantRoutes = require('./routes/restaurant');
const orderRoutes = require('./routes/orders');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const logger = require('./middleware/logger');

const app = express();
const server = http.createServer(app);  // EKLE

// Socket.IO Configuration - TAMAMEN YENİ EKLE
const io = new Server(server, {
    cors: {
        origin: '*', // Mobile app için tüm originlere izin ver
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

// Socket.IO connection handling - TAMAMEN YENİ EKLE
io.on('connection', (socket) => {
    console.log('🔌 New Socket.IO client connected:', socket.id);

    socket.on('join-restaurant', (restaurantId) => {
        socket.join(`restaurant-${restaurantId}`);
        console.log(`🏪 Socket ${socket.id} joined restaurant-${restaurantId}`);
    });

    socket.on('join-consumer', (consumerId) => {
        socket.join(`consumer-${consumerId}`);
        console.log(`👤 Socket ${socket.id} joined consumer-${consumerId}`);
    });

    socket.on('disconnect', () => {
        console.log('❌ Socket.IO client disconnected:', socket.id);
    });
});

// Make io accessible to routes - EKLE
app.set('io', io);
```

**SONDAKİ startServer FONKSIYONUNU ŞU ŞEKİLDE DEĞİŞTİR:**

`app.listen(PORT, ...)` yerine `server.listen(PORT, ...)` yap (157. satır):

```javascript
const startServer = async () => {
    try {
        await connectDB();
        const seedData = require('./utils/seedData');
        await seedData();

        // BURASI ÖNEMLİ: app.listen değil server.listen
        server.listen(PORT, () => {  // DEĞİŞTİ: app → server
            console.log('\n🚀 KapTaze API Server Started!');
            console.log(`📍 Server running on port ${PORT}`);
            console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
            console.log(`🔗 Health check: http://localhost:${PORT}/health`);
            console.log(`📚 API docs: http://localhost:${PORT}/`);
            console.log(`🔌 Socket.IO enabled`);  // EKLE
            console.log('════════════════════════════════════════\n');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
};
```

---

### FIX 2: models/Consumer.js - pushToken Field Ekle

**Dosya:** `models/Consumer.js`

**`deviceInfo` field'ından HEMEN SONRA ekle (99. satırdan sonra):**

```javascript
// Device info (optional)
deviceInfo: {
    platform: String,
    version: String,
    deviceId: String
},

// Push notification token - EKLE
pushToken: {
    token: String,
    platform: {
        type: String,
        enum: ['ios', 'android', 'expo']
    },
    deviceInfo: {
        brand: String,
        model: String,
        osVersion: String
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
},

// Notification preferences
notifications: {
    orders: { type: Boolean, default: true },
    promotions: { type: Boolean, default: true },
    news: { type: Boolean, default: false }
},
```

---

### FIX 3: routes/auth.js - Push Token Endpoint Ekle

**Dosya:** `routes/auth.js`

**DOSYANIN EN SONUNA (module.exports'tan ÖNCE) ekle:**

```javascript
// @route   POST /auth/push-token
// @desc    Save or update consumer push notification token
// @access  Private (requires valid token)
router.post('/push-token', authenticate, async (req, res, next) => {
    try {
        const { userId, consumerEmail, token, platform, deviceInfo } = req.body;

        console.log('📱 Push token request received:', {
            userId,
            consumerEmail,
            token: token ? token.substring(0, 20) + '...' : 'MISSING',
            platform,
            tokenType: typeof token
        });

        // Validation
        if (!token || typeof token !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Push token is required and must be a string',
                debug: {
                    tokenExists: !!token,
                    tokenType: typeof token
                }
            });
        }

        if (!userId && !consumerEmail) {
            return res.status(400).json({
                success: false,
                error: 'User ID or consumer email is required'
            });
        }

        // Find consumer
        let consumer;
        if (userId) {
            consumer = await Consumer.findById(userId);
        } else if (consumerEmail) {
            consumer = await Consumer.findOne({ email: consumerEmail.toLowerCase() });
        }

        if (!consumer) {
            return res.status(404).json({
                success: false,
                error: 'Consumer not found'
            });
        }

        // Update push token
        consumer.pushToken = {
            token: token,
            platform: platform || 'expo',
            deviceInfo: deviceInfo || {},
            lastUpdated: new Date()
        };

        await consumer.save();

        console.log(`✅ Push token saved for consumer: ${consumer.email}`);

        res.json({
            success: true,
            message: 'Push token saved successfully',
            data: {
                consumerId: consumer._id,
                platform: consumer.pushToken.platform
            }
        });

    } catch (error) {
        console.error('❌ Push token save error:', error);
        next(error);
    }
});

module.exports = router;
```

---

### FIX 4: Mobile App - Eski Siparişleri Temizle

**Dosya:** `kaptazeuygulama/src/context/UserDataContext.js`

**`loadUserSpecificData` fonksiyonunun sonuna ekle (500. satır civarı):**

```javascript
const loadUserSpecificData = async (userId) => {
    if (!userId) return;

    try {
        const userKeys = getUserSpecificKeys(userId);
        console.log('🔍 Loading data for user:', userId);
        console.log('📍 Storage keys:', userKeys);

        const [savedFavorites, savedOrders] = await Promise.all([
            AsyncStorage.getItem(userKeys.FAVORITES),
            AsyncStorage.getItem(userKeys.ORDERS),
        ]);

        console.log('❤️ Saved favorites found:', !!savedFavorites);
        console.log('📦 Saved orders found:', !!savedOrders);

        if (savedFavorites) {
            const favoritesData = JSON.parse(savedFavorites);
            console.log('❤️ Parsed favorites count:', favoritesData.length);
            setFavorites(favoritesData);
        }

        if (savedOrders) {
            const ordersData = JSON.parse(savedOrders);
            console.log('📦 Parsed orders count:', ordersData.length);

            // 🔧 FIX: Eski siparişleri temizle (backendOrderId olmayanlar)
            const validOrders = ordersData.filter(order => {
                if (!order.backendOrderId) {
                    console.log(`🗑️ Removing old order without backendOrderId: ${order.id || order.pickupCode}`);
                    return false;
                }
                return true;
            });

            console.log(`✅ Valid orders after cleanup: ${validOrders.length}/${ordersData.length}`);

            setOrders(validOrders);

            // AsyncStorage'ı da güncelle
            if (validOrders.length !== ordersData.length) {
                await AsyncStorage.setItem(userKeys.ORDERS, JSON.stringify(validOrders));
                console.log('💾 Updated orders in storage (removed old orders)');
            }
        }
    } catch (error) {
        console.error('Error loading user-specific data:', error);
    }
};
```

---

## 🚀 Uygulama Adımları

### 1. Backend Değişikliklerini Uygula

```bash
cd kaptaze-backend-api

# FIX 1: server.js'i düzenle (yukarıdaki değişiklikleri uygula)
# FIX 2: models/Consumer.js'i düzenle
# FIX 3: routes/auth.js'i düzenle

# Test et
node server.js
```

### 2. Mobile App Değişikliklerini Uygula

```bash
cd kaptazeuygulama

# FIX 4: src/context/UserDataContext.js'i düzenle

# Test et
npx expo start
```

### 3. Backend'i Yeniden Başlat

Render.com dashboard'a git ve manual deploy yap veya:

```bash
cd kaptaze-backend-api
git add .
git commit -m "FIX: Add Socket.IO, push token endpoint, and order cleanup"
git push origin master
```

---

## ✅ Test Checklist

- [ ] Backend `/health` endpoint'i `socketIO: 'enabled'` döndürüyor mu?
- [ ] Mobil app Socket.IO bağlantı hatası veriyor mu? (olmamalı)
- [ ] Push token backend'e kaydediliyor mu?
- [ ] Eski siparişler temizlendi mi? (backendOrderId olmayanlar)
- [ ] Kategori API çalışıyor mu?

---

## 🐛 Sorun Giderme

### Socket.IO hala bağlanmıyor
- Backend loglarını kontrol et
- `server.listen` kullandığından emin ol (`app.listen` değil)
- CORS ayarlarını kontrol et

### Push token hala hata veriyor
- `/auth/push-token` endpoint'i `authenticate` middleware ile korunmuş
- Token doğru gönderiliyor mu? (string olmalı)
- Consumer modeli güncellenmiş mi?

### Eski siparişler hala görünüyor
- Uygulamayı tamamen kapat ve yeniden aç
- AsyncStorage temizlendi mi kontrol et
