
import { UnifiedPIIProcessor } from './unified-pii-processor';

const sampleData = [
    { id: 1, name: 'John Doe', email: 'john.doe@example.com', phone: '123-456-7890', balance: 100 },
    { id: 2, name: 'Jane Smith', email: 'jane.smith@test.co.uk', phone: '(555) 123-4567', balance: 200 },
    { id: 3, name: 'Bob Jones', email: 'invalid-email', phone: '999', balance: 300 }
];

const schema = {
    id: { type: 'integer' },
    name: { type: 'string' },
    email: { type: 'string' },
    phone: { type: 'string' },
    balance: { type: 'number' }
};

console.log('Running PII Verification...');
const result = UnifiedPIIProcessor.processPIIData(sampleData, schema);

console.log('Has PII:', result.hasPII);
console.log('PII Fields:', result.piiFields);
console.log('PII Types:', result.piiTypes);
console.log('Confidence:', result.confidence);

if (result.hasPII && result.piiFields.includes('email') && result.piiFields.includes('phone')) {
    console.log('SUCCESS: PII detected correctly.');
} else {
    console.error('FAILURE: PII detection failed.');
    process.exit(1);
}
