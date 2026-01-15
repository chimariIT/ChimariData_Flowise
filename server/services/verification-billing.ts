
import { getBillingService } from './billing/unified-billing-service';

async function verifyBillingService() {
    console.log('Verifying Billing Service...');

    const billingService = getBillingService();

    // Test Cost Calculation
    try {
        const cost = await billingService.calculateConsumptionCost(
            'test-user',
            'data_processing',
            100, // 100 MB
            'intermediate'
        );

        console.log('Calculated Cost for 100MB Data Processing (Intermediate):', cost);
    } catch (error: any) {
        console.error('Failed to calculate cost:', error.message);
    }

    // Test Admin Overview (might fail if DB is down, so wrap in try-catch)
    try {
        const overview = await billingService.getAdminBillingOverview();
        console.log('Billing Overview:', overview);
    } catch (error: any) {
        console.warn('Could not fetch billing overview (likely due to missing DB connection):', error.message);
    }
}

verifyBillingService().catch(console.error);
