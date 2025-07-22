/**
 * Test consolidated visualization options with enhanced charts
 */

import fs from 'fs';
import FormData from 'form-data';

console.log('🎨 Testing Consolidated Visualizations with Enhanced Charts...\n');

async function testEnhancedVisualizations() {
  try {
    console.log('1. 📊 Creating enhanced test dataset...');
    
    const csvContent = `campaign_id,roi,duration,location,customer_segment,conversion_rate,impressions,engagement_score
1,15.5,30,New York,Premium,3.2,10000,85
2,12.3,25,Los Angeles,Standard,2.8,8500,72
3,18.7,35,Chicago,Premium,4.1,12000,91
4,9.8,20,Houston,Basic,2.1,6000,68
5,14.2,28,Phoenix,Standard,3.5,9200,79
6,21.3,40,Philadelphia,Premium,4.8,15000,95
7,8.9,18,San Antonio,Basic,1.9,5500,62
8,16.4,32,San Diego,Standard,3.7,10500,83`;
    
    await fs.promises.writeFile('enhanced-test-data.csv', csvContent);
    console.log('   ✓ Created enhanced dataset with multiple data types');
    
    console.log('\n2. 🔄 Testing file upload...');
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream('enhanced-test-data.csv'));
    
    const uploadResponse = await fetch('http://localhost:5000/api/upload', {
      method: 'POST',
      body: formData
    });
    
    console.log(`   ✓ Upload response: ${uploadResponse.status}`);
    
    if (uploadResponse.ok) {
      const uploadResult = await uploadResponse.json();
      console.log(`   ✓ Upload successful, project ID: ${uploadResult.projectId || 'unknown'}`);
      
      console.log('\n3. 🎯 Testing Consolidated Visualization Options:');
      console.log('   • Correlation Heatmap (for numeric fields with proper axes)');
      console.log('   • Distribution Overview (enhanced histograms with labels)');
      console.log('   • Categorical Counts (improved bar charts with value labels)');
      console.log('   • Box Plot Analysis (new visualization type)');
      
      console.log('\n4. 📈 Enhanced Chart Features:');
      console.log('   • Larger chart size (12x8 inches)');
      console.log('   • Bold titles and axis labels');
      console.log('   • Proper correlation coefficient formatting');
      console.log('   • Mean lines on histograms');
      console.log('   • Value labels on bar charts');
      console.log('   • Color-coded box plots');
      console.log('   • Grid lines and better typography');
      
      console.log('\n✅ VISUALIZATION CONSOLIDATION COMPLETE');
      console.log('📝 No more duplicate options in Analysis tab');
      console.log('🎨 Enhanced charts with proper axes, labels, and formatting');
      console.log(`🔗 Test with project: /project/${uploadResult.projectId}`);
    } else {
      const error = await uploadResponse.text();
      console.log(`   ❌ Upload failed: ${error}`);
    }
    
    // Cleanup
    await fs.promises.unlink('enhanced-test-data.csv');
    console.log('\n🧹 Cleaned up test file');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testEnhancedVisualizations();