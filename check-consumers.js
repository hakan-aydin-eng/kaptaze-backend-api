const mongoose = require('mongoose');
const Consumer = require('./models/Consumer');

mongoose.connect('mongodb+srv://kaptaze-admin:cilginkptz@kaptaze-cluster.ra9padd.mongodb.net/?retryWrites=true&w=majority&appName=kaptaze-cluster').then(async () => {
  console.log('🔍 MongoDB bağlandı, Consumer tablosunu kontrol ediyorum...');

  const consumers = await Consumer.find({}, 'email name surname pushTokens.token pushTokens.active').limit(10);

  console.log('📊 Toplam consumer sayısı:', await Consumer.countDocuments());
  console.log('');

  if (consumers.length === 0) {
    console.log('❌ Hiç consumer bulunamadı!');
  } else {
    console.log('👥 Consumer listesi:');
    consumers.forEach((consumer, i) => {
      const activeTokens = consumer.pushTokens?.filter(t => t.active) || [];
      console.log(`${i+1}. ${consumer.email} - ${consumer.name} ${consumer.surname} - Push token: ${activeTokens.length} aktif`);
    });
  }

  console.log('');
  const hakanUser = await Consumer.findOne({ email: 'hakan-aydin@live.com' });
  if (hakanUser) {
    console.log('✅ hakan-aydin@live.com hesabı bulundu:');
    console.log('   İsim:', hakanUser.name, hakanUser.surname);
    console.log('   Push token sayısı:', hakanUser.pushTokens?.length || 0);
    console.log('   Aktif token sayısı:', hakanUser.pushTokens?.filter(t => t.active).length || 0);
    if (hakanUser.pushTokens?.length > 0) {
      console.log('   Token detayları:');
      hakanUser.pushTokens.forEach((token, i) => {
        console.log(`     ${i+1}. Platform: ${token.platform}, Aktif: ${token.active}, Son kullanım: ${token.lastUsed}`);
      });
    }
  } else {
    console.log('❌ hakan-aydin@live.com hesabı Consumer tablosunda bulunamadı!');
  }

  process.exit(0);
}).catch(err => {
  console.error('❌ MongoDB bağlantı hatası:', err.message);
  process.exit(1);
});