const mongoose = require('mongoose');
require('dotenv').config();

const Consumer = require('./models/Consumer');

mongoose.connect('mongodb+srv://kaptaze-admin:clgnkptz@kaptaze-cluster.ra9padd.mongodb.net/kaptazedb?retryWrites=true&w=majority&appName=kaptaze-cluster')
.then(async () => {
  console.log('🔍 Checking consumer favorites...');

  const consumers = await Consumer.find({}, 'name email favoriteRestaurants').limit(5);

  consumers.forEach(consumer => {
    console.log(`👤 ${consumer.name} (${consumer.email}): ${consumer.favoriteRestaurants?.length || 0} favorites`);
    if (consumer.favoriteRestaurants?.length > 0) {
      console.log(`   Favorites: ${consumer.favoriteRestaurants.join(', ')}`);
    }
  });

  process.exit(0);
})
.catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});