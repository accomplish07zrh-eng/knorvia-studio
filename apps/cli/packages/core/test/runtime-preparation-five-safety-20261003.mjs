import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(core, "../../../..");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const baselinePins = {"target-completion-verification":"c227322002b6fad2216d0dc0206cdd2bf696fcc7884376882a598769b6ae0c15","turn-loop":"0f9db0bebec69371924e4e92051ca5dd116bcb97edc747337964af664388fc33","turn-model":"87a0c21e4c1dc01d7b31b8221c3618e243710d92050b3577faf34375040e8166","plugin-reference":"0fa78fd2d6244c93ec2d85eb87356f9fd2f40cf37ad25e45577aefde04d989e2","session-shell-environment":"6b605aea5dd3599ba14a960daca970bd1bd97b9d64c0d8fc1f3f14b679c41ac8"};
const mode = process.argv[2];
assert.ok(["baseline", "current"].includes(mode), "explicit exact artifact mode required");
const dir = await mkdtemp(path.join(tmpdir(), "knorvia-goal-stop-five-synthetic-"));
const modules = {};
const artifacts = {};
if (mode === "baseline") {
  for (const [name, pin] of Object.entries(baselinePins)) {
    const bytes = await readFile(path.join(core, "test", `runtime-${name}-baseline-20261003.json`));
    assert.equal(sha(bytes), pin, `${name} immutable oracle`);
    const data = JSON.parse(bytes).files[name];
    for (const kind of ["source", "compiled", "declaration"])
      assert.equal(sha(data[kind]), data[`${kind}Sha256`]);
    artifacts[name] = data.compiled;
  }
} else {
  const pin = "CURRENT_MANIFEST_PIN";
  const bytes = await readFile(
    path.join(repo, "docs/evidence/knorvia-runtime-preparation-five-current-20261003.json"),
  );
  assert.equal(sha(bytes), pin, "strict current manifest; never fallback to historical code");
  const manifest = JSON.parse(bytes);
  for (const [name, files] of Object.entries(manifest.files)) {
    for (const [kind, entry] of Object.entries(files)) {
      const data = await readFile(path.join(repo, entry.path));
      assert.equal(sha(data), entry.sha256, `${name} ${kind} exact current artifact`);
      if (kind === "compiled") artifacts[name] = data.toString();
    }
  }
}
const fakePlugin=path.join(dir,'fake-plugin.mjs'),fakeProjection=path.join(dir,'fake-projection.mjs'),fakeUsage=path.join(dir,'fake-usage.mjs');
await writeFile(fakePlugin, 'export function extractPluginReferences(){return {references:[{id:"owned"}],invalidCount:0,truncatedCount:0}};export function buildPluginReferenceReminderBody(){return {body:"Owned reminder",diagnostics:{mcpServerCount:0,resolvedPluginIds:["owned"],skillCount:0,subagentCount:0,skipped:[],truncated:false}}}');
await writeFile(fakeProjection, 'export * from '+JSON.stringify(pathToFileURL(path.join(core,'src/runtime/helpers/index.js')).href)+';export function buildRuntimeProviderRequestMessages(){return {messages:[],sourceEntries:[],diagnostics:{latestRealUserMessageIndex:-1}}}');
await writeFile(fakeUsage,'export async function recordModelUsageFact(){}');
for (const [name, bytes] of Object.entries(artifacts)) {
  // Only import locations are rebound; emitted function syntax stays intact.
  const packageBound = bytes.replaceAll('"@knorvia/contracts"', JSON.stringify(pathToFileURL(path.join(core, '../contracts/dist/index.js')).href));
  const rebound = packageBound.replace(
    /(from\s+|import\s+)(["'])(\.[^"']+)\2/g,
    (whole, prefix, quote, specifier) => {
      const absolute = path.resolve(core, "src/runtime/methods", specifier);
      if(name==='plugin-reference'&&absolute===path.join(core,'src/plugin-reference/index.js'))return prefix+quote+pathToFileURL(fakePlugin).href+quote;
if(name==='target-completion-verification'&&absolute===path.join(core,'src/runtime/helpers/index.js'))return prefix+quote+pathToFileURL(fakeProjection).href+quote;
if(name==='target-completion-verification'&&absolute===path.join(core,'src/runtime/methods/usage-observability.js'))return prefix+quote+pathToFileURL(fakeUsage).href+quote;
const selected = path.basename(absolute, ".js");
      const local =
        absolute === path.join(core, "src/runtime/methods", `${selected}.js`) &&
        selected in artifacts;
      return (
        prefix +
        quote +
        pathToFileURL(local ? path.join(dir, `${selected}.mjs`) : absolute).href +
        quote
      );
    },
  );
  await writeFile(path.join(dir, `${name}.mjs`), rebound);
}
for (const name of Object.keys(artifacts))
  modules[name] = await import(pathToFileURL(path.join(dir, `${name}.mjs`)).href);
const trace = {traceId:'owned-trace',spanId:'owned-span'};
const failure = new Error('Owned publication failure');
const groups=[];
// A prepared model avoids model creation; only selection write/publication is exercised.
{
 const mod=modules['turn-model'],selection={providerId:'owned-provider',modelId:'owned-model',options:{reasoningLevel:'owned-thought'}}, previous={providerId:'old-owned',modelId:'old-owned'}, calls=[];
 const model={options:{reasoningLevel:'owned-thought'},optionSpecs:{reasoningLevel:{values:['owned-thought']}}};
 const runtime={sessionId:'owned-session',getSessionModelSelection(){return previous},setSessionModelSelection(value){calls.push('set');this.selection=value},sessionStore:{async saveSessionEntry(record){assert.equal(record.data,runtime.selection);assert.equal(record.touchSession,false);assert.equal(record.time.created,record.time.updated);calls.push('write');throw failure}},logger:{warn(label,data){assert.equal(data.event,'session.model_selection.persist_failed');calls.push('warn')}},async emitModelSelected(value){assert.equal(value.model,model);assert.equal(value.modelSelection,this.selection);assert.equal(value.previousModelSelection,previous);calls.push('publish')}};
 assert.equal(await mod.applySubmissionExecutionState(runtime,{modelSelection:selection},trace,undefined,model),model);
 assert.notEqual(runtime.selection,selection); assert.notEqual(runtime.selection.options,selection.options);assert.deepEqual(calls,['set','write','warn','publish']);
 groups.push('submission selection identity/write failure/publication');
}
// Parser/builder are owned synthetic ports; history persists when the notice write rejects.
{
 const mod=modules['plugin-reference'],calls=[];
 const runtime={sessionId:'owned-session',config:{},messageHistory:{addAttachment(source,text){assert.equal(source,'plugin_reference');assert.equal(text,'Owned reminder');calls.push('history')}},async persistSyntheticUserNoticeForSession(value){assert.equal(value.text,'Owned reminder');assert.deepEqual(Object.keys(value),['messageID','sessionId','source','text','traceContext']);calls.push('write');throw failure},logger:{debug(label,data){calls.push(data.event)}}};
 await mod.injectPluginReferenceReminderFromTurn.call(runtime,'Owned reference input',trace);
 assert.deepEqual(calls,['plugin_reference.reminder.resolved','history','write','plugin_reference.reminder.failed']);
 groups.push('plugin reminder history-before-write/recoverable publication failure');
}
// The real telemetry/declaration/model wrappers run with a synthetic model and scope; no account exists.
{
 const mod=modules['target-completion-verification'],calls=[],target={targetID:'owned-goal',status:'active',objective:'Owned goal',sessionID:'owned-session',summaryTitle:null,tokenBudget:null,tokensUsed:0,timeUsedSeconds:0,time:{created:0,updated:0}},completed={...target,status:'complete'};
 const scope={run(fn){return fn()},setResultType(){calls.push('result')},finishCompleted(){calls.push('completed')},finishFailed(){calls.push('failed')},finishCancelled(){calls.push('cancelled')}};
 const model={providerId:'owned-provider',modelId:'owned-model',displayName:'Owned',properties:{inputFormat:['text']},options:{},optionSpecs:{maxOutputTokens:{max:50}},async generateText(){calls.push('model');return {text:'{"passed":true,"reason":"Owned proof"}',finishReason:'stop',usage:{totalTokens:1}}}};
 const runtime={sessionId:'owned-session',config:{},getSessionModelSelection(){return {providerId:model.providerId,modelId:model.modelId}},modelFactory(){return model},agentTelemetry:{detached(){return scope}},messageHistory:{borrowReadOnlyRuntimeEntries(){return []}},async rebuildProjection(){return {targetCompletionVerificationTimeline:[]}},createEvent(type,payload){return {type,payload}},async appendEvent(event){calls.push(event.payload.status??event.type)},createModelStatusSink(){return undefined},extractToolCallsFromResult(){return []},async readSessionTargetForContext(){calls.push('read');return target},sessionStore:{async updateTargetStatus(value){assert.deepEqual(value,{sessionID:'owned-session',status:'complete'});calls.push('write');return completed}},async recordTargetChanged(value){assert.equal(value.previousTarget,target);assert.equal(value.target,completed);calls.push('publish');throw failure}};
 await assert.rejects(mod.verifyActiveTargetCompletionForContinuation.call(runtime,{target,traceContext:trace}),error=>error===failure);
 assert.deepEqual(calls.slice(-4),['read','write','publish','failed']);
 assert.equal(calls.includes('model'),true);assert.equal(calls.includes('completed'),true); // verifier lifecycle event, not telemetry completion
 assert.equal(calls.includes('result'),false);
 groups.push('verifier terminal target write/event failure/telemetry');
}
console.log(JSON.stringify({mode,groups,count:groups.length,selection:'5strict actual compiler JS owners; imports rebound to unchanged source dependencies except explicitly synthetic plugin parser/builder,provider projection and usage-fact seams; native model wrapper/telemetry run with fake ports',limits:'3minimal concrete persistence/publication groups;turn-loop and shell ordinary behavioral checks deferred;no source duplication/full runtime/provider requests'}));
