require('dotenv').config();
const mongoose = require('mongoose');
const Consumer = require('./models/Consumer');

async function debugUsers() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔍 Checking push tokens for both users...');

        const users = await Consumer.find({
            email: { $in: ['hakan-aydin@live.com', 'aysecalik@hotmail.com'] },
            favoriteRestaurants: '68ab3a9ce2a7a0c81a94e99d'
        }, 'name email pushTokens favoriteRestaurants status lastLogin createdAt');

        console.log(`\n📊 Found ${users.length} users with same favorite restaurant:`);
        users.forEach((user, i) => {
            console.log(`${i+1}. ${user.name} (${user.email})`);
            console.log(`   Status: ${user.status}`);
            console.log(`   Created: ${user.createdAt}`);
            console.log(`   Last Login: ${user.lastLogin || 'N/A'}`);
            console.log(`   Push Tokens: ${user.pushTokens?.length || 0} tokens`);
            if (user.pushTokens?.length > 0) {
                user.pushTokens.forEach((token, j) => {
                    console.log(`     Token ${j+1}: ${token.token?.substring(0, 20)}... (active: ${token.active})`);
                });
            }
            console.log(`   Favorites: [${user.favoriteRestaurants.join(', ')}]`);
            console.log('---');
        });

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

debugUsers();