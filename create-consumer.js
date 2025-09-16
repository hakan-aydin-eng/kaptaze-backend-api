const mongoose = require('mongoose');
const Consumer = require('./models/Consumer');

mongoose.connect('mongodb+srv://kaptaze-admin:cilginkptz@kaptaze-cluster.ra9padd.mongodb.net/?retryWrites=true&w=majority&appName=kaptaze-cluster').then(async () => {
  console.log('🔍 MongoDB bağlandı, Consumer oluşturuluyor...');

  // Check if consumer already exists
  const existing = await Consumer.findOne({ email: 'hakan-aydin@live.com' });
  if (existing) {
    console.log('✅ hakan-aydin@live.com hesabı zaten mevcut');
    process.exit(0);
  }

  // Create new consumer
  const consumer = new Consumer({
    name: 'Hakan',
    surname: 'Aydin',
    email: 'hakan-aydin@live.com',
    password: 'test123', // You can change this
    status: 'active',
    emailVerified: true
  });

  await consumer.save();
  console.log('✅ Consumer oluşturuldu:', consumer.email);
  console.log('   İsim:', consumer.name, consumer.surname);
  console.log('   ID:', consumer._id);

  process.exit(0);
}).catch(err => {
  console.error('❌ Hata:', err.message);
  process.exit(1);
});