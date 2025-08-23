/**
 * Seed Data for Testing
 */

const mongoose = require('mongoose');
const User = require('../models/User');

const seedData = async () => {
    try {
        console.log('🌱 Seeding test data...');

        // Check if admin user already exists
        const existingAdmin = await User.findOne({ username: 'admin', role: 'admin' });
        
        if (!existingAdmin) {
            // Create default admin user
            const adminUser = new User({
                firstName: 'Admin',
                lastName: 'User',
                email: 'admin@kaptaze.com',
                phone: '+90 555 000 0000',
                username: 'admin',
                password: 'admin123', // Will be hashed automatically
                role: 'admin',
                status: 'active',
                emailVerified: true
            });

            await adminUser.save();
            console.log('✅ Default admin user created');
            console.log('   Username: admin');
            console.log('   Password: admin123');
            console.log('   Email: admin@kaptaze.com');
        } else {
            console.log('ℹ️  Admin user already exists');
        }

        console.log('✅ Seed data completed');

    } catch (error) {
        console.error('❌ Seed data error:', error);
    }
};

module.exports = seedData;