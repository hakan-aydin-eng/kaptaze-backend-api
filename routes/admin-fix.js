const express = require('express');
const router = express.Router();
const Restaurant = require('../models/Restaurant');

// Emergency fix for zero quantity packages
router.post('/fix-zero-quantity', async (req, res) => {
    try {
        // Find all restaurants with quantity: 0 packages
        const restaurants = await Restaurant.find({
            'packages.quantity': { $lte: 0 }
        });

        console.log(`\n🔍 Found ${restaurants.length} restaurants with zero/negative quantity packages\n`);

        const results = [];

        for (const restaurant of restaurants) {
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

            results.push({
                restaurantName: restaurant.name,
                restaurantId: restaurant._id,
                packagesRemoved: zeroQty,
                packagesRemaining: restaurant.packages.length
            });

            console.log(`   ✅ Cleaned: ${restaurant.name} - ${zeroQty} packages removed`);
        }

        res.json({
            success: true,
            message: `Fixed ${restaurants.length} restaurants`,
            results
        });

    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
