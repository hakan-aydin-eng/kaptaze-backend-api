/**
 * Database Setup - Development & Testing
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

const connectDB = async () => {
    try {
        let mongoUri = process.env.MONGODB_URI;

        // Use in-memory database only for testing
        if (process.env.NODE_ENV === 'test' || (!mongoUri && process.env.NODE_ENV === 'development')) {
            console.log('🧪 Starting in-memory MongoDB server...');
            mongoServer = await MongoMemoryServer.create({
                instance: {
                    dbName: 'kaptazedb'
                }
            });
            mongoUri = mongoServer.getUri();
            console.log('✅ In-memory MongoDB server started');
        }

        console.log(`🔗 Connecting to MongoDB...`);
        console.log(`📍 URI: ${mongoUri ? mongoUri.replace(/:[^:]*@/, ':****@') : 'undefined'}`);
        
        const conn = await mongoose.connect(mongoUri, {
            // Modern connection options
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            // UTF-8 encoding support for Turkish characters
            useNewUrlParser: true,
            useUnifiedTopology: true,
            bufferCommands: false
        });
        
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        console.log(`📊 Database: ${conn.connection.name}`);
        
        return conn;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        
        if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
            console.log('\n💡 Falling back to in-memory database...');
            try {
                mongoServer = await MongoMemoryServer.create();
                const mongoUri = mongoServer.getUri();
                console.log('🧪 In-memory MongoDB server started as fallback');
                
                const conn = await mongoose.connect(mongoUri, {
                    useNewUrlParser: true,
                    useUnifiedTopology: true,
                    bufferCommands: false
                });
                console.log(`✅ Connected to in-memory MongoDB: ${conn.connection.host}`);
                return conn;
            } catch (fallbackError) {
                console.error('❌ Fallback database also failed:', fallbackError.message);
                throw fallbackError;
            }
        }
        
        throw error;
    }
};

const disconnectDB = async () => {
    try {
        await mongoose.connection.close();
        if (mongoServer) {
            await mongoServer.stop();
            console.log('🔌 In-memory MongoDB server stopped');
        }
        console.log('🔌 Database connection closed');
    } catch (error) {
        console.error('❌ Error closing database connection:', error);
    }
};

module.exports = {
    connectDB,
    disconnectDB
};