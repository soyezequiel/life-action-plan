import fs from 'fs/promises';
import path from 'path';
import fsSync from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEBUG_DIR = path.join(PROJECT_ROOT, '.lap-debug');

const manifestPath = path.join(PROJECT_ROOT, 'docs', 'qa', 'v6-canaries.json');
const manifestData = JSON.parse(fsSync.readFileSync(manifestPath, 'utf8'));

const CANONICALS = {};
for (const [key, val] of Object.entries(manifestData)) {
  CANONICALS[key] = {
    id: val.id,
    name: val.name,
    matchers: (val.patterns || []).map(p => new RegExp(p, val.flags || 'i')),
    expected: val.expected || {}
  };
}

async function getLatestCanaryFiles() {
  const dirFiles = await fs.readdir(DEBUG_DIR).catch(() => []);
  const jsonFiles = dirFiles.filter(f => f.endsWith('.json'));

  const allParsed = [];
  for (const file of jsonFiles) {
    const content = await fs.readFile(path.join(DEBUG_DIR, file), 'utf8');
    try {
      const parsed = JSON.parse(content);
      if (parsed && parsed.startedAt) {
        parsed._filename = file;
        parsed._mtimeMs = (await fs.stat(path.join(DEBUG_DIR, file))).mtimeMs;
        parsed._rawContent = content;
        allParsed.push(parsed);
      }
    } catch(e) {}
  }

  // Group by session ID
  const bySession = {};
  for (const p of allParsed) {
    const sessionId = p.summary?.sessionId || (p.invocation && p.invocation.resumeSession);
    if (!sessionId) continue;
    
    if (!bySession[sessionId]) {
      bySession[sessionId] = [];
    }
    bySession[sessionId].push(p);
  }

  const latestPerCategory = {};

  for (const [sessionId, runs] of Object.entries(bySession)) {
    runs.sort((a, b) => b._mtimeMs - a._mtimeMs);
    const latest = runs[0];
    
    // Find category by scanning all events and invocation goals in this session
    let matchedCategory = null;
    for (const [key, category] of Object.entries(CANONICALS)) {
      let isMatch = false;
      for (const r of runs) {
        for (const matcher of category.matchers) {
          if (matcher.test(r._filename)) {
            isMatch = true;
            break;
          }
          if (r.invocation?.goal && matcher.test(r.invocation.goal)) {
            isMatch = true;
            break;
          }
          if (r.localEvents) {
            const cliStarted = r.localEvents.find(e => e.type === 'cli.started');
            if (cliStarted && cliStarted.data?.goal && matcher.test(cliStarted.data.goal)) {
              isMatch = true;
              break;
            }
          }
        }
        if (isMatch) {
          break;
        }
      }
      if (isMatch) {
        matchedCategory = key;
        break;
      }
    }
    
    if (matchedCategory) {
      if (!latestPerCategory[matchedCategory] || latest._mtimeMs > latestPerCategory[matchedCategory]._mtimeMs) {
        latestPerCategory[matchedCategory] = latest;
      }
    }
  }

  return latestPerCategory;
}

function parseRun(run) {
  const content = run._rawContent;
  let providerLabel = run.summary?.provider || 'unknown';
  let resolvedModelId = 'unknown';
  let executionMode = 'unknown';
  let authMode = 'unknown';
  
  if (run.sseEvents && Array.isArray(run.sseEvents)) {
    for (let i = run.sseEvents.length - 1; i >= 0; i--) {
        const e = run.sseEvents[i];
        if (e.type === 'v6:provider' && e.data) {
            providerLabel = e.data.providerId || providerLabel;
            resolvedModelId = e.data.resolvedModelId || resolvedModelId;
            executionMode = e.data.executionMode || executionMode;
            authMode = e.data.authMode || authMode;
            break;
        }
    }
  }

  let runtimeProvider = providerLabel;
  if (executionMode !== 'unknown') {
    runtimeProvider = executionMode;
  } else if (authMode !== 'unknown') {
    runtimeProvider = authMode;
  }

  const latestPublicationEvent = [...(run.sseEvents || [])]
    .reverse()
    .find(e => e.type === 'v6:debug' && e.data?.category === 'publication');

  const latestTerminalResult =
    (run.finalResult && typeof run.finalResult === 'object' ? run.finalResult : null) ||
    [...(run.sseEvents || [])]
      .reverse()
      .find(e => e.type === 'result' && e.data?.result && typeof e.data.result === 'object')
      ?.data?.result ||
    null;

  const publicationState =
    run.summary?.publicationState ||
    latestTerminalResult?.publicationState ||
    latestPublicationEvent?.data?.publicationState ||
    'none';

  const failureCode =
    run.summary?.failureCode ||
    latestTerminalResult?.failureCode ||
    latestPublicationEvent?.data?.failureCode ||
    run.latestDebugStatus?.failureCode ||
    'none';
  const pendingInput = run.pendingInput != null;
  const clarifyRounds = run.latestDebugStatus?.clarifyRounds || 0;

  const goal_mismatch = content.includes('"goal_mismatch"') || content.includes('goal_mismatch');
  const calendar_phase_leak = content.includes('"calendar_phase_leak"') || content.includes('calendar_phase_leak');
  const requires_supervision = content.includes('"requires_supervision"') || content.includes('requires_supervision');

  const terminalLifecycle = run.latestDebugStatus?.lifecycle || run.summary?.status || 'running';
  const hasFinalArtifact = Boolean(run.finalPackage || latestTerminalResult?.package);

  let finalState = terminalLifecycle;
  if (pendingInput) {
    finalState = 'paused';
  } else if (publicationState === 'publishable' || publicationState === 'ready') {
    finalState = 'publishable';
  } else if (publicationState === 'blocked') {
    finalState = hasFinalArtifact ? 'blocked' : 'failed';
  } else if (
    terminalLifecycle === 'failed' ||
    terminalLifecycle === 'error' ||
    publicationState === 'failed' ||
    failureCode !== 'none'
  ) {
    finalState = 'failed';
  }

  return {
    providerLabel,
    resolvedModelId,
    executionMode,
    authMode,
    runtimeProvider,
    publicationState,
    failureCode,
    pendingInput,
    clarifyRounds,
    goal_mismatch,
    calendar_phase_leak,
    requires_supervision,
    finalState
  };
}

function evaluateExpectations(res, expected, rawContent = '') {
  let expectationStatus = 'unknown';
  const expectationFailures = [];

  if (Object.keys(expected || {}).length === 0) {
    return { expectationStatus, expectationFailures };
  }

  expectationStatus = 'pass';

  if (expected.publicationState && expected.publicationState !== res.publicationState) {
    expectationStatus = 'fail';
    expectationFailures.push(`publicationState expected '${expected.publicationState}' got '${res.publicationState}'`);
  }
  if (expected.failureCode && expected.failureCode !== res.failureCode) {
    expectationStatus = 'fail';
    expectationFailures.push(`failureCode expected '${expected.failureCode}' got '${res.failureCode}'`);
  }
  if (expected.allowPaused === false && res.finalState === 'paused') {
    expectationStatus = 'fail';
    expectationFailures.push(`not allowed to be paused`);
  }
  if (expected.mustContain) {
    for (const str of expected.mustContain) {
      if (!rawContent.includes(str)) {
        expectationStatus = 'fail';
        expectationFailures.push(`missing string: ${str}`);
      }
    }
  }
  if (expected.mustNotContain) {
    for (const str of expected.mustNotContain) {
      if (rawContent.includes(str)) {
        expectationStatus = 'fail';
        expectationFailures.push(`forbidden string: ${str}`);
      }
    }
  }

  return { expectationStatus, expectationFailures };
}

async function runReport({ jsonOnly = false } = {}) {
  const latestCanaries = await getLatestCanaryFiles();
  const results = {};

  for (const [key, category] of Object.entries(CANONICALS)) {
    const run = latestCanaries[key];
    if (!run) {
      results[key] = null;
      continue;
    }
    const res = parseRun(run);
    
    // Evaluate expectations
    const { expectationStatus, expectationFailures } = evaluateExpectations(
      res,
      category.expected,
      run._rawContent || ''
    );
    
    res.expectationStatus = expectationStatus;
    res.expectationFailures = expectationFailures;

    results[key] = res;
  }

  if (jsonOnly) {
    console.log(JSON.stringify(results, null, 2));
    return results;
  }

  let md = `# Evaluación V6 Canaries\n\n`;
  md += `| Escenario | Runtime | Model | Status Final | Expected? | Pending Input | Clarify R. | Goal Mismatch | Cal. Leak | Supervision | Pub. State | Failure Code |\n`;
  md += `|-----------|---------|-------|--------------|-----------|---------------|------------|---------------|-----------|-------------|------------|--------------|\n`;

  for (const [key, category] of Object.entries(CANONICALS)) {
    const res = results[key];
    if (!res) {
      md += `| ${category.name} | *No corrido* | - | - | - | - | - | - | - | - | - |\n`;
    } else {
      let expEmoji = res.expectationStatus === 'pass' ? '✅' : res.expectationStatus === 'fail' ? '❌' : '➖';
      md += `| ${category.name} | \`${res.runtimeProvider}\` | \`${res.resolvedModelId}\` | **${res.finalState}** | ${expEmoji} \`${res.expectationStatus}\` | ${res.pendingInput ? 'Yes' : 'No'} | ${res.clarifyRounds} | ${res.goal_mismatch ? '❌ Yes' : '✅ No'} | ${res.calendar_phase_leak ? '❌ Yes' : '✅ No'} | ${res.requires_supervision ? '⚠️ Yes' : '✅ No'} | \`${res.publicationState}\` | \`${res.failureCode}\` |\n`;
    }
  }
  
  const failures = Object.values(results).filter(x => x && x.expectationStatus === 'fail');
  if (failures.length > 0) {
    md += `\n## Fallos de Expectativas\n`;
    for (const [key, category] of Object.entries(CANONICALS)) {
      if (results[key] && results[key].expectationStatus === 'fail') {
        md += `- **${category.name}**: ${results[key].expectationFailures.join(', ')}\n`;
      }
    }
  }

  console.log(md);
  return { results, md };
}

import url from 'url';
const isMain = import.meta.url === url.pathToFileURL(process.argv[1]).href;

if (isMain) {
  const args = process.argv.slice(2);
  const jsonOnly = args.includes('--json');
  runReport({ jsonOnly }).catch(err => {
    console.error("Error generating report:", err);
    process.exit(1);
  });
}

export { getLatestCanaryFiles, parseRun, runReport, CANONICALS, evaluateExpectations };
