
import { ProjectManagerAgent } from './project-manager-agent';

async function verifyProjectManagerAgent() {
    try {
        const agent = new ProjectManagerAgent();
        console.log('ProjectManagerAgent instantiated successfully.');
    } catch (error) {
        console.error('Failed to instantiate ProjectManagerAgent:', error);
        process.exit(1);
    }
}

verifyProjectManagerAgent();
