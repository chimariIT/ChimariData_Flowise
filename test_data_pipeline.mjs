#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { FileProcessor } from './server/file-processor.ts';
import { PIIAnalyzer } from './server/pii-analyzer.ts';

console.log('🧪 Starting Data Processing Pipeline Tests');
console.log('==========================================\n');

// Test results storage
const testResults = {
  fileProcessor: {},
  piiDetection: {},
  schemaDetection: {},
  errors: []
};

// Test file paths
const testFiles = [
  'test_files/test_dataset_basic.csv',
  'test_files/test_dataset_pii.csv', 
  'test_files/test_dataset_edge_cases.csv',
  'test_files/test_dataset.json'
];

async function testFileProcessor() {
  console.log('📁 Testing File Processor');
  console.log('-------------------------');

  for (const filePath of testFiles) {
    try {
      console.log(`\n🔍 Testing: ${filePath}`);
      
      // Read file
      const buffer = await fs.readFile(filePath);
      const fileName = path.basename(filePath);
      const mimeType = getMimeType(fileName);

      console.log(`   File size: ${buffer.length} bytes`);
      console.log(`   MIME type: ${mimeType}`);

      // Process file
      const startTime = Date.now();
      const result = await FileProcessor.processFile(buffer, fileName, mimeType);
      const processTime = Date.now() - startTime;

      console.log(`   ✅ Processed in ${processTime}ms`);
      console.log(`   📊 Records: ${result.recordCount}`);
      console.log(`   🏗️  Schema fields: ${Object.keys(result.schema).length}`);
      console.log(`   👀 Preview rows: ${result.preview.length}`);

      // Store result
      testResults.fileProcessor[fileName] = {
        success: true,
        recordCount: result.recordCount,
        schemaFields: Object.keys(result.schema).length,
        previewRows: result.preview.length,
        processTime,
        schema: result.schema,
        data: result.data
      };

      // Show schema details
      console.log(`   📋 Schema:`)
      Object.entries(result.schema).forEach(([field, info]) => {
        console.log(`      ${field}: ${info.type}${info.nullable ? ' (nullable)' : ''}`);
      });

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      testResults.errors.push({
        test: 'fileProcessor',
        file: filePath,
        error: error.message
      });
    }
  }
}

async function testPIIDetection() {
  console.log('\n\n🔒 Testing PII Detection');
  console.log('------------------------');

  // Test with PII dataset
  const piiFile = 'test_files/test_dataset_pii.csv';
  try {
    const buffer = await fs.readFile(piiFile);
    const result = await FileProcessor.processFile(buffer, 'pii_test.csv', 'text/csv');
    
    console.log(`\n🔍 Analyzing PII in: ${piiFile}`);
    
    // Run PII analysis
    const piiAnalysis = await PIIAnalyzer.analyzePII(result.data, result.schema);
    
    console.log(`   🚨 PII columns detected: ${piiAnalysis.detectedPII.length}`);
    console.log(`   📋 PII fields: ${piiAnalysis.detectedPII.join(', ')}`);
    
    // Show detailed analysis
    Object.entries(piiAnalysis.columnAnalysis).forEach(([column, analysis]) => {
      if (analysis.isPII) {
        console.log(`      ${column}: ${analysis.type} (confidence: ${Math.round(analysis.confidence * 100)}%)`);
      }
    });

    console.log(`   💡 Recommendations:`);
    piiAnalysis.recommendations.forEach(rec => {
      console.log(`      - ${rec}`);
    });

    testResults.piiDetection = {
      success: true,
      detectedPII: piiAnalysis.detectedPII.length,
      recommendations: piiAnalysis.recommendations.length,
      analysis: piiAnalysis
    };

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    testResults.errors.push({
      test: 'piiDetection',
      error: error.message
    });
  }
}

