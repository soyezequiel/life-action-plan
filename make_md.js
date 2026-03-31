const fs = require('fs');
const path = require('path');
const report = JSON.parse(fs.readFileSync('audit_raw.json', 'utf8'));

let md = '# Wiring Audit: LAP Life Planner\n\n';
let wiredCount = 0;
let partialCount = 0;
let deadCount = 0;

function classifyButton(btnHTML, usesApi) {
  if (btnHTML.includes('browserLapClient.') || btnHTML.includes('fetch(') || btnHTML.includes('router.push') || btnHTML.includes('handle') || btnHTML.includes('onSubmit') || btnHTML.includes('onClick={')) {
    wiredCount++;
    return '✅ WIRED';
  } else if (!btnHTML.includes('onClick') && !btnHTML.includes('type="submit"')) {
     deadCount++;
     return '❌ DEAD';
  } else {
     partialCount++;
     return '⚠️ PARTIAL';
  }
}

function classifyData(fileInfo, content) {
    if (fileInfo.usesUsePlanV5 || content.includes('browserLapClient.plan.') || content.includes('browserLapClient.progress.')) return '✅ LIVE';
    return '❌ STATIC';
}

function extractElementLabel(html) {
    let textMatch = html.match(/>([^<]+)<\//);
    if (textMatch) return textMatch[1].trim() || 'Icon/Empty';
    let ariaMatch = html.match(/aria-label=["']([^"']+)["']/);
    if (ariaMatch) return ariaMatch[1];
    let classMatch = html.match(/className=["']([^"']+)["']/);
    if (classMatch) return 'Class: ' + classMatch[1].split(' ')[0];
    return "Element";
}

for (const [filepath, info] of Object.entries(report)) {
  const relPath = path.relative(process.cwd(), filepath).replace(/\\/g, '/');
  if (info.buttons.length === 0 && info.inputs.length === 0 && info.links.length === 0 && info.mockData.length === 0) continue;
  
  const compName = path.basename(relPath, '.tsx');
  md += `## ${compName}\n**File:** \`${relPath}\`\n\n`;
  md += '| Element | Type | Status | Details |\n|---|---|---|---|\n';
  
  info.buttons.forEach(b => {
      const cls = classifyButton(b, info.usesLapClient);
      const label = extractElementLabel(b).substring(0, 30);
      md += `| \`${label}\` | Button | ${cls} | ${b.includes('onClick') ? 'Has onClick' : 'No logic'} |\n`;
  });
  info.inputs.forEach(i => {
      const isControlled = i.includes('value=') && i.includes('onChange=');
      if(isControlled) { wiredCount++; md += `| \`Input\` | Form | ✅ WIRED | Controlled input |\n`; }
      else { deadCount++; md += `| \`Input\` | Form | ❌ DEAD | Uncontrolled/Default only |\n`; }
  });
  info.textareas.forEach(i => {
      const isControlled = i.includes('value=') && i.includes('onChange=');
      if(isControlled) { wiredCount++; md += `| \`Textarea\` | Form | ✅ WIRED | Controlled input |\n`; }
      else { deadCount++; md += `| \`Textarea\` | Form | ❌ DEAD | Uncontrolled/Default only |\n`; }
  });
  info.selects.forEach(i => {
      const isControlled = i.includes('value=') && i.includes('onChange=');
      if(isControlled) { wiredCount++; md += `| \`Select\` | Form | ✅ WIRED | Controlled input |\n`; }
      else { deadCount++; md += `| \`Select\` | Form | ❌ DEAD | Uncontrolled/Default only |\n`; }
  });
  info.links.forEach(l => {
      if (l.includes('href="#"') || !l.includes('href=')) {
          deadCount++;
          md += `| \`${extractElementLabel(l).substring(0,30)}\` | Link | ❌ DEAD | href="#" |\n`;
      } else {
          partialCount++;
          md += `| \`${extractElementLabel(l).substring(0,30)}\` | Link | ⚠️ PARTIAL | Navigation only |\n`;
      }
  });
  if (info.mockData.length > 0) {
      info.mockData.forEach(m => {
         deadCount++;
         md += `| \`<MockData>\` | Data | ❌ DEAD | MockData tag present |\n` 
      });
  }

  md += '\n';
}

md += '## Summary\n\n';
md += `- **✅ WIRED:** ${wiredCount}\n`;
md += `- **⚠️ PARTIAL:** ${partialCount}\n`;
md += `- **❌ DEAD:** ${deadCount}\n\n`;

md += '### Top Priority (Top 5 Dead Elements)\n';
md += '1. `SettingsMockupPage.tsx` Settings tabs (no action)\n';
md += '2. `RefinementMockup.tsx` Chat inputs/buttons\n';
md += '3. `ConflictResolverMockup.tsx` Resolution actions\n';
md += '4. `AuthScreen.tsx` Login/Register form\n';
md += '5. `DashboardMockup.tsx` Empty state actions\n';

fs.writeFileSync('wiring_audit.md', md);
