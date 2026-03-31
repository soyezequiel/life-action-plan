const fs = require('fs');
const path = require('path');

const dirsToAudit = [
  'components/mockups',
  'components/flow',
  'components/settings',
  'components/plan-viewer',
  'components/midnight-mint',
];

const filesToAudit = [
  'components/Dashboard.tsx',
  'components/IntakePageContent.tsx'
];

function getFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let files = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files = files.concat(getFiles(fullPath));
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            files.push(fullPath);
        }
    }
    return files;
}

let allFiles = [];
for (const dir of dirsToAudit) {
    const fullDir = path.join(__dirname, dir);
    allFiles = allFiles.concat(getFiles(fullDir));
}
for (const file of filesToAudit) {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
        allFiles.push(fullPath);
    }
}

// Ensure unique files
allFiles = [...new Set(allFiles)];

const report = {};

for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const buttons = [...content.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(m => m[0]);
    const links = [...content.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)].map(m => m[0]);
    const inputs = [...content.matchAll(/<input[^>]*>/g)].map(m => m[0]);
    const textareas = [...content.matchAll(/<textarea[^>]*>/g)].map(m => m[0]);
    const selects = [...content.matchAll(/<select[^>]*>/g)].map(m => m[0]);
    const mockData = [...content.matchAll(/<MockData[^>]*>([\s\S]*?)<\/MockData>/g)].map(m => m[0]);
    
    // Check if it uses browserLapClient or fetch
    const usesLapClient = content.includes('browserLapClient');
    const usesFetch = content.includes('fetch(');
    const usesUsePlanV5 = content.includes('usePlanV5');

    report[file] = {
      usesLapClient, usesFetch, usesUsePlanV5,
      buttons, links, inputs, textareas, selects, mockData
    };
}

fs.writeFileSync('audit_raw.json', JSON.stringify(report, null, 2));
console.log('Done writing audit_raw.json');
