// Check if user exists in database
require('dotenv').config();
const { storage } = require('../server/storage');

async function checkUser() {
    try {
        const userId = 'aRBfhQbiZgoN8KLVXnj7J';
        const email = 'mytest@chim.com';

        console.log('🔍 Checking for user...');
        console.log('User ID:', userId);
        console.log('Email:', email);

        // Check by ID
        const userById = await storage.getUser(userId);
        console.log('\n✅ User by ID:', userById ? {
            id: userById.id,
            email: userById.email,
            firstName: userById.firstName,
            lastName: userById.lastName
        } : 'NOT FOUND');

        // Check by email
        const users = await storage.getAllUsers();
        const userByEmail = users.find(u => u.email === email);
        console.log('\n✅ User by email:', userByEmail ? {
            id: userByEmail.id,
            email: userByEmail.email,
            firstName: userByEmail.firstName,
            lastName: userByEmail.lastName
        } : 'NOT FOUND');

        console.log('\n📊 Total users in database:', users.length);
        console.log('All user emails:', users.map(u => u.email).join(', '));

        // Check database connection type
        const { db } = require('../server/db');
        console.log('\n🗄️  Database connection:', db ? 'PostgreSQL (DatabaseStorage)' : 'In-Memory (MemStorage)');
        console.log('Storage type:', storage.constructor.name);

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        process.exit(0);
    }
}

checkUser();
