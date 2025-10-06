const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function updateUserPassword() {
    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri);

    const userEmail = 'rsmcihan@hotmail.com';
    const newPassword = 'Kaptaze2025!';
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;

    try {
        console.log('🔗 Connecting to MongoDB...');
        await client.connect();
        console.log('✅ Connected to MongoDB');

        // Hash the new password
        console.log('🔐 Hashing new password...');
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
        console.log('✅ Password hashed successfully');

        const db = client.db('kaptazedb');
        const usersCollection = db.collection('users');

        // Find and update user by ID (found from find_user.js)
        const userId = '68d680c518c02d98ca53c033';
        console.log(`🔍 Finding user by ID: ${userId}`);
        const result = await usersCollection.findOneAndUpdate(
            { _id: new ObjectId(userId) },
            {
                $set: {
                    password: hashedPassword,
                    passwordUpdatedAt: new Date()
                }
            },
            { returnDocument: 'after' }
        );

        if (result.value) {
            console.log('✅ User password updated successfully!');
            console.log('👤 Updated user:', {
                id: result.value._id,
                username: result.value.username,
                email: result.value.email,
                role: result.value.role,
                passwordUpdatedAt: result.value.passwordUpdatedAt
            });

            // Verify the password works
            console.log('🧪 Testing password verification...');
            const isValid = await bcrypt.compare(newPassword, result.value.password);
            console.log('✅ Password verification:', isValid ? 'SUCCESS' : 'FAILED');

        } else {
            console.log('❌ User not found');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
        console.log('🔐 Connection closed');
    }
}

console.log('🔧 Password Update Script');
console.log('📧 Target User: rsmcihan@hotmail.com');
console.log('🔑 New Password: Kaptaze2025!');
console.log('⚠️ This will overwrite the existing password hash');
console.log('');

updateUserPassword();