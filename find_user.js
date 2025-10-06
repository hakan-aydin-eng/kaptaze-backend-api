const { MongoClient } = require('mongodb');

async function findUserByEmail() {
    const uri = 'mongodb+srv://kaptaze-admin:kptzclg@kaptaze-cluster.ra9padd.mongodb.net/kaptazedb?retryWrites=true&w=majority&appName=kaptaze-cluster';
    const client = new MongoClient(uri);

    try {
        console.log('🔗 Connecting to MongoDB...');
        await client.connect();
        console.log('✅ Connected to MongoDB');

        const db = client.db('kaptazedb');

        // Check Applications collection
        console.log('🔍 Searching in Applications collection...');
        const applicationsCollection = db.collection('applications');
        const application = await applicationsCollection.findOne({ email: 'rsmcihan@hotmail.com' });

        if (application) {
            console.log('📄 Found application:', JSON.stringify(application, null, 2));
        } else {
            console.log('❌ No application found with email: rsmcihan@hotmail.com');
        }

        // Check Users collection
        console.log('🔍 Searching in Users collection...');
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ email: 'rsmcihan@hotmail.com' });

        if (user) {
            console.log('👤 Found user:', JSON.stringify({
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                status: user.status,
                createdAt: user.createdAt
            }, null, 2));
        } else {
            console.log('❌ No user found with email: rsmcihan@hotmail.com');
        }

        // Check Restaurants collection (if user exists)
        if (user && user.role === 'restaurant') {
            console.log('🔍 Searching in Restaurants collection...');
            const restaurantsCollection = db.collection('restaurants');
            const restaurant = await restaurantsCollection.findOne({ owner: user._id });

            if (restaurant) {
                console.log('🏪 Found restaurant:', JSON.stringify({
                    id: restaurant._id,
                    name: restaurant.name,
                    businessName: restaurant.businessName,
                    status: restaurant.status
                }, null, 2));
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
        console.log('🔐 Connection closed');
    }
}

findUserByEmail();