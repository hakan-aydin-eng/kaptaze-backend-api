/**
 * Test rating fotoğrafları ekleme script'i
 */

const mongoose = require('mongoose');
const Rating = require('../models/Rating');
const Consumer = require('../models/Consumer');
const Restaurant = require('../models/Restaurant');

// Environment variable'ları buradan set et
const MONGODB_URI = 'mongodb+srv://kaptaze-admin:kptzclg@kaptaze-cluster.ra9padd.mongodb.net/kaptazedb?retryWrites=true&w=majority&appName=kaptaze-cluster';

const testRatings = [
    {
        rating: 5,
        photoUrl: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?ixlib=rb-4.0.3&w=800&q=80', // Güzel burger
        userName: 'Ahmet',
        packageName: 'Sürpriz Burger Paketi'
    },
    {
        rating: 4,
        photoUrl: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?ixlib=rb-4.0.3&w=800&q=80', // Pizza
        userName: 'Ayşe',
        packageName: 'Sürpriz Pizza Paketi'
    },
    {
        rating: 5,
        photoUrl: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?ixlib=rb-4.0.3&w=800&q=80', // Tatlı
        userName: 'Mehmet',
        packageName: 'Sürpriz Tatlı Paketi'
    }
];

async function addTestRatings() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('📱 MongoDB connected');

        // İlk restaurant ve consumer'ları al
        const firstRestaurant = await Restaurant.findOne();
        const firstConsumer = await Consumer.findOne();

        if (!firstRestaurant || !firstConsumer) {
            console.log('❌ Restaurant veya Consumer bulunamadı');
            return;
        }

        console.log(`🏪 Using restaurant: ${firstRestaurant.name}`);
        console.log(`👤 Using consumer: ${firstConsumer.name}`);

        // Test ratings oluştur
        for (const testData of testRatings) {
            const rating = new Rating({
                orderId: new mongoose.Types.ObjectId(), // Dummy order ID
                consumerId: firstConsumer._id,
                restaurantId: firstRestaurant._id,
                rating: testData.rating,
                photos: [{
                    url: testData.photoUrl,
                    publicId: `test-${Date.now()}`,
                    originalName: `${testData.packageName}.jpg`,
                    size: 150000,
                    mimeType: 'image/jpeg'
                }],
                packageInfo: {
                    packageName: testData.packageName,
                    packagePrice: 25
                },
                isPublic: true
            });

            await rating.save();
            console.log(`✅ Test rating created: ${testData.packageName}`);
        }

        console.log('🎉 All test ratings created successfully!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

addTestRatings();