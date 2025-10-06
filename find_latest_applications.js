const { MongoClient } = require('mongodb');
require('dotenv').config();

async function findLatestApplications() {
    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri);

    try {
        console.log('🔗 Connecting to MongoDB...');
        await client.connect();
        console.log('✅ Connected to MongoDB');

        const db = client.db('kaptazedb');
        const applicationsCollection = db.collection('applications');

        // Son 5 başvuruyu bul
        console.log('🔍 Finding latest 5 applications...');
        const latestApplications = await applicationsCollection
            .find({})
            .sort({ createdAt: -1 })
            .limit(5)
            .toArray();

        console.log(`📋 Found ${latestApplications.length} latest applications:`);
        console.log('');

        latestApplications.forEach((app, index) => {
            console.log(`${index + 1}. 📄 APPLICATION:`);
            console.log(`   ID: ${app.applicationId}`);
            console.log(`   Name: ${app.firstName} ${app.lastName}`);
            console.log(`   Email: ${app.email}`);
            console.log(`   Business: ${app.businessName}`);
            console.log(`   Status: ${app.status}`);
            console.log(`   Created: ${app.createdAt}`);
            console.log(`   Email Sent: ${app.emailSent ? 'YES' : 'NO'}`);
            if (app.emailSentAt) {
                console.log(`   Email Sent At: ${app.emailSentAt}`);
            }
            if (app.generatedCredentials) {
                console.log(`   Has Credentials: YES`);
                console.log(`   Username: ${app.generatedCredentials.username || 'N/A'}`);
                console.log(`   Has Plain Password: ${app.generatedCredentials.password ? 'YES' : 'NO'}`);
            } else {
                console.log(`   Has Credentials: NO`);
            }
            console.log('');
        });

        // "Taze" veya "Manav" içeren başvuruları ara
        console.log('🔍 Searching for "Taze" or "Manav" applications...');
        const manavApplications = await applicationsCollection
            .find({
                $or: [
                    { businessName: { $regex: /taze/i } },
                    { businessName: { $regex: /manav/i } },
                    { firstName: { $regex: /taze/i } },
                    { lastName: { $regex: /taze/i } }
                ]
            })
            .sort({ createdAt: -1 })
            .toArray();

        if (manavApplications.length > 0) {
            console.log(`🥬 Found ${manavApplications.length} Taze/Manav applications:`);
            manavApplications.forEach((app, index) => {
                console.log(`${index + 1}. 🥬 MANAV APPLICATION:`);
                console.log(`   ID: ${app.applicationId}`);
                console.log(`   Name: ${app.firstName} ${app.lastName}`);
                console.log(`   Email: ${app.email}`);
                console.log(`   Business: ${app.businessName}`);
                console.log(`   Status: ${app.status}`);
                console.log(`   Email Sent: ${app.emailSent ? 'YES' : 'NO'}`);
                console.log(`   Created: ${app.createdAt}`);
                console.log('');
            });
        } else {
            console.log('❌ No Taze/Manav applications found');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.close();
        console.log('🔐 Connection closed');
    }
}

console.log('🔍 KapTaze - Latest Applications Finder');
console.log('📋 Looking for recent applications and Taze Manav specifically');
console.log('');

findLatestApplications();