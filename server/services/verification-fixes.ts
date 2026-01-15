
import projectRouter from '../routes/project';
import fs from 'fs';
import path from 'path';

console.log('Verifying fixes...');

// Verify Project Router export
try {
    if (projectRouter && typeof projectRouter === 'function') {
        console.log('✅ Project Router is valid.');
    } else {
        console.error('❌ Project Router is invalid.');
    }
} catch (e) {
    console.error('❌ Error importing Project Router:', e);
}

// Verify API Client file content (Regex check)
const apiPath = path.join(process.cwd(), 'client/src/lib/api.ts');
const apiContent = fs.readFileSync(apiPath, 'utf-8');

if (apiContent.includes('updateProjectSchema(projectId: string, schema: Record<string, any>)')) {
    console.log('✅ APIClient.updateProjectSchema is present.');
} else {
    console.error('❌ APIClient.updateProjectSchema is missing.');
}

console.log('Verification complete.');
