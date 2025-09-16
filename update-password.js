const mongoose = require('mongoose');
const Consumer = require('./models/Consumer');

mongoose.connect('mongodb+srv://kaptaze-admin:cilginkptz@kaptaze-cluster.ra9padd.mongodb.net/?retryWrites=true&w=majority&appName=kaptaze-cluster').then(async () => {
  console.log('🔍 MongoDB bağlandı, şifre güncelleniyor...');

  const consumer = await Consumer.findOne({ email: 'hakan-aydin@live.com' });
  if (!consumer) {
    console.log('❌ Consumer bulunamadı!');
    process.exit(1);
  }

  // Update password to 123456
  consumer.password = '123456';
  await consumer.save();

  console.log('✅ Şifre güncellendi: 123456');
  console.log('   Consumer ID:', consumer._id);

  process.exit(0);
}).catch(err => {
  console.error('❌ Hata:', err.message);
  process.exit(1);
});