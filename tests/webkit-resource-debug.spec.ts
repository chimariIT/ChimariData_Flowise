import { test, expect } from '@playwright/test';

test.describe('WebKit Resource Debug', () => {
  test('Track all resource requests in WebKit', async ({ page }) => {
    console.log('🔧 Tracking all resource requests in WebKit');
    
    const failedRequests: Array<{url: string, status: number, method: string}> = [];
    const allRequests: Array<{url: string, method: string}> = [];
    
    // Track all requests
    page.on('request', request => {
      allRequests.push({
        url: request.url(),
        method: request.method()
      });
      console.log(`📤 REQUEST: ${request.method()} ${request.url()}`);
    });

    // Track failed responses
    page.on('response', response => {
      const request = response.request();
      if (!response.ok()) {
        failedRequests.push({
          url: request.url(),
          status: response.status(),
          method: request.method()
        });
        console.log(`❌ FAILED: ${response.status()} ${request.method()} ${request.url()}`);
      } else {
        console.log(`✅ SUCCESS: ${response.status()} ${request.method()} ${request.url()}`);
      }
    });
    
    // Navigate to the main page
    await page.goto('http://localhost:3000/');
    console.log('✅ Loaded main landing page');
    
    // Wait for network to be idle
    await page.waitForLoadState('networkidle');
    console.log('✅ Network idle');
    
    // Summary
    console.log(`\n📊 SUMMARY:`);
    console.log(`📍 Total requests: ${allRequests.length}`);
    console.log(`📍 Failed requests: ${failedRequests.length}`);
    
    if (failedRequests.length > 0) {
      console.log(`\n🚨 FAILED REQUESTS:`);
      failedRequests.forEach((req, i) => {
        console.log(`   ${i + 1}. [${req.status}] ${req.method} ${req.url}`);
      });
    }
    
    // Group requests by domain
    const requestsByDomain = allRequests.reduce((acc, req) => {
      try {
        const url = new URL(req.url);
        const domain = url.hostname;
        if (!acc[domain]) acc[domain] = [];
        acc[domain].push(req.url);
      } catch (e) {
        if (!acc['invalid']) acc['invalid'] = [];
        acc['invalid'].push(req.url);
      }
      return acc;
    }, {} as Record<string, string[]>);
    
    console.log(`\n🌐 REQUESTS BY DOMAIN:`);
    Object.entries(requestsByDomain).forEach(([domain, urls]) => {
      console.log(`   ${domain}: ${urls.length} requests`);
      if (domain !== 'localhost') {
        urls.forEach(url => console.log(`     - ${url}`));
      }
    });
  });
});