#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { FileProcessor } from './server/file-processor.ts';
import { PIIAnalyzer } from './server/pii-analyzer.ts';

console.log('🔬 Comprehensive Edge Case Testing');
console.log('==================================\n');

const testResults = {
  edgeCases: {},
  security: {},
  performance: {},
  errors: []
};

// Generate test files for edge case testing
async function generateEdgeCaseFiles() {
  console.log('📁 Generating Edge Case Test Files');
  console.log('-----------------------------------');

  // Large CSV file (10,000 rows)
  const largeCSVData = ['id,name,email,score,department'];
  for (let i = 1; i <= 10000; i++) {
    largeCSVData.push(`${i},User${i},user${i}@example.com,${Math.random() * 100},Dept${i % 10}`);
  }
  
  await fs.writeFile('test_files/large_dataset.csv', largeCSVData.join('\n'));
  console.log('   ✅ Generated large_dataset.csv (10,000 rows)');

  // Malformed CSV file
  const malformedCSV = `id,name,email,score
1,"Unclosed quote,test@example.com,95
2,Missing fields,incomplete
3,"Extra""quotes""test",email@test.com,88,"extra field"
4,Normal User,normal@test.com,75
5,"Embedded
newline",test@example.com,92
6,,empty@test.com,85
7,"Comma,in,field",comma@test.com,90`;

  await fs.writeFile('test_files/malformed.csv', malformedCSV);
  console.log('   ✅ Generated malformed.csv (various parsing challenges)');

  // Very wide dataset (many columns)
  const wideHeaders = Array.from({length: 100}, (_, i) => `col${i}`).join(',');
  const wideRow = Array.from({length: 100}, (_, i) => `value${i}`).join(',');
  const wideCSV = [wideHeaders, wideRow, wideRow].join('\n');
  
  await fs.writeFile('test_files/wide_dataset.csv', wideCSV);
  console.log('   ✅ Generated wide_dataset.csv (100 columns)');

  // Empty and minimal files
  await fs.writeFile('test_files/empty.csv', '');
  await fs.writeFile('test_files/header_only.csv', 'id,name,email');
  await fs.writeFile('test_files/one_row.csv', 'id,name\n1,test');
  console.log('   ✅ Generated minimal test files (empty, header-only, one-row)');

  // Special characters and encoding
  const unicodeCSV = `id,name,description,unicode_text
1,José García,"Café résumé manager",Héllo Wörld
2,李小明,"北京大学学生",你好世界  
3,محمد علي,"مرحبا بالعالم","السلام عليكم"
4,🤖 AI Bot,"Emoji test 🚀","Special: @#$%^&*()_+"
5,Тест,"Кириллица тест","Здравствуй мир"`;
  
  await fs.writeFile('test_files/unicode_test.csv', unicodeCSV);
  console.log('   ✅ Generated unicode_test.csv (international characters)');

  // Suspicious content (potential security test)
  const suspiciousCSV = `id,name,script_content,sql_injection
1,Normal User,normal text,regular value
2,Script Test,"<script>alert('xss')</script>","'; DROP TABLE users; --"
3,Path Traversal,"../../../etc/passwd","../../sensitive.txt"
4,HTML Injection,"<img src=x onerror=alert(1)>","<iframe src=javascript:alert(1)>"
5,Unicode Bypass,"\\u003cscript\\u003e","\\x27 OR 1=1--"`;

  await fs.writeFile('test_files/suspicious_content.csv', suspiciousCSV);
  console.log('   ✅ Generated suspicious_content.csv (security test patterns)');

  // Invalid JSON
  const invalidJSON = `{
    "data": [
      {"id": 1, "name": "valid"},
      {"id": 2, "name": "missing_quote},
      {"id": 3, "extra_comma": true,},
      {"id": 4, duplicate_key: "value1", "duplicate_key": "value2"}
    ],
    "trailing_comma": true,
  }`;
  
  await fs.writeFile('test_files/invalid.json', invalidJSON);
  console.log('   ✅ Generated invalid.json (malformed JSON)');
}

async function testFileSize() {
  console.log('\n📏 Testing File Size Limits');
  console.log('-----------------------------');

  try {
    const largeFile = 'test_files/large_dataset.csv';
    const buffer = await fs.readFile(largeFile);
    const fileSizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
    
    console.log(`🔍 Testing large file: ${fileSizeMB} MB`);

    const startTime = Date.now();
    const result = await FileProcessor.processFile(buffer, 'large_dataset.csv', 'text/csv');
    const processTime = Date.now() - startTime;

    console.log(`   ✅ Processed in ${processTime}ms`);
    console.log(`   📊 Records: ${result.recordCount}`);
    console.log(`   🏗️  Schema fields: ${Object.keys(result.schema).length}`);
    console.log(`   ⚡ Performance: ${Math.round(result.recordCount / (processTime / 1000))} records/sec`);

    testResults.performance['large_file'] = {
      success: true,
      fileSizeMB: parseFloat(fileSizeMB),
      recordCount: result.recordCount,
      processTimeMs: processTime,
      recordsPerSecond: Math.round(result.recordCount / (processTime / 1000))
    };

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    testResults.errors.push({
      test: 'file_size',
      error: error.message
    });
  }
}

async function testMalformedData() {
  console.log('\n🔧 Testing Malformed Data Handling');
  console.log('-----------------------------------');

  const testFiles = [
    'test_files/malformed.csv',
    'test_files/empty.csv',
    'test_files/header_only.csv',
    'test_files/one_row.csv',
    'test_files/invalid.json'
  ];

  for (const filePath of testFiles) {
    try {
      console.log(`\n🔍 Testing: ${path.basename(filePath)}`);
      
      const buffer = await fs.readFile(filePath);
      const fileName = path.basename(filePath);
      const mimeType = fileName.endsWith('.json') ? 'application/json' : 'text/csv';

      console.log(`   File size: ${buffer.length} bytes`);

      if (buffer.length === 0) {
        console.log(`   ⚠️  Empty file detected`);
        testResults.edgeCases[fileName] = {
          success: false,
          error: 'Empty file',
          handled: true
        };
        continue;
      }

      const result = await FileProcessor.processFile(buffer, fileName, mimeType);
      
      console.log(`   ✅ Parsed successfully`);
      console.log(`   📊 Records: ${result.recordCount}`);
      console.log(`   🏗️  Schema fields: ${Object.keys(result.schema).length}`);

      testResults.edgeCases[fileName] = {
        success: true,
        recordCount: result.recordCount,
        schemaFields: Object.keys(result.schema).length
      };

    } catch (error) {
      console.log(`   ⚠️  Expected error: ${error.message}`);
      testResults.edgeCases[path.basename(filePath)] = {
        success: false,
        error: error.message,
        handled: true // Expected behavior
      };
    }
  }
}

async function testWideDataset() {
  console.log('\n📐 Testing Wide Dataset (Many Columns)');
  console.log('---------------------------------------');

  try {
    const wideFile = 'test_files/wide_dataset.csv';
    const buffer = await fs.readFile(wideFile);
    
    console.log(`🔍 Testing wide dataset: ${buffer.length} bytes`);

    const startTime = Date.now();
    const result = await FileProcessor.processFile(buffer, 'wide_dataset.csv', 'text/csv');
    const processTime = Date.now() - startTime;

    console.log(`   ✅ Processed in ${processTime}ms`);
    console.log(`   📊 Records: ${result.recordCount}`);
    console.log(`   🏗️  Schema fields: ${Object.keys(result.schema).length}`);
    console.log(`   📏 Expected 100 columns: ${Object.keys(result.schema).length === 100 ? '✅' : '❌'}`);

    testResults.edgeCases['wide_dataset'] = {
      success: true,
      recordCount: result.recordCount,
      columnCount: Object.keys(result.schema).length,
      expectedColumns: 100,
      processTimeMs: processTime
    };

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    testResults.errors.push({
      test: 'wide_dataset',
      error: error.message
    });
  }
}

async function testUnicodeHandling() {
  console.log('\n🌍 Testing Unicode and Special Characters');
  console.log('------------------------------------------');

  try {
    const unicodeFile = 'test_files/unicode_test.csv';
    const buffer = await fs.readFile(unicodeFile);
    
    console.log(`🔍 Testing unicode handling: ${buffer.length} bytes`);

    const result = await FileProcessor.processFile(buffer, 'unicode_test.csv', 'text/csv');
    
    console.log(`   ✅ Processed successfully`);
    console.log(`   📊 Records: ${result.recordCount}`);
    
    // Check if unicode characters are preserved
    const hasUnicode = result.data.some(row => 
      Object.values(row).some(val => 
        typeof val === 'string' && /[^\x00-\x7F]/.test(val)
      )
    );

    console.log(`   🌍 Unicode preserved: ${hasUnicode ? '✅' : '❌'}`);
    
    // Sample unicode content
    const sampleRow = result.data[0];
    console.log(`   📋 Sample data: ${JSON.stringify(sampleRow).substring(0, 100)}...`);

    testResults.edgeCases['unicode_test'] = {
      success: true,
      recordCount: result.recordCount,
      unicodePreserved: hasUnicode,
      sampleData: sampleRow
    };

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    testResults.errors.push({
      test: 'unicode_test',
      error: error.message
    });
  }
}

async function testSecurityValidation() {
  console.log('\n🔒 Testing Security Validation');
  console.log('-------------------------------');

  try {
    const suspiciousFile = 'test_files/suspicious_content.csv';
    const buffer = await fs.readFile(suspiciousFile);
    
    console.log(`🔍 Testing suspicious content: ${buffer.length} bytes`);

    const result = await FileProcessor.processFile(buffer, 'suspicious_content.csv', 'text/csv');
    
    console.log(`   ✅ File processed (content sanitization should be applied)`);
    console.log(`   📊 Records: ${result.recordCount}`);
    
    // Check if potentially dangerous content is present
    const hasScriptTags = result.data.some(row =>
      Object.values(row).some(val => 
        typeof val === 'string' && val.includes('<script>')
      )
    );

    const hasSQLInjection = result.data.some(row =>
      Object.values(row).some(val => 
        typeof val === 'string' && val.includes('DROP TABLE')
      )
    );

    console.log(`   🚨 Script tags detected: ${hasScriptTags ? '⚠️  Yes' : '✅ No'}`);
    console.log(`   🚨 SQL injection patterns: ${hasSQLInjection ? '⚠️  Yes' : '✅ No'}`);
    
    testResults.security['suspicious_content'] = {
      success: true,
      recordCount: result.recordCount,
      scriptTagsDetected: hasScriptTags,
      sqlInjectionDetected: hasSQLInjection,
      recommendation: hasScriptTags || hasSQLInjection ? 'Content sanitization recommended' : 'Content appears safe'
    };

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    testResults.errors.push({
      test: 'security_validation',
      error: error.message
    });
  }
}

async function testMemoryUsage() {
  console.log('\n💾 Testing Memory Usage');
  console.log('------------------------');

  const memBefore = process.memoryUsage();
  console.log(`   🔍 Memory before: ${Math.round(memBefore.heapUsed / 1024 / 1024)} MB`);

  try {
    // Process multiple files to test memory handling
    const testFiles = [
      'test_files/large_dataset.csv',
      'test_files/wide_dataset.csv',
      'test_files/unicode_test.csv'
    ];

    for (const filePath of testFiles) {
      const buffer = await fs.readFile(filePath);
      await FileProcessor.processFile(buffer, path.basename(filePath), 'text/csv');
    }

    const memAfter = process.memoryUsage();
    const memUsed = Math.round((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024);
    
    console.log(`   💾 Memory after: ${Math.round(memAfter.heapUsed / 1024 / 1024)} MB`);
    console.log(`   📈 Memory increase: ${memUsed} MB`);
    console.log(`   ${memUsed < 100 ? '✅ Acceptable' : '⚠️  High'} memory usage`);

    testResults.performance['memory_usage'] = {
      memoryBeforeMB: Math.round(memBefore.heapUsed / 1024 / 1024),
      memoryAfterMB: Math.round(memAfter.heapUsed / 1024 / 1024),
      memoryIncreaseMB: memUsed,
      acceptable: memUsed < 100
    };

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    testResults.errors.push({
      test: 'memory_usage',
      error: error.message
    });
  }
}

function printEdgeCaseSummary() {
  console.log('\n\n📊 EDGE CASE TEST SUMMARY');
  console.log('=========================');

  console.log('\n✅ Edge Case Results:');
  Object.entries(testResults.edgeCases).forEach(([testName, result]) => {
    const status = result.success ? '✅' : (result.handled ? '⚠️ ' : '❌');
    console.log(`   ${status} ${testName}: ${result.success ? 'Processed' : result.error}`);
  });

  console.log('\n🔒 Security Results:');
  Object.entries(testResults.security).forEach(([testName, result]) => {
    console.log(`   📋 ${testName}: ${result.recommendation}`);
  });

  console.log('\n⚡ Performance Results:');
  Object.entries(testResults.performance).forEach(([testName, result]) => {
    if (testName === 'large_file') {
      console.log(`   📏 ${testName}: ${result.recordsPerSecond} records/sec`);
    } else if (testName === 'memory_usage') {
      console.log(`   💾 ${testName}: ${result.memoryIncreaseMB} MB increase`);
    }
  });

  if (testResults.errors.length > 0) {
    console.log('\n❌ Errors:');
    testResults.errors.forEach(error => {
      console.log(`   ${error.test}: ${error.error}`);
    });
  }

  console.log(`\n📈 Overall Status: ${testResults.errors.length === 0 ? '✅ All edge case tests passed' : '⚠️  Some tests failed'}`);
}

// Run all edge case tests
async function runEdgeCaseTests() {
  try {
    await generateEdgeCaseFiles();
    await testFileSize();
    await testMalformedData();
    await testWideDataset();
    await testUnicodeHandling();
    await testSecurityValidation();
    await testMemoryUsage();
    printEdgeCaseSummary();

    // Save results to file
    await fs.writeFile('edge_case_test_results.json', JSON.stringify(testResults, null, 2));
    console.log('\n💾 Edge case test results saved to edge_case_test_results.json');

  } catch (error) {
    console.error('🚨 Edge case test suite failed:', error);
    process.exit(1);
  }
}

runEdgeCaseTests();