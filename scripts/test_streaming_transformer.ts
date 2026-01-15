
import { StreamingTransformer, TransformationStep } from '../server/services/streaming-transformer';

async function testStreamingTransformer() {
    console.log('🚀 Testing StreamingTransformer...');

    const transformer = new StreamingTransformer();

    // 1. Simulate Multi-Format Data Stream (Object Stream)
    // This could come from CSV, JSON, Excel, or DB
    const mockDataStream = async function* () {
        yield { id: 1, name: 'Alice', role: 'admin', score: 85 };
        yield { id: 2, name: 'Bob', role: 'user', score: 92 };
        yield { id: 3, name: 'Charlie', role: 'user', score: 45 }; // Should be filtered out
        yield { id: 4, name: 'David', role: 'guest', score: 70 };
        yield { id: 5, name: 'Eve', role: 'admin', score: 95 };
    };

    // 2. Define Transformation Steps
    const steps: TransformationStep[] = [
        {
            id: 'step1',
            name: 'Filter Low Scores',
            type: 'filter',
            config: { field: 'score', operator: 'gt', value: 50 }
        },
        {
            id: 'step2',
            name: 'Uppercase Name',
            type: 'map',
            config: { field: 'name', operation: 'uppercase' }
        },
        {
            id: 'step3',
            name: 'Add Status',
            type: 'custom',
            config: {
                code: "record.status = record.score >= 90 ? 'High' : 'Normal';"
            }
        }
    ];

    console.log('\n📋 Input Data: Object Stream (Simulating JSON/Excel/CSV)');
    console.log('📋 Steps: Filter > 50 -> Uppercase Name -> Add Status');

    // 3. Process Stream
    const result = await transformer.processStream(mockDataStream(), steps);

    console.log('\n🔄 Processing Stream...');
    const output = [];
    for await (const row of result.outputStream) {
        output.push(row);
        console.log('   Processed Row:', row);
    }

    // 4. Verify Results
    console.log('\n✅ Verification Results:');

    // Check count
    if (output.length === 4) {
        console.log('   ✅ Count Correct (4 records, 1 filtered)');
    } else {
        console.log(`   ❌ Count Incorrect: Expected 4, got ${output.length}`);
    }

    // Check transformations
    const bob = output.find(r => r.id === 2);
    if (bob && bob.name === 'BOB' && bob.status === 'High') {
        console.log('   ✅ Transformations Correct (Uppercase + Custom Logic)');
    } else {
        console.log('   ❌ Transformations Failed');
    }

    // 5. Test Security (Malicious Code)
    console.log('\n🔒 Testing Security...');
    const maliciousSteps: TransformationStep[] = [
        {
            id: 'bad1',
            name: 'Malicious',
            type: 'custom',
            config: { code: 'process.exit(1)' }
        }
    ];

    try {
        const stream = async function* () { yield { id: 1 }; };
        const maliciousResult = await transformer.processStream(stream(), maliciousSteps);
        // Trigger the generator
        for await (const _ of maliciousResult.outputStream) { }
        console.log('   ❌ Security Check Failed: Malicious code executed');
    } catch (error: any) {
        if (error.message.includes('Security violation')) {
            console.log(`   ✅ Security Check Passed: ${error.message}`);
        } else {
            console.log(`   ⚠️  Unexpected Error: ${error.message}`);
        }
    }

    console.log('\n✨ Test Complete');
}

testStreamingTransformer().catch(console.error);
