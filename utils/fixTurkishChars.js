/**
 * Migration Script: Fix Turkish Character Encoding in Database
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Character mapping for fixing encoding
const charMap = {
    'T�rk': 'Türk',
    'Mutfa��': 'Mutfağı',
    'Mutfa�': 'Mutfağı',
    'Atat�rk': 'Atatürk',
    'Muratpa�a': 'Muratpaşa',
    'Y�lmaz': 'Yılmaz',
    'T�rk�e': 'Türkçe',
    '�stanbul': 'İstanbul',
    '�i�li': 'Şişli',
    'Kad�k�y': 'Kadıköy',
    'Be�ikta�': 'Beşiktaş',
    'Üsküdar': 'Üsküdar',
    'Bak�rköy': 'Bakırköy',
    'Ümraniye': 'Ümraniye',
    'Sarıyer': 'Sarıyer',
    'Çekmeköy': 'Çekmeköy',
    'Küçükçekmece': 'Küçükçekmece',
    'Büyükçekmece': 'Büyükçekmece',
    'Şişhane': 'Şişhane',
    'Galataport': 'Galataport',
    'Eminönü': 'Eminönü',
    'Fatih': 'Fatih',
    'Zeytinburnu': 'Zeytinburnu',
    'Güngören': 'Güngören',
    'Esenler': 'Esenler',
    'Gaziosmanpaşa': 'Gaziosmanpaşa',
    'Sultangazi': 'Sultangazi',
    'Arnavutköy': 'Arnavutköy',
    'Eyüpsultan': 'Eyüpsultan',
    'Bayrampaşa': 'Bayrampaşa',
    'Çatalca': 'Çatalca',
    'Silivri': 'Silivri',
    'Büyükada': 'Büyükada',
    'Heybeliada': 'Heybeliada',
    'Burgazada': 'Burgazada',
    'Kınalıada': 'Kınalıada',
    'Şile': 'Şile',
    'Çekmeköy': 'Çekmeköy',
    'Sancaktepe': 'Sancaktepe',
    'Sultanbeyli': 'Sultanbeyli',
    'Pendik': 'Pendik',
    'Tuzla': 'Tuzla',
    'Maltepe': 'Maltepe',
    'Kartal': 'Kartal',
    'Adalar': 'Adalar',
    'Ataşehir': 'Ataşehir',
    '�': 'ü',
    '�': 'ç', 
    '�': 'ğ',
    '�': 'ı',
    '�': 'İ',
    '�': 'ö',
    '�': 'ş',
    '�': 'Ü',
    '�': 'Ç',
    '�': 'Ğ',
    '�': 'Ö',
    '�': 'Ş'
};

// Fix Turkish characters in text
function fixTurkishChars(text) {
    if (typeof text !== 'string') return text;
    
    let fixed = text;
    Object.keys(charMap).forEach(key => {
        fixed = fixed.replace(new RegExp(key, 'g'), charMap[key]);
    });
    
    return fixed;
}

// Fix Turkish characters in object recursively
function fixTurkishInObject(obj) {
    if (typeof obj === 'string') {
        return fixTurkishChars(obj);
    } else if (Array.isArray(obj)) {
        return obj.map(item => fixTurkishInObject(item));
    } else if (obj && typeof obj === 'object') {
        const fixed = {};
        Object.keys(obj).forEach(key => {
            fixed[key] = fixTurkishInObject(obj[key]);
        });
        return fixed;
    }
    return obj;
}

async function fixDatabase() {
    try {
        // Connect to database
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Connected to MongoDB');

        // Fix Applications collection
        console.log('\n📋 Fixing Applications collection...');
        const Application = require('../models/Application');
        const applications = await Application.find({});
        
        let appFixed = 0;
        for (const app of applications) {
            const originalDoc = app.toObject();
            const fixedDoc = fixTurkishInObject(originalDoc);
            
            // Check if anything changed
            if (JSON.stringify(originalDoc) !== JSON.stringify(fixedDoc)) {
                await Application.updateOne({ _id: app._id }, fixedDoc);
                appFixed++;
                console.log(`✅ Fixed application: ${fixedDoc.businessName}`);
            }
        }
        console.log(`📋 Fixed ${appFixed} applications`);

        // Fix Restaurants collection
        console.log('\n🏪 Fixing Restaurants collection...');
        const Restaurant = require('../models/Restaurant');
        const restaurants = await Restaurant.find({});
        
        let restFixed = 0;
        for (const restaurant of restaurants) {
            const originalDoc = restaurant.toObject();
            const fixedDoc = fixTurkishInObject(originalDoc);
            
            // Check if anything changed
            if (JSON.stringify(originalDoc) !== JSON.stringify(fixedDoc)) {
                await Restaurant.updateOne({ _id: restaurant._id }, fixedDoc);
                restFixed++;
                console.log(`✅ Fixed restaurant: ${fixedDoc.name}`);
            }
        }
        console.log(`🏪 Fixed ${restFixed} restaurants`);

        console.log('\n🎉 Database fix completed successfully!');
        console.log(`📊 Total fixed: ${appFixed} applications, ${restFixed} restaurants`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Database fix failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    fixDatabase();
}

module.exports = { fixTurkishChars, fixTurkishInObject, fixDatabase };