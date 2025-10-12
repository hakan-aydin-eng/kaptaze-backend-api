const mongoose = require('mongoose');
require('dotenv').config();

async function fixZeroQuantityPackages() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const Restaurant = require('./models/Restaurant');

        // Find all restaurants with quantity: 0 packages
        const restaurants = await Restaurant.find({
            'packages.quantity': { $lte: 0 }
        });

        console.log(`\n🔍 Found ${restaurants.length} restaurants with zero/negative quantity packages\n`);

        for (const restaurant of restaurants) {
            console.log(`\n📍 Restaurant: ${restaurant.name} (${restaurant._id})`);
            console.log(`   Packages before: ${restaurant.packages.length}`);

            const before = restaurant.packages.length;
            const zeroQty = restaurant.packages.filter(p => p.quantity <= 0).length;

            // Remove packages with quantity <= 0
            restaurant.packages = restaurant.packages.filter(pkg => {
                if (pkg.quantity && pkg.quantity > 0) {
                    return true;
                } else {
                    console.log(`   ❌ Removing: "${pkg.name}" (quantity: ${pkg.quantity})`);
                    return false;
                }
            });

            // Fix any remaining packages without quantity field
            restaurant.packages.forEach(pkg => {
                if (!pkg.quantity || pkg.quantity < 1) {
                    pkg.quantity = 1;
                }
            });

            await restaurant.save();
            console.log(`   ✅ Cleaned: ${zeroQty} packages removed, ${restaurant.packages.length} remaining`);
        }

        console.log(`\n✅ Fixed ${restaurants.length} restaurants!`);

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from MongoDB');
    }
}

fixZeroQuantityPackages();
