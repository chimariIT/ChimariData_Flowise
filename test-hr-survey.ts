/**
 * Test Script for HR Engagement Survey Dataset
 * Tests the complete workflow with real survey data
 */

import { surveyDataHandlers } from './server/services/survey-data-handlers';
import { resilientWorkflowManager } from './server/services/resilient-workflow-manager';
import * as path from 'path';

async function testHRSurvey() {
  console.log('🚀 Starting HR Engagement Survey Test\n');
  console.log('=' .repeat(80));

  const baseDir = 'C:\\Users\\scmak\\Documents\\Work\\Projects\\Chimari\\Consulting_BYOD\\sampledata\\HR';

  // Test 1: Process multi-sheet Excel files
  console.log('\n📊 TEST 1: Processing Excel Files with Multiple Sheets\n');
  console.log('-'.repeat(80));

  const rosterPath = path.join(baseDir, 'EmployeeRoster.xlsx');
  const surveyPath = path.join(baseDir, 'HREngagementDataset.xlsx');

  let rosterSheets, surveySheets;

  try {
    console.log(`Processing: ${rosterPath}`);
    rosterSheets = await surveyDataHandlers.processExcelWithSheets(rosterPath);
    console.log(`\n✅ Successfully processed ${rosterSheets.length} sheet(s) from EmployeeRoster.xlsx`);

    for (const sheet of rosterSheets) {
      console.log(`\n  Sheet: ${sheet.name}`);
      console.log(`    Rows: ${sheet.rowCount}`);
      console.log(`    Columns: ${Object.keys(sheet.schema).length}`);
      console.log(`    Dataset Type: ${sheet.intelligence?.datasetType}`);

      // Show column intelligence
      console.log(`    Detected Columns:`);
      for (const col of sheet.intelligence?.columns.slice(0, 5) || []) {
        console.log(`      - ${col.name}: ${col.detectedType} (confidence: ${col.confidence})`);
      }
      if ((sheet.intelligence?.columns.length || 0) > 5) {
        console.log(`      ... and ${sheet.intelligence!.columns.length - 5} more`);
      }
    }
  } catch (error: any) {
    console.error(`❌ Failed to process roster file:`, error.message);
    return;
  }

  try {
    console.log(`\n\nProcessing: ${surveyPath}`);
    surveySheets = await surveyDataHandlers.processExcelWithSheets(surveyPath);
    console.log(`\n✅ Successfully processed ${surveySheets.length} sheet(s) from HREngagementDataset.xlsx`);

    for (const sheet of surveySheets) {
      console.log(`\n  Sheet: ${sheet.name}`);
      console.log(`    Rows: ${sheet.rowCount}`);
      console.log(`    Columns: ${Object.keys(sheet.schema).length}`);
      console.log(`    Dataset Type: ${sheet.intelligence?.datasetType}`);

      // Show column intelligence
      console.log(`    Detected Columns:`);
      for (const col of sheet.intelligence?.columns.slice(0, 5) || []) {
        console.log(`      - ${col.name}: ${col.detectedType} (confidence: ${col.confidence})`);
      }
      if ((sheet.intelligence?.columns.length || 0) > 5) {
        console.log(`      ... and ${sheet.intelligence!.columns.length - 5} more`);
      }

      // Show Likert scales found
      const likertCols = sheet.intelligence?.columns.filter(c => c.detectedType === 'likert_scale') || [];
      if (likertCols.length > 0) {
        console.log(`    Likert Scale Questions: ${likertCols.length}`);
        for (const col of likertCols.slice(0, 3)) {
          console.log(`      - ${col.name}${col.scaleInfo ? ` (${col.scaleInfo.min}-${col.scaleInfo.max})` : ''}`);
        }
      }

      // Show clarifications needed
      if (sheet.intelligence && sheet.intelligence.clarifications.length > 0) {
        console.log(`    Clarifications Needed: ${sheet.intelligence.clarifications.length}`);
        for (const clarif of sheet.intelligence.clarifications.slice(0, 2)) {
          console.log(`      - ${clarif.question}`);
        }
      }
    }
  } catch (error: any) {
    console.error(`❌ Failed to process survey file:`, error.message);
    return;
  }

  // Test 2: Detect Survey Structure
  console.log('\n\n🔍 TEST 2: Detecting Survey Structure\n');
  console.log('-'.repeat(80));

  const allSheets = [...rosterSheets, ...surveySheets];
  const structure = await surveyDataHandlers.detectSurveyStructure(allSheets);

  console.log(`Roster Sheet: ${structure.rosterSheet?.name || 'Not detected'}`);
  console.log(`Responses Sheet: ${structure.responsesSheet?.name || 'Not detected'}`);
  console.log(`Other Sheets: ${structure.otherSheets.map(s => s.name).join(', ') || 'None'}`);

  if (structure.suggestedJoin) {
    console.log(`\n✅ Suggested Join:`);
    console.log(`  Roster Key: ${structure.suggestedJoin.rosterKey}`);
    console.log(`  Responses Key: ${structure.suggestedJoin.responsesKey}`);
  } else {
    console.log(`\n⚠️  No automatic join detected`);
  }

  // Test 3: Join Roster with Responses
  if (structure.rosterSheet && structure.responsesSheet) {
    console.log('\n\n🔗 TEST 3: Joining Roster with Survey Responses\n');
    console.log('-'.repeat(80));

    try {
      const joined = await surveyDataHandlers.joinRosterWithResponses(
        structure.rosterSheet,
        structure.responsesSheet
      );

      console.log(`✅ Join Successful!`);
      console.log(`  Joined On: ${joined.joinedOn}`);
      console.log(`  Total Rows: ${joined.rowCount}`);
      console.log(`  Roster Fields: ${joined.rosterFields.length}`);
      console.log(`  Response Fields: ${joined.responseFields.length}`);
      console.log(`\n  Sample Roster Fields: ${joined.rosterFields.slice(0, 5).join(', ')}`);
      console.log(`  Sample Response Fields: ${joined.responseFields.slice(0, 5).join(', ')}`);

      // Test 4: Aggregate Likert Scales by Group
      console.log('\n\n📊 TEST 4: Aggregating Likert Scales by Leader/Team\n');
      console.log('-'.repeat(80));

      // Find a demographic column (leader/team) and Likert column
      const demographicCol = structure.responsesSheet.intelligence?.columns.find(
        c => c.detectedType === 'demographic'
      );
      const likertCol = structure.responsesSheet.intelligence?.columns.find(
        c => c.detectedType === 'likert_scale'
      );

      if (demographicCol && likertCol) {
        const aggregation = surveyDataHandlers.aggregateLikertByGroup(
          joined.data,
          likertCol.name,
          demographicCol.name
        );

        console.log(`Aggregating: ${aggregation.column} by ${aggregation.groupBy}`);
        console.log(`\nResults:`);
        for (const agg of aggregation.aggregations.slice(0, 5)) {
          console.log(`\n  Group: ${agg.group}`);
          console.log(`    Mean: ${agg.mean}`);
          console.log(`    Median: ${agg.median}`);
          console.log(`    Mode: ${agg.mode}`);
          console.log(`    Count: ${agg.count}`);
          console.log(`    Distribution: ${JSON.stringify(agg.distribution)}`);
        }
        if (aggregation.aggregations.length > 5) {
          console.log(`  ... and ${aggregation.aggregations.length - 5} more groups`);
        }
      } else {
        console.log(`⚠️  Could not find demographic or Likert columns for aggregation`);
      }

      // Test 5: Analyze Qualitative Text (if any)
      const qualitativeCol = structure.responsesSheet.intelligence?.columns.find(
        c => c.detectedType === 'qualitative'
      );

      if (qualitativeCol) {
        console.log('\n\n📝 TEST 5: Analyzing Qualitative Text Responses\n');
        console.log('-'.repeat(80));

        const textAnalysis = surveyDataHandlers.analyzeQualitativeText(
          joined.data,
          qualitativeCol.name
        );

        console.log(`Column: ${textAnalysis.column}`);
        console.log(`Total Responses: ${textAnalysis.totalResponses}`);
        console.log(`Response Length:`);
        console.log(`  Min: ${textAnalysis.responseLength.min} chars`);
        console.log(`  Max: ${textAnalysis.responseLength.max} chars`);
        console.log(`  Avg: ${textAnalysis.responseLength.avg} chars`);

        console.log(`\nThemes Identified: ${textAnalysis.themes.length}`);
        for (const theme of textAnalysis.themes) {
          console.log(`\n  ${theme.theme}:`);
          console.log(`    Frequency: ${theme.frequency}`);
          console.log(`    Keywords: ${theme.keywords.join(', ')}`);
        }
      }

      // Test 6: Multi-Year Trend Analysis
      const yearCol = structure.responsesSheet.intelligence?.columns.find(
        c => c.detectedType === 'temporal' || c.name.toLowerCase().includes('year')
      );

      if (yearCol && likertCol) {
        console.log('\n\n📈 TEST 6: Multi-Year Trend Analysis\n');
        console.log('-'.repeat(80));

        const trends = surveyDataHandlers.analyzeTrends(
          joined.data,
          yearCol.name,
          likertCol.name,
          demographicCol?.name
        );

        console.log(`Analyzing: ${likertCol.name} over ${yearCol.name}${demographicCol ? ` by ${demographicCol.name}` : ''}`);
        console.log(`\nTrend Data Points: ${trends.length}`);

        for (const trend of trends.slice(0, 10)) {
          console.log(`\n  Year: ${trend.year}${trend.group ? ` | Group: ${trend.group}` : ''}`);
          console.log(`    Mean: ${trend.mean}`);
          console.log(`    Count: ${trend.count}`);
          if (trend.change !== undefined) {
            const changeSymbol = trend.change > 0 ? '↑' : trend.change < 0 ? '↓' : '→';
            console.log(`    Change: ${changeSymbol} ${trend.change > 0 ? '+' : ''}${trend.change}`);
          }
        }

        if (trends.length > 10) {
          console.log(`  ... and ${trends.length - 10} more data points`);
        }
      }

    } catch (error: any) {
      console.error(`❌ Join failed:`, error.message);
    }
  } else {
    console.log('\n⚠️  Skipping join test - missing roster or responses sheet');
  }

  console.log('\n\n' + '='.repeat(80));
  console.log('✅ HR Engagement Survey Test Complete!\n');
}

// Run the test
testHRSurvey()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
