require('dotenv').config();
const mongoose = require('mongoose');
const Consumer = require('./models/Consumer');

async function debugFavorites() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔍 Detailed analysis of favorite notification users...');

        const users = await Consumer.find({
            favoriteRestaurants: '68ab3a9ce2a7a0c81a94e99d'
        });

        console.log(`\n📊 Found ${users.length} users with this favorite restaurant:`);
        users.forEach((user, i) => {
            console.log(`${i+1}. ${user.name} (${user.email})`);
            console.log(`   Status: ${user.status}`);
            console.log(`   Active Push Tokens: ${user.pushTokens?.filter(t => t.active)?.length || 0}`);

            if (user.pushTokens?.length > 0) {
                user.pushTokens.forEach((token, j) => {
                    console.log(`     Token ${j+1}: ${token.token?.substring(0, 30)}... (active: ${token.active}) (platform: ${token.platform || 'unknown'})`);
                });
            } else {
                console.log('     NO PUSH TOKENS!');
            }

            console.log(`   Notification Preferences: ${JSON.stringify(user.notificationPreferences || 'undefined')}`);
            console.log('---');
        });

        // Test the exact query used in notification service
        console.log('\n🔍 Testing exact notification service query:');
        const testQuery = await Consumer.find({
            status: 'active',
            favoriteRestaurants: '68ab3a9ce2a7a0c81a94e99d'
        }, 'name email status favoriteRestaurants pushTokens');

        console.log(`Found ${testQuery.length} users matching notification service query:`);
        testQuery.forEach((user, i) => {
            const activeTokens = user.pushTokens?.filter(t => t.active)?.length || 0;
            console.log(`${i+1}. ${user.name} (${user.email}) - Active tokens: ${activeTokens}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

debugFavorites();