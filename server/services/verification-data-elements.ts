
import { RequiredDataElementsTool } from './tools/required-data-elements-tool';

async function run() {
    console.log('Running Required Data Elements Verification...');
    const tool = new RequiredDataElementsTool();

    const goals = ['Analyze customer churn and identify key drivers'];
    const questions = ['Why are customers leaving?', 'What is the churn rate?'];

    console.log('Defining requirements...');
    // Mocking the LLM call inside the tool might be hard if it uses actual LLM. 
    // However, the tool likely uses a mock or I can see if it fails.
    // If it uses real LLM, it might fail if not configured.
    // But let's try running it.

    try {
        let requirementsDoc = await tool.defineRequirements({
            projectId: 'test-project',
            userGoals: goals,
            userQuestions: questions
        });

        console.log('Requirements defined:', JSON.stringify(requirementsDoc, null, 2));

        const sampleData = {
            fileName: 'customers.csv',
            rowCount: 100,
            schema: {
                customer_id: { type: 'string' },
                churn_status: { type: 'boolean' },
                monthly_bill: { type: 'number' }
            },
            preview: [
                { customer_id: '1', churn_status: true, monthly_bill: 50 },
                { customer_id: '2', churn_status: false, monthly_bill: 60 }
            ]
        };

        console.log('Mapping dataset...');
        requirementsDoc = await tool.mapDatasetToRequirements(requirementsDoc, sampleData);

        console.log('Mapping result:', JSON.stringify(requirementsDoc, null, 2));

        if (requirementsDoc.gaps) {
            console.log('Gaps detected:', requirementsDoc.gaps);
        }

        console.log('SUCCESS: Tool executed without error.');
    } catch (error) {
        console.error('FAILURE:', error);
        process.exit(1);
    }
}

run();
