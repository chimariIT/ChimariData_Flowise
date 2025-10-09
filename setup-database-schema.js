#!/usr/bin/env node

/**
 * Setup database schema for ChimariData
 */

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

async function setupSchema() {
  console.log('🏗️  Setting up ChimariData database schema...');
  
  const pool = new Pool({
    connectionString: "postgresql://postgres:Chimari0320!@localhost:5432/chimaridata_dev",
    connectionTimeoutMillis: 10000,
  });

  try {
    const client = await pool.connect();
    console.log('✅ Connected to chimaridata_dev database');
    
    // Read and execute the first migration
    console.log('📦 Applying migration: 0000_smooth_sumo.sql');
    const migration1 = readFileSync(join('migrations', '0000_smooth_sumo.sql'), 'utf8');
    
    // Split by statement separator and execute each statement
    const statements = migration1.split('--> statement-breakpoint');
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (statement && !statement.startsWith('--')) {
        try {
          await client.query(statement);
          console.log(`✅ Executed statement ${i + 1}/${statements.length}`);
        } catch (error) {
          if (error.message.includes('already exists')) {
            console.log(`ℹ️  Statement ${i + 1} - object already exists, skipping`);
          } else {
            console.log(`⚠️  Statement ${i + 1} failed: ${error.message}`);
          }
        }
      }
    }
    
    // Apply the second migration if it exists
    try {
      console.log('📦 Applying migration: 001_add_user_roles_permissions.sql');
      const migration2 = readFileSync(join('migrations', '001_add_user_roles_permissions.sql'), 'utf8');
      const statements2 = migration2.split('--> statement-breakpoint');
      
      for (let i = 0; i < statements2.length; i++) {
        const statement = statements2[i].trim();
        if (statement && !statement.startsWith('--')) {
          try {
            await client.query(statement);
            console.log(`✅ Executed statement ${i + 1}/${statements2.length} from second migration`);
          } catch (error) {
            if (error.message.includes('already exists')) {
              console.log(`ℹ️  Statement ${i + 1} - object already exists, skipping`);
            } else {
              console.log(`⚠️  Statement ${i + 1} failed: ${error.message}`);
            }
          }
        }
      }
    } catch (fileError) {
      console.log('ℹ️  Second migration file not found or not readable, skipping');
    }
    
    // Verify tables were created
    console.log('\n🔍 Verifying database schema...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('📊 Created tables:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
    // Test creating a sample user (for authentication testing)
    console.log('\n👤 Testing user creation...');
    try {
      const testUserId = `test_user_${Date.now()}`;
      await client.query(`
        INSERT INTO users (id, email, first_name, last_name, provider) 
        VALUES ($1, $2, $3, $4, $5)
      `, [testUserId, 'test@example.com', 'Test', 'User', 'email']);
      
      console.log('✅ Test user created successfully');
      
      // Clean up test user
      await client.query('DELETE FROM users WHERE email = $1', ['test@example.com']);
      console.log('✅ Test user cleaned up');
      
    } catch (userError) {
      console.log(`⚠️  User creation test failed: ${userError.message}`);
    }
    
    client.release();
    await pool.end();
    
    console.log('\n🎉 Database schema setup complete!');
    console.log('\nNext steps:');
    console.log('1. Restart your development server: npm run dev');
    console.log('2. Visit http://localhost:3000');
    console.log('3. Test the authentication flow');
    
    return true;
    
  } catch (error) {
    console.log(`❌ Schema setup failed: ${error.message}`);
    await pool.end();
    return false;
  }
}

// Run the setup
setupSchema().catch(console.error);

