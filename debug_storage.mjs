import { storage } from './server/storage.ts';

async function testUserRetrieval() {
  console.log('🔍 Testing user retrieval from storage...');
  
  try {
    const user = await storage.getUserByEmail('test@example.com');
    
    if (user) {
      console.log('✅ User found!');
      console.log('User ID:', user.id);
      console.log('Email:', user.email);
      console.log('Provider:', user.provider);
      console.log('hashedPassword present:', !!user.hashedPassword);
      console.log('hashedPassword length:', user.hashedPassword?.length || 'N/A');
      console.log('password field present:', !!user.password);
      console.log('hashed_password field present:', !!user.hashed_password);
      
      if (user.hashedPassword) {
        console.log('✅ hashedPassword field is properly mapped!');
      } else {
        console.log('❌ hashedPassword field is missing - field mapping issue!');
      }
    } else {
      console.log('❌ User not found');
    }
  } catch (error) {
    console.error('❌ Error retrieving user:', error.message);
  }
}

testUserRetrieval();
