import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is not defined');
        process.exit(1);
    }

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        await client.connect();
        console.log('Connected to database');

        console.log('Adding multi_agent_coordination column to projects table...');
        await client.query(`
      ALTER TABLE projects 
      ADD COLUMN IF NOT EXISTS multi_agent_coordination jsonb;
    `);

        console.log('Successfully added multi_agent_coordination column!');
    } catch (err) {
        console.error('Error executing schema change:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

main();
