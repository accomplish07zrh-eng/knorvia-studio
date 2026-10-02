import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const core = new URL('../', import.meta.url), root = new URL('../../../../../', import.meta.url);
const hash = (x) => createHash('sha256').update(x).digest('hex');
const historical = JSON.parse(fs.readFileSync(new URL('test/workflow-expert-execution-delivery-baseline.json', core)));
const pins = JSON.parse(fs.readFileSync(new URL('test/workflow-expert-execution-delivery-current.json', core)));
function select(record) { assert.equal(hash(fs.readFileSync(new URL(record.path, root))), record.sha256, record.path); }
for (const module of Object.values(pins.files)) for (const record of Object.values(module)) select(record);
assert.throws(() => select({ ...pins.files['scheduled-phase'].compiled, sha256: '0'.repeat(64) }));
assert.throws(() => select({ path: 'missing-owned-delivery.js', sha256: '0'.repeat(64) }));
for (const module of Object.values(historical.files)) for (const kind of ['source','compiled','declaration']) assert.equal(hash(module[kind]), module[kind+'Sha256']);
const bind = (text) => text.replace(/from "([^"]+)"/gu, (_, path) => `from ${JSON.stringify(path.startsWith('.') ? new URL('dist/workflow/expert/'+path,core).href : import.meta.resolve(path))}`);
const baseline = await import('data:text/javascript;base64,' + Buffer.from(bind(historical.files['scheduled-phase'].compiled)).toString('base64'));
const candidate = await import(new URL(pins.files['scheduled-phase'].compiled.path,root));
const { ExpertWorkflowRuntimeContext } = await import(new URL('dist/workflow/expert/runtime-context.js',core));
const { createExpertWorkflowDefinition } = await import(new URL('dist/workflow/definition.js',core));
async function observe(owner) {
  const trace=[], signal=new AbortController().signal; let clock=0, artifact={relativePath:'artifacts/owned.md'};
  const store={
    async writeSnapshot(snapshot,opts){assert.equal(this,store);assert.equal(opts.signal,signal);trace.push(['snapshot',JSON.stringify(snapshot)]);},
    async appendEvent(event,opts){assert.equal(this,store);assert.equal(arguments.length,2);assert.equal(opts.signal,signal);trace.push(['event',JSON.stringify(event)]);},
    async appendGraphRecord(runId,record,opts){assert.equal(this,store);assert.equal(opts.signal,signal);trace.push(['graph',runId,JSON.stringify(record)]);},
    async writeArtifact(runId,path,content,opts){assert.equal(this,store);assert.equal(opts.signal,signal);trace.push(['artifact',runId,path,content]);return artifact;},
  };
  const definition={...createExpertWorkflowDefinition(),phaseOrder:['owned'],phases:[{phase:'owned',title:'Owned phase',description:'Owned objective',behavior:'scheduled_graph'}]};
  const ctx=new ExpertWorkflowRuntimeContext({definition,store,agentRunner:{run(){throw Error('No synthetic runner admitted');}},createRunId:()=> 'owned-run',createActivityId:()=> 'owned-activity',now:()=>new Date(clock++*1000)});
  const snapshot=ctx.createInitialSnapshot({cwd:'owned',task:'Owned task',sessionId:'owned-parent'});
  snapshot.graph.nodes.push({ id: 'owned-task', phase: 'owned', kind: 'task', title: 'Owned task', status: 'completed', dependsOn: [] });
  const result=await owner.runScheduledPhase(ctx,snapshot,ctx.definition.phases[0],{cwd:'owned',abortSignal:signal});
  assert.equal(result.artifacts.at(-1).path,artifact.relativePath);
  assert.deepEqual(trace.filter(x=>x[0]==='event').map(x=>JSON.parse(x[1]).type),['phase_started','frontier_changed','executor_completed','artifact_written','phase_completed']);
  return {trace,result,clock};
}
assert.deepEqual(await observe(candidate),await observe(baseline));
console.log(JSON.stringify({mode:'actual compiler-emitted owner with real branch scheduler/context; workspace dependencies via tsx',pairedPublicationCheck:'pass',observations:1,selectors:'wrong/missing reject'}));
