// Exactly two owner-boundary probes; no repository test suite, compiler or product install.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { configure } from './dependency-doubles.mjs';

const [correctedPath, admissionPath, candidatePath, expectedSha, expectation, outputPath] = process.argv.slice(2);
assert.ok(outputPath && ['counterexamples', 'equivalent'].includes(expectation));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const binding = bytes => ({ bytes: bytes.length, sha256: sha256(bytes) });
const expectedCorrected = '2556b0d2495c08b82f22b8396abb87a0faea907611a45eab8d89bfd5a7e2d79b';
const expectedAdmission = 'aade31d58a478a21f9655c6f526ac40198cf962764c5084068ec0b70bf5edae9';
const sources = new Map();
const subjects = {};
for (const [name, path, expected] of [
  ['corrected', correctedPath, expectedCorrected],
  ['admission', admissionPath, expectedAdmission],
  ['candidate', candidatePath, expectedSha],
]) {
  const bytes = await readFile(path);
  assert.equal(sha256(bytes), expected, `${name}: wrong subject bytes`);
  const url = pathToFileURL(resolve(path)).href;
  subjects[name] = { path: resolve(path), ...binding(bytes), url };
  sources.set(url, stripTypeScriptTypes(bytes.toString('utf8'), { mode: 'strip' }));
}
const fixtureUrl = new URL('./dependency-doubles.mjs', import.meta.url).href;
const allowedDoubles = new Set(['@knorvia/contracts', './collection-events.js', './graph.js',
  './planner-expansion.js', './prompts.js']);
const resolvedBindings = [];
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (sources.has(specifier)) return { url: specifier, shortCircuit: true };
    if (sources.has(context.parentURL)) {
      const target = specifier === './collection-planner-admission.js'
        ? subjects.admission.url : allowedDoubles.has(specifier) ? fixtureUrl : undefined;
      assert.ok(target, `Undeclared runtime dependency: ${specifier}`);
      resolvedBindings.push({ from: context.parentURL, specifier, target });
      return { url: target, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (sources.has(url)) return { format: 'module', source: sources.get(url), shortCircuit: true };
    return nextLoad(url, context);
  },
});
const corrected = (await import(subjects.corrected.url)).checkCollectionPlanners;
const candidate = (await import(subjects.candidate.url)).checkCollectionPlanners;
assert.equal(typeof corrected, 'function');
assert.equal(typeof candidate, 'function');
assert.notEqual(corrected, candidate);

async function probe(check, mutatePhase, addedCount) {
  configure(addedCount);
  const snapshot = { runId: 'fixture-run', kind: 'fixture-kind', task: 'fixture-task',
    activities: [], artifacts: [], graph: { nodes: [], edges: [],
      collections: [{ collectionId: 'fixture-collection', explorable: true }] },
    strategy: { executor: { frontierTarget: 1, maxPlannerRuns: 3, maxConsecutiveErrors: 2 } } };
  const options = { cwd: '.', phase: 'phase-a', snapshot };
  let writes = 0;
  let ticks = 0;
  const observations = [];
  const runtime = {
    createActivityId() { return 'fixture-activity'; },
    eventLog: {
      timestamp() { return `clock-${++ticks}`; },
      async appendCollectionRecord() {},
      async appendExpansionRecords(_snapshot, _expansion, phase) {
        observations.push({ port: 'expansion-records', phase });
      },
      async emitEvent(_snapshot, type, event) { observations.push({ port: type, phase: event.phase }); },
    },
    plannerRunner: { async run(input) {
      observations.push({ port: 'runner', phase: input.phase, prompt: input.prompt });
      return { response: 'fixture-response', sessionId: 'fixture-session', nodes: [], edges: [] };
    } },
    async writeSnapshot() { if (++writes === 1 && mutatePhase) options.phase = 'phase-b'; },
    async writeArtifact(_runId, relativePath) { return { path: relativePath, relativePath }; },
  };
  try {
    const result = await check(snapshot, new Set(), options, runtime);
    assert.equal(result.addedNodeIds.length, addedCount);
    for (let index = 0; index < addedCount; index++) assert.equal(result.addedNodeIds[index], `accepted-${index}`);
    return { outcome: 'fulfilled', addedCount: result.addedNodeIds.length,
      plannersRan: result.plannersRan, observations, writes, ticks,
      artifactPhase: result.snapshot.artifacts[0]?.phase,
      terminalActivityPhase: result.snapshot.activities[0]?.phase };
  } catch (error) {
    return { outcome: 'rejected', error: { name: error?.name, message: error?.message },
      observations, writes, ticks };
  }
}
const phase = { corrected: await probe(corrected, true, 1), candidate: await probe(candidate, true, 1) };
assert.equal(phase.corrected.outcome, 'fulfilled');
assert.equal(phase.candidate.outcome, 'fulfilled');
assert.ok(phase.corrected.observations.every(item => item.phase === 'phase-b'));
assert.equal(phase.corrected.artifactPhase, 'phase-b');
const aggregation = { acceptedCount: 200_000,
  corrected: await probe(corrected, false, 200_000), candidate: await probe(candidate, false, 200_000) };
assert.equal(aggregation.corrected.outcome, 'fulfilled');
assert.equal(aggregation.corrected.addedCount, 200_000);
if (expectation === 'counterexamples') {
  assert.equal(phase.candidate.observations.find(item => item.port === 'planner_started').phase, 'phase-a');
  assert.equal(phase.candidate.observations.find(item => item.port === 'graph_expanded').phase, 'phase-b');
  assert.notDeepEqual(phase.candidate, phase.corrected);
  assert.equal(aggregation.candidate.outcome, 'rejected');
  assert.equal(aggregation.candidate.error.name, 'RangeError');
  assert.ok(aggregation.candidate.observations.some(item => item.port === 'planner_completed'));
} else {
  assert.deepEqual(phase.candidate, phase.corrected);
  assert.deepEqual(aggregation.candidate, aggregation.corrected);
}
const report = { schemaVersion: 1, recordedAtUtc: new Date().toISOString(), expectation,
  runtime: { node: process.version, v8: process.versions.v8, platform: process.platform, arch: process.arch },
  fixtureBindings: { harness: binding(await readFile(new URL(import.meta.url))),
    dependencies: binding(await readFile(new URL('./dependency-doubles.mjs', import.meta.url))) },
  subjects, resolvedBindings, phase, aggregation,
  limits: ['Only two focused owner-boundary probes; runtime dependencies are controlled diagnostic doubles.',
    'Exact owner/admission bytes are SHA-bound and executed after Node type stripping only.',
    'No strict compilation, emitted build, real scheduler consumer, broad suite or production integration.',
    'Argument threshold is engine-specific; this records one 200000-ID counterexample, not the exact threshold.'] };
await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ expectation, phase: [phase.corrected.outcome, phase.candidate.outcome],
  aggregation: [aggregation.corrected.outcome, aggregation.candidate.outcome], outputPath }));