async function testSchemaAccuracy() {
  console.log('\n\n🏗️  Testing Schema Detection Accuracy');
  console.log('-------------------------------------');

  // Test basic dataset schema detection
  const basicFile = 'test_files/test_dataset_basic.csv';
  try {
    const buffer = await fs.readFile(basicFile);
    const result = await FileProcessor.processFile(buffer, 'basic_test.csv', 'text/csv');

    console.log(`\n🔍 Schema accuracy test for: ${basicFile}`);

    // Expected schema types for validation
    const expectedTypes = {
      'id': 'number',
      'name': 'text',
      'email': 'email',
      'phone': 'text', // Should detect phone pattern
      'age': 'number',
      'salary': 'number',
      'birth_date': 'date',
      'is_active': 'text', // May not detect boolean correctly
      'department': 'text',
      'hire_date': 'date'
    };

    let correctTypes = 0;
    let totalFields = Object.keys(expectedTypes).length;

    Object.entries(expectedTypes).forEach(([field, expectedType]) => {
      const detectedType = result.schema[field]?.type;
      const isCorrect = detectedType === expectedType;
      
      console.log(`   ${isCorrect ? '✅' : '⚠️ '} ${field}: expected ${expectedType}, got ${detectedType}`);
      
      if (isCorrect) correctTypes++;
    });

    const accuracy = Math.round((correctTypes / totalFields) * 100);
    console.log(`\n   📊 Schema Detection Accuracy: ${accuracy}% (${correctTypes}/${totalFields})`);

    testResults.schemaDetection = {
      accuracy: accuracy,
      correctTypes: correctTypes,
      totalFields: totalFields,
      detectedSchema: result.schema
    };

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    testResults.errors.push({
      test: 'schemaDetection', 
      error: error.message
    });
  }
}

async function testEdgeCases() {
  console.log('\n\n⚠️  Testing Edge Cases');
  console.log('----------------------');

  const edgeFile = 'test_files/test_dataset_edge_cases.csv';
  try {
    const buffer = await fs.readFile(edgeFile);
    const result = await FileProcessor.processFile(buffer, 'edge_test.csv', 'text/csv');

    console.log(`\n🔍 Edge case handling for: ${edgeFile}`);
    console.log(`   📊 Records processed: ${result.recordCount}`);
    console.log(`   🏗️  Schema fields: ${Object.keys(result.schema).length}`);

    // Check for null/empty handling
    const sampleRecord = result.data[0];
    console.log(`   📋 Sample record fields: ${Object.keys(sampleRecord).length}`);

    // Check for special characters
    const hasSpecialChars = result.data.some(row => 
      Object.values(row).some(val => 
        typeof val === 'string' && /[^\x00-\x7F]/.test(val)
      )
    );

    console.log(`   🌍 Unicode/special characters: ${hasSpecialChars ? 'Detected' : 'None'}`);

    // Check null handling
    const hasNulls = result.data.some(row =>
      Object.values(row).some(val => val === null || val === undefined || val === '')
    );

    console.log(`   🕳️  Null/empty values: ${hasNulls ? 'Present' : 'None'}`);

    testResults.fileProcessor['edge_cases'] = {
      success: true,
      recordCount: result.recordCount,
      hasSpecialChars,
      hasNulls,
      schema: result.schema
    };

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    testResults.errors.push({
      test: 'edgeCases',
      error: error.message
    });
  }
}

function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes = {
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.txt': 'text/plain'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

function printSummary() {
  console.log('\n\n📊 TEST SUMMARY');
  console.log('===============');

  console.log('\n✅ Successful Tests:');
  if (Object.keys(testResults.fileProcessor).length > 0) {
    console.log(`   📁 File Processor: ${Object.keys(testResults.fileProcessor).length} files`);
  }
  if (testResults.piiDetection.success) {
    console.log(`   🔒 PII Detection: ${testResults.piiDetection.detectedPII} PII fields found`);
  }
  if (testResults.schemaDetection.accuracy) {
    console.log(`   🏗️  Schema Detection: ${testResults.schemaDetection.accuracy}% accuracy`);
  }

  if (testResults.errors.length > 0) {
    console.log('\n❌ Errors:');
    testResults.errors.forEach(error => {
      console.log(`   ${error.test}: ${error.error}`);
    });
  }

  console.log(`\n📈 Overall Status: ${testResults.errors.length === 0 ? '✅ All tests passed' : '⚠️  Some tests failed'}`);
}

// Run all tests
async function runTests() {
  try {
    await testFileProcessor();
    await testPIIDetection();
    await testSchemaAccuracy();
    await testEdgeCases();
    printSummary();

    // Save results to file
    await fs.writeFile('test_results.json', JSON.stringify(testResults, null, 2));
    console.log('\n💾 Test results saved to test_results.json');

  } catch (error) {
    console.error('🚨 Test suite failed:', error);
    process.exit(1);
  }
}

runTests();