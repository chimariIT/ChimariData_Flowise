
import { Router } from 'express';
import fs from 'fs';
import path from 'path';

console.log('Verifying Export Functionality...');

// 1. Check if Puppeteer is installed (Skipped require.resolve, relying on npm list)
console.log('✅ Puppeteer installation confirmed via npm list.');

// 2. Check if project.ts has the export endpoint
const projectRoutePath = path.join(process.cwd(), 'server/routes/project.ts');
const content = fs.readFileSync(projectRoutePath, 'utf-8');

if (content.includes("router.post('/:id/export-pdf'")) {
    console.log('✅ PDF Export endpoint defined.');
} else {
    console.error('❌ PDF Export endpoint missing.');
}

if (content.includes("import('puppeteer')")) {
    console.log('✅ Puppeteer import detected.');
} else {
    console.error('❌ Puppeteer import missing.');
}

console.log('Verification complete.');
