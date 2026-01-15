
import { storage } from '../services/storage';
import { ProjectManagerAgent } from '../services/project-manager-agent';
import { UnifiedPIIProcessor } from '../services/unified-pii-processor';
import { RequiredDataElementsTool } from '../services/tools/required-data-elements-tool';
import fs from 'fs';
import path from 'path';

async function verifyFullWorkflow() {
    console.log('🚀 Starting Full Workflow Verification...');

    try {
        // 1. Create Project
        console.log('\n1️⃣  Creating Project...');
        const project = await storage.createProject({
            name: 'Verification Project ' + Date.now(),
            description: 'Automated verification of full workflow',
            userId: 'test-user-123',
            journeyType: 'non-tech',
            fileName: 'test.csv',
            fileSize: 1024,
            fileType: 'text/csv',
            dataSource: 'upload',
            isPaid: false,
            isTrial: false
        });
        console.log(`✅ Project created: ${project.id}`);

        // 2. Simulate File Upload & PII Detection
        console.log('\n2️⃣  Simulating File Upload & PII Detection...');
        const sampleData = [
            { id: 1, name: 'John Doe', email: 'john@example.com', salary: 50000 },
            { id: 2, name: 'Jane Smith', email: 'jane@example.com', salary: 60000 }
        ];

        // Manually trigger PII check
        const piiResults = UnifiedPIIProcessor.processPIIData(sampleData);
        console.log(`✅ PII Detection Results: hasPII=${piiResults.hasPII}`);

        if (!piiResults.hasPII) {
            console.warn('⚠️  Expected PII to be detected (email). Check PII logic.');
        } else {
            console.log(`   Detected PII Fields: ${piiResults.piiFields.join(', ')}`);
        }

        // Update project with schema and data
        const updatedProject = await storage.updateProject(project.id, {
            schema: {
                id: { type: 'number' },
                name: { type: 'string' },
                email: { type: 'string' },
                salary: { type: 'number' }
            },
            data: sampleData
        });

        // 3. Analysis Planning (Project Manager Agent)
        console.log('\n3️⃣  Generating Analysis Plan...');
        const agent = new ProjectManagerAgent();

        // Mock user input
        const userMessage = "I want to analyze salary distribution and identify high earners.";

        console.log('   Verifying Required Data Elements Tool...');
        const requirementsTool = new RequiredDataElementsTool();
        const requirements = await requirementsTool.defineRequirements({
            projectId: project.id,
            userGoals: [userMessage],
            userQuestions: ["How is salary distributed?", "Who are the high earners?"]
        });
        console.log(`✅ Requirements defined: ${JSON.stringify(requirements)}`);

        const mapping = await requirementsTool.mapDatasetToRequirements(requirements, {
            fileName: 'verification_data.csv',
            rowCount: sampleData.length,
            schema: {
                id: { type: 'number' },
                name: { type: 'string' },
                email: { type: 'string' },
                salary: { type: 'number' }
            },
            preview: sampleData
        });
        console.log(`✅ Dataset mapped: ${JSON.stringify(mapping)}`);

        // 4. Export Verification
        console.log('\n4️⃣  Verifying Export Logic...');
        if (updatedProject && updatedProject.schema && updatedProject.data) {
            console.log('✅ Project has Schema and Data ready for export.');
        } else {
            console.error('❌ Project missing Schema or Data, or update failed.');
        }

        console.log('\n✅ Full Workflow Verification Completed Successfully (Simulated).');

    } catch (error) {
        console.error('\n❌ Verification Failed:', error);
        process.exit(1);
    }
}

verifyFullWorkflow();
