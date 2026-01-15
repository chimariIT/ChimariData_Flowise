/**
 * Verify Billing Imports
 * 
 * Attempts to import billing routes and services to check for missing dependencies.
 */

import 'dotenv/config';

async function verifyImports() {
    console.log('🔍 Verifying billing imports...');

    try {
        console.log('   Importing unified-billing-service...');
        await import('../server/services/billing/unified-billing-service');
        console.log('   ✅ unified-billing-service imported');

        console.log('   Importing pricing service...');
        await import('../server/services/pricing');
        console.log('   ✅ pricing service imported');

        console.log('   Importing billing routes...');
        await import('../server/routes/billing');
        console.log('   ✅ billing routes imported');

        console.log('   Importing payment routes...');
        await import('../server/routes/payment');
        console.log('   ✅ payment routes imported');

        console.log('\n✅ All billing imports verified successfully!');
        process.exit(0);
    } catch (error: any) {
        console.error('\n❌ Import verification failed:', error.message);
        if (error.code === 'MODULE_NOT_FOUND') {
            console.error('   Missing module:', error.message);
        }
        process.exit(1);
    }
}

verifyImports();
