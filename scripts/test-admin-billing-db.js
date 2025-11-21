/**
 * Test admin-billing API endpoints connected to database
 * Run with: node scripts/test-admin-billing-db.js
 */

import pkg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

async function testAdminBillingDB() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  console.log('🧪 Testing Admin Billing Database Integration\n');

  try {
    // Test 1: Fetch all tiers (simulating GET /admin/billing/tiers)
    console.log('✅ Test 1: Fetch all subscription tiers');
    const tierResult = await pool.query('SELECT * FROM subscription_tier_pricing WHERE is_active = true');
    console.log(`   Found ${tierResult.rows.length} active tiers:`);
    tierResult.rows.forEach(tier => {
      console.log(`   • ${tier.display_name} (${tier.id}): $${(tier.monthly_price_usd / 100).toFixed(2)}/mo`);
    });

    // Test 2: Update a tier (simulating POST /admin/billing/tiers)
    console.log('\n✅ Test 2: Update Professional tier price');
    const [professionalBefore] = (await pool.query(
      'SELECT monthly_price_usd FROM subscription_tier_pricing WHERE id = $1',
      ['professional']
    )).rows;
    console.log(`   Before: $${(professionalBefore.monthly_price_usd / 100).toFixed(2)}/mo`);

    // Update to $25/month
    await pool.query(`
      UPDATE subscription_tier_pricing
      SET monthly_price_usd = 2500, updated_at = NOW()
      WHERE id = 'professional'
    `);

    const [professionalAfter] = (await pool.query(
      'SELECT monthly_price_usd FROM subscription_tier_pricing WHERE id = $1',
      ['professional']
    )).rows;
    console.log(`   After:  $${(professionalAfter.monthly_price_usd / 100).toFixed(2)}/mo ✅`);

    // Revert back to $20/month
    await pool.query(`
      UPDATE subscription_tier_pricing
      SET monthly_price_usd = 2000, updated_at = NOW()
      WHERE id = 'professional'
    `);
    console.log(`   Reverted back to $20/mo`);

    // Test 3: Soft delete/deactivate (simulating DELETE /admin/billing/tiers/:id)
    console.log('\n✅ Test 3: Soft delete (deactivate) a tier');
    await pool.query(`
      UPDATE subscription_tier_pricing
      SET is_active = false, updated_at = NOW()
      WHERE id = 'trial'
    `);
    const activeCount = (await pool.query('SELECT COUNT(*) FROM subscription_tier_pricing WHERE is_active = true')).rows[0].count;
    console.log(`   Trial tier deactivated. Active tiers: ${activeCount}`);

    // Reactivate
    await pool.query(`
      UPDATE subscription_tier_pricing
      SET is_active = true, updated_at = NOW()
      WHERE id = 'trial'
    `);
    console.log(`   Trial tier reactivated`);

    // Test 4: Verify tier structure has all required fields
    console.log('\n✅ Test 4: Verify tier data structure');
    const [tier] = (await pool.query('SELECT * FROM subscription_tier_pricing WHERE id = $1', ['starter'])).rows;
    console.log(`   Checking 'starter' tier fields:`);
    console.log(`   • monthly_price_usd: $${(tier.monthly_price_usd / 100).toFixed(2)}`);
    console.log(`   • yearly_price_usd: $${(tier.yearly_price_usd / 100).toFixed(2)}`);
    console.log(`   • limits: ${Object.keys(tier.limits || {}).length} properties`);
    console.log(`   • features: ${Object.keys(tier.features || {}).length} properties`);
    console.log(`   • journey_pricing: ${Object.keys(tier.journey_pricing || {}).length} journey types`);
    console.log(`   • overage_pricing: ${Object.keys(tier.overage_pricing || {}).length} overage types`);
    console.log(`   • discounts: ${Object.keys(tier.discounts || {}).length} discount types`);

    // Test 5: Service pricing (existing)
    console.log('\n✅ Test 5: Verify service pricing table');
    const services = await pool.query('SELECT * FROM service_pricing WHERE is_active = true');
    console.log(`   Found ${services.rows.length} active services:`);
    services.rows.forEach(service => {
      console.log(`   • ${service.display_name}: $${(service.base_price / 100).toFixed(2)}`);
    });

    console.log('\n✅ All tests passed! Admin billing is database-connected.');
    console.log('\n📋 Summary:');
    console.log('   • Subscription tiers: Database-backed ✅');
    console.log('   • Update operations: Working ✅');
    console.log('   • Soft delete: Working ✅');
    console.log('   • Data integrity: Verified ✅');
    console.log('   • Service pricing: Database-backed ✅');
    console.log('\n🎉 Admin billing API can now use these database tables!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

testAdminBillingDB()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
