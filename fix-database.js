import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function fixDatabase() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Fix NULL journey_type values
    const result = await client.query(`
      UPDATE projects 
      SET journey_type = 'ai_guided' 
      WHERE journey_type IS NULL
    `);
    
    console.log(`Updated ${result.rowCount} projects with NULL journey_type`);

    // Fix NULL subscription_status values
    const statusResult = await client.query(`
      UPDATE users 
      SET subscription_status = 'inactive' 
      WHERE subscription_status IS NULL
    `);
    
    console.log(`Updated ${statusResult.rowCount} users with NULL subscription_status`);

    // Fix NULL subscription_tier values
    const tierResult = await client.query(`
      UPDATE users 
      SET subscription_tier = 'none' 
      WHERE subscription_tier IS NULL
    `);
    
    console.log(`Updated ${tierResult.rowCount} users with NULL subscription_tier`);

    // Fix invalid project status values
    const projectStatusResult = await client.query(`
      UPDATE projects 
      SET status = 'draft' 
      WHERE status IS NULL OR status NOT IN ('draft', 'uploading', 'processing', 'pii_review', 'ready', 'analyzing', 'checkpoint', 'generating', 'completed', 'error', 'cancelled')
    `);
    
    console.log(`Updated ${projectStatusResult.rowCount} projects with invalid status values`);

    console.log('Database fixes completed successfully');
  } catch (error) {
    console.error('Error fixing database:', error);
  } finally {
    await client.end();
  }
}

fixDatabase();
