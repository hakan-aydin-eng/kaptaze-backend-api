const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function checkMutluWaffleUser() {
    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri);

    try {
        console.log('🔗 Connecting to MongoDB...');
        await client.connect();
        console.log('✅ Connected to MongoDB');

        const db = client.db('kaptazedb');

        // Check Users collection
        const usersCollection = db.collection('users');
        const username = 'mutluwaf712';
        const plainPassword = 'akL8zptY';

        console.log(`🔍 Searching for user: ${username}`);

        const user = await usersCollection.findOne({ username: username });

        if (!user) {
            console.log('❌ User not found in users collection');

            // Check if application was approved but user not created
            const applicationsCollection = db.collection('applications');
            const application = await applicationsCollection.findOne({
                'generatedCredentials.username': username
            });

            if (application) {
                console.log('🔍 Found application but no user account created!');
                console.log('Application details:', {
                    id: application.applicationId,
                    business: application.businessName,
                    status: application.status,
                    username: application.generatedCredentials?.username,
                    hasPassword: !!application.generatedCredentials?.password
                });

                // Create the missing user account
                console.log('🛠️ Creating missing user account...');

                const hashedPassword = await bcrypt.hash(plainPassword, 12);

                const newUser = {
                    firstName: application.firstName,
                    lastName: application.lastName,
                    email: application.email,
                    phone: application.phone,
                    username: username,
                    password: hashedPassword,
                    role: 'restaurant',
                    status: 'active',
                    createdBy: null,
                    restaurantId: application.restaurantId,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                const result = await usersCollection.insertOne(newUser);
                console.log('✅ User account created:', result.insertedId);

                // Update application
                await applicationsCollection.updateOne(
                    { applicationId: application.applicationId },
                    {
                        $set: {
                            userId: result.insertedId,
                            userAccountCreated: true,
                            userAccountCreatedAt: new Date()
                        }
                    }
                );

                console.log('✅ Application updated with user ID');
            } else {
                console.log('❌ Application not found either');
            }

        } else {
            console.log('✅ User found in database:');
            console.log({
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                status: user.status,
                restaurantId: user.restaurantId,
                hasPassword: !!user.password
            });

            // Test password verification
            if (user.password) {
                const isPasswordValid = await bcrypt.compare(plainPassword, user.password);
                console.log(`🔐 Password verification: ${isPasswordValid ? '✅ VALID' : '❌ INVALID'}`);

                if (!isPasswordValid) {
                    console.log('🛠️ Updating password hash...');
                    const newHashedPassword = await bcrypt.hash(plainPassword, 12);
                    await usersCollection.updateOne(
                        { username: username },
                        {
                            $set: {
                                password: newHashedPassword,
                                passwordUpdated: new Date()
                            }
                        }
                    );
                    console.log('✅ Password hash updated');
                }
            } else {
                console.log('❌ User has no password set');
                const hashedPassword = await bcrypt.hash(plainPassword, 12);
                await usersCollection.updateOne(
                    { username: username },
                    {
                        $set: {
                            password: hashedPassword,
                            passwordSet: new Date()
                        }
                    }
                );
                console.log('✅ Password set for user');
            }
        }

        // Final verification
        console.log('\n🔍 Final verification...');
        const finalUser = await usersCollection.findOne({ username: username });
        if (finalUser) {
            const isPasswordValid = await bcrypt.compare(plainPassword, finalUser.password);
            console.log(`✅ Final user check: username=${finalUser.username}, password_valid=${isPasswordValid}`);
            console.log(`🏪 Restaurant login should work now with: ${username} / ${plainPassword}`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await client.close();
        console.log('🔐 Connection closed');
    }
}

console.log('🧇 KapTaze - Mutlu Waffle User Account Checker');
console.log('🔍 Checking user: mutluwaf712');
console.log('🔐 Password: akL8zptY');
console.log('');

checkMutluWaffleUser();