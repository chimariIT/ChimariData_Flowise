// Quick Integration Test
console.log('🚀 Testing ChimariData Integration...\n');

async function testIntegration() {
  const baseUrl = 'http://localhost:5000';
  
  try {
    // Test 1: API Health
    console.log('1. Testing API Health...');
    const healthResponse = await fetch(`${baseUrl}/api/pricing`);
    const healthData = await healthResponse.json();
    console.log(healthResponse.ok ? '✅ API Health: OK' : '❌ API Health: Failed');
    
    // Test 2: AI Status
    console.log('2. Testing AI Integration...');
    const aiResponse = await fetch(`${baseUrl}/api/ai-status`);
    const aiData = await aiResponse.json();
    console.log(`✅ AI Providers: ${aiData.available?.join(', ') || 'None'}`);
    
    // Test 3: Pricing System
    console.log('3. Testing Pricing System...');
    const pricingResponse = await fetch(`${baseUrl}/api/calculate-price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ features: ['transformation', 'analysis'] })
    });
    const pricingData = await pricingResponse.json();
    console.log(pricingResponse.ok ? `✅ Pricing: $${pricingData.total} (discount: $${pricingData.discount})` : '❌ Pricing: Failed');
    
    // Test 4: File Upload
    console.log('4. Testing File Upload...');
    const csvData = 'name,age,salary\nJohn,30,75000\nJane,25,65000';
    const formData = new FormData();
    formData.append('file', new Blob([csvData], { type: 'text/csv' }), 'test.csv');
    
    const uploadResponse = await fetch(`${baseUrl}/api/trial-upload`, {
      method: 'POST',
      body: formData
    });
    const uploadData = await uploadResponse.json();
    
    if (uploadResponse.ok && uploadData.success) {
      console.log('✅ File Upload: Success');
      console.log(`✅ Schema Detection: ${Object.keys(uploadData.trialResults?.schema || {}).length} columns`);
      console.log(`✅ Analysis: ${uploadData.trialResults?.descriptiveAnalysis ? 'Generated' : 'Failed'}`);
      console.log(`✅ Visualizations: ${uploadData.trialResults?.basicVisualizations?.length || 0} charts`);
    } else {
      console.log(`❌ File Upload: ${uploadData.error || 'Failed'}`);
    }
    
    console.log('\n🎉 Integration test complete!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testIntegration();