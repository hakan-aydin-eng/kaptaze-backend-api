/**
 * Fix Expo Tokens - Disable all Expo push tokens
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Consumer = require('../models/Consumer');

async function fixExpoTokens() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('🔧 Fixing Expo tokens...\n');

        // Find all consumers with Expo tokens
        const consumersWithExpoTokens = await Consumer.find({
            'pushTokens.token': { $regex: '^ExponentPushToken' }
        });

        console.log(`📊 Found ${consumersWithExpoTokens.length} consumers with Expo tokens`);

        let fixedCount = 0;

        for (const consumer of consumersWithExpoTokens) {
            // Disable all Expo tokens
            let hasExpoTokens = false;
            consumer.pushTokens.forEach(token => {
                if (token.token && token.token.startsWith('ExponentPushToken')) {
                    token.active = false;
                    hasExpoTokens = true;
                }
            });

            if (hasExpoTokens) {
                await consumer.save();
                console.log(`✅ Fixed: ${consumer.email} - Disabled Expo tokens`);
                fixedCount++;
            }
        }

        console.log(`🎉 Fixed ${fixedCount} consumers with Expo tokens.`);
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

fixExpoTokens();