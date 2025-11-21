/**
 * Seed initial pricing data into database
 * 
 * Run this script to populate the database with default pricing
 */

import { db } from '../db';
import { servicePricing, subscriptionTierPricing } from '@shared/schema';

async function seedPricingData() {
  console.log('🌱 Seeding pricing data...');

  try {
    // Seed service pricing
    console.log('📊 Seeding service pricing...');
    const services = [
      {
        id: 'pay-per-analysis',
        serviceType: 'pay-per-analysis',
        displayName: 'Pay-per-Analysis',
        description: 'Perfect for one-time insights without monthly commitment. Upload your data, get comprehensive analysis and actionable recommendations.',
        basePrice: 2500, // $25 in cents
        pricingModel: 'fixed',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'expert-consultation',
        serviceType: 'expert-consultation',
        displayName: 'Expert Consultation',
        description: '1-hour session with our data science experts. Get strategic guidance, data interpretation, and implementation roadmaps.',
        basePrice: 15000, // $150 in cents
        pricingModel: 'fixed',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    for (const service of services) {
      try {
        await db.insert(servicePricing).values(service);
        console.log(`✅ Seeded service: ${service.displayName}`);
      } catch (error: any) {
        if (error.code === '23505') { // Unique constraint violation
          console.log(`⚠️  Service ${service.serviceType} already exists, skipping...`);
        } else {
          throw error;
        }
      }
    }

    // Seed subscription tier pricing
    console.log('📊 Seeding subscription tier pricing...');
    const tiers = [
      {
        id: 'trial',
        name: 'Trial',
        displayName: 'Trial',
        description: 'Perfect for testing our platform with basic analytics',
        monthlyPriceUsd: 100, // $1 in cents
        yearlyPriceUsd: 1000, // $10 in cents
        limits: {
          maxFiles: 1,
          maxFileSizeMB: 10,
          totalDataVolumeMB: 10,
          aiInsights: 1,
          maxAnalysisComponents: 5,
          maxVisualizations: 3
        },
        features: {
          dataTransformation: false,
          statisticalAnalysis: true,
          advancedInsights: false,
          piiDetection: true
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'starter',
        name: 'Starter',
        displayName: 'Starter',
        description: 'Great for small teams with basic data transformation needs',
        monthlyPriceUsd: 1000, // $10 in cents
        yearlyPriceUsd: 10000, // $100 in cents
        limits: {
          maxFiles: 2,
          maxFileSizeMB: 50,
          totalDataVolumeMB: 100,
          aiInsights: 3,
          maxAnalysisComponents: 15,
          maxVisualizations: 10
        },
        features: {
          dataTransformation: true,
          statisticalAnalysis: true,
          advancedInsights: false,
          piiDetection: true
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'professional',
        name: 'Professional',
        displayName: 'Professional',
        description: 'Comprehensive analytics for growing businesses',
        monthlyPriceUsd: 2000, // $20 in cents
        yearlyPriceUsd: 20000, // $200 in cents
        limits: {
          maxFiles: 5,
          maxFileSizeMB: 100,
          totalDataVolumeMB: 500,
          aiInsights: 5,
          maxAnalysisComponents: 50,
          maxVisualizations: 25
        },
        features: {
          dataTransformation: true,
          statisticalAnalysis: true,
          advancedInsights: true,
          piiDetection: true
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        displayName: 'Enterprise',
        description: 'Full access to all features with premium support',
        monthlyPriceUsd: 5000, // $50 in cents
        yearlyPriceUsd: 50000, // $500 in cents
        limits: {
          maxFiles: 10,
          maxFileSizeMB: 200,
          totalDataVolumeMB: 1000,
          aiInsights: 10,
          maxAnalysisComponents: 100,
          maxVisualizations: 50
        },
        features: {
          dataTransformation: true,
          statisticalAnalysis: true,
          advancedInsights: true,
          piiDetection: true
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    for (const tier of tiers) {
      try {
        await db.insert(subscriptionTierPricing).values(tier);
        console.log(`✅ Seeded tier: ${tier.displayName}`);
      } catch (error: any) {
        if (error.code === '23505') { // Unique constraint violation
          console.log(`⚠️  Tier ${tier.id} already exists, skipping...`);
        } else {
          throw error;
        }
      }
    }

    console.log('✅ Pricing data seeding completed successfully!');
  } catch (error: any) {
    console.error('❌ Error seeding pricing data:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  seedPricingData()
    .then(() => {
      console.log('✅ Done');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed:', error);
      process.exit(1);
    });
}

export { seedPricingData };


