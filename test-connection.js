const mongoose = require('mongoose');
require('dotenv').config();

const testConnection = async () => {
    console.log('🔍 Testing MongoDB connection...');
    console.log('Connection string:', process.env.MONGODB_URI?.replace(/:[^:]*@/, ':****@'));
    
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB connection successful!');
        console.log('📊 Database name:', mongoose.connection.name);
        console.log('🏠 Host:', mongoose.connection.host);
        
        // Test creating a document
        const testSchema = new mongoose.Schema({ test: String });
        const TestModel = mongoose.model('Test', testSchema);
        
        const testDoc = new TestModel({ test: 'Hello from KapTaze API!' });
        await testDoc.save();
        console.log('✅ Test document created successfully');
        
        await testDoc.deleteOne();
        console.log('✅ Test document cleaned up');
        
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        if (error.message.includes('ENOTFOUND')) {
            console.log('\n💡 Possible solutions:');
            console.log('1. Check if cluster name is correct in connection string');
            console.log('2. Verify network access (IP allowlist)');
            console.log('3. Confirm username/password are correct');
        }
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Connection closed');
    }
};

testConnection();