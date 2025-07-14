import fetch from 'node-fetch';

async function createTestProject() {
  console.log('Creating test project with marketing data...');
  
  try {
    // Create a test CSV file with the columns visible in the screenshots
    const csvData = `Campaign_Type,Duration,Conversion_Rate,Location,ROI,Target_Audience,Channel_Used,Acquisition_Cost,Language,Interaction_Level
Email,30,0.05,North,0.1,Young_Adults,Email,100,English,High
Social_Media,45,0.08,South,0.2,Professionals,Social,80,English,Medium
Direct_Mail,60,0.06,East,0.15,Seniors,Mail,90,English,Low
Online_Ads,15,0.09,West,0.25,Students,Online,70,Spanish,High
SEO,90,0.12,North,0.3,Families,Search,60,English,Medium
PPC,20,0.07,South,0.18,Professionals,Search,85,French,High
Influencer,35,0.11,East,0.22,Young_Adults,Social,75,English,High
Content,120,0.04,West,0.16,Seniors,Email,95,English,Low
Webinar,90,0.13,North,0.28,Professionals,Online,65,English,High
Newsletter,30,0.06,South,0.19,Families,Email,85,Spanish,Medium`;

    // Create form data
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    
    // Add the CSV data as a file
    form.append('file', Buffer.from(csvData), {
      filename: 'marketing_campaign_data.csv',
      contentType: 'text/csv'
    });
    
    // Add other required fields
    form.append('name', 'Marketing Campaign Analysis');
    form.append('description', 'Analysis of marketing campaign performance across different channels and demographics');
    form.append('piiHandled', 'false');
    
    // Make the request
    const response = await fetch('http://localhost:5000/api/projects/upload', {
      method: 'POST',
      body: form
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Test project created successfully!');
      console.log('Project ID:', result.project.id);
      console.log('Project Name:', result.project.name);
      console.log('Record Count:', result.project.recordCount);
      console.log('Schema:', JSON.stringify(result.project.schema, null, 2));
      console.log('\nYou can now access the project at:');
      console.log(`http://localhost:5000/descriptive-stats/${result.project.id}`);
    } else {
      console.error('❌ Failed to create test project:', result.error);
    }
    
  } catch (error) {
    console.error('❌ Error creating test project:', error.message);
  }
}

createTestProject();