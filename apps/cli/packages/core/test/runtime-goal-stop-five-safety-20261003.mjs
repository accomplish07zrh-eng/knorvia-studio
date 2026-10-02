import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(core, '../../../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const baselinePins = {"target":"2a9ffc2b60355c3a67d4e92a9f0eccf91946314cdd2709f16b99b63b412237f3","goal-summary-title":"d18cdbaa767220d32ecddab69ca8ada6c17465f1c976c29def16688660d92d49","turn-stop":"b4661dcfe78df46a2937890b26dc4e4aec7301deb7bc39fe58b225b58f122408","subagent-messages":"790ada0ff4631e5c7971756a2c63d384079bd88f525814cd70fc5be6843dd610","control-only-turn":"aa856852ac258b6359da089cfbfd37a3f7a7958bcd5b73191776df105ae7ef01"};
const mode = process.argv[2];
assert.ok(['baseline', 'current'].includes(mode), 'explicit exact artifact mode required');
const dir = await mkdtemp(path.join(tmpdir(), 'knorvia-goal-stop-five-synthetic-'));
const modules = {};
const artifacts = {};
if (mode === 'baseline') {
  for (const [name, pin] of Object.entries(baselinePins)) {
    const bytes = await readFile(path.join(core, 'test', `runtime-${name}-baseline-20261003.json`));
    assert.equal(sha(bytes), pin, `${name} immutable oracle`);
    const data = JSON.parse(bytes).files[name];
    for (const kind of ['source', 'compiled', 'declaration']) assert.equal(sha(data[kind]), data[`${kind}Sha256`]);
    artifacts[name] = data.compiled;
  }
} else {
  const pin = 'CURRENT_MANIFEST_PIN';
  const bytes = await readFile(path.join(repo, 'docs/evidence/knorvia-runtime-goal-stop-five-current-20261003.json'));
  assert.equal(sha(bytes), pin, 'strict current manifest; never fallback to historical code');
  const manifest = JSON.parse(bytes);
  for (const [name, files] of Object.entries(manifest.files)) {
    for (const [kind, entry] of Object.entries(files)) {
      const data = await readFile(path.join(repo, entry.path));
      assert.equal(sha(data), entry.sha256, `${name} ${kind} exact current artifact`);
      if (kind === 'compiled') artifacts[name] = data.toString();
    }
  }
}
for (const [name, bytes] of Object.entries(artifacts)) {
  // Only import locations are rebound; emitted function syntax stays intact.
  const rebound = bytes.replace(/(from\s+|import\s+)(["'])(\.[^"']+)\2/g, (whole, prefix, quote, specifier) => {
    const absolute = path.resolve(core, 'src/runtime/methods', specifier);
    const selected = path.basename(absolute, '.js');
    const local = absolute === path.join(core, 'src/runtime/methods', `${selected}.js`) && selected in artifacts;
    return prefix + quote + pathToFileURL(local ? path.join(dir, `${selected}.mjs`) : absolute).href + quote;
  });
  await writeFile(path.join(dir, `${name}.mjs`), rebound);
}
for (const name of Object.keys(artifacts)) modules[name] = await import(pathToFileURL(path.join(dir, `${name}.mjs`)).href);
const trace = { traceId: 'owned-trace', spanId: 'owned-span' };
const failure = new Error('Owned publication failure');
const groups = [];

// Goal run accounting: port success, event failure, captured identity and read-before-write.
{
  const mod = modules.target;
  const original = { targetID: 'owned-goal', status: 'active' };
  const changed = { targetID: 'owned-goal', status: 'active', marker: 'changed' };
  const calls = [];
  const runtime = {
    sessionId: 'owned-session',
    sessionStore: { async startTargetRun(value) { assert.equal(this, runtime.sessionStore); calls.push(['start', Object.keys(value)]); return changed; } },
    async recordTargetChanged(value) { assert.equal(this, runtime); assert.equal(value.previousTarget, original); assert.equal(value.target, changed); calls.push(['record', value.action]); throw failure; },
    logger: { warn(label, value) { calls.push(['warn', label, value.event]); } },
  };
  assert.equal(await mod.startTargetTurnAccounting.call(runtime, { inputID: 'owned-input', startedAtMs: 10, startedTarget: original, traceContext: trace }), original);
  assert.deepEqual(calls, [['start', ['inputID', 'sessionID', 'startedAtMs', 'targetID']], ['record', 'run_started'], ['warn', 'Failed to start goal active run accounting', 'target.run_start.failed']]);
  calls.length = 0;
  runtime.readSessionTargetForContext = async () => { calls.push('read'); return original; };
  runtime.sessionStore.finishTargetRun = async value => { assert.equal(Object.hasOwn(value, 'status'), true); assert.equal(value.status, undefined); calls.push(['finish', Object.keys(value)]); return changed; };
  runtime.recordTargetChanged = async value => { assert.equal(value.previousTarget, original); assert.equal(value.target, changed); calls.push(['record', value.action]); };
  assert.equal(await mod.finishTargetTurnAccounting.call(runtime, { inputID: 'owned-input', endedAtMs: 20, startedTarget: original, traceContext: trace }), changed);
  assert.deepEqual(calls, ['read', ['finish', ['endedAtMs', 'inputID', 'sessionID', 'status', 'targetID']], ['record', 'run_finished']]);
  const paused = { targetID: 'different-owned-id', status: 'paused' };
  runtime.sessionStore.updateTargetStatus = async () => paused;
  runtime.recordTargetChanged = async value => { assert.equal(value.target, paused); assert.equal(value.previousTarget, original); };
  await mod.pauseActiveTargetForCancellation.call(runtime, trace);
  runtime.readSessionTargetForContext = async () => { throw failure; };
  await assert.rejects(mod.pauseActiveTargetForCancellation.call(runtime, trace), error => error === failure);
  groups.push('target accounting publication/identity/failure');
}

// Goal title writes cannot overwrite an existing fallback title; returned target is rechecked.
{
  const mod = modules['goal-summary-title'];
  const previous = { targetID: 'owned-goal', summaryTitle: '' };
  const updated = { targetID: 'owned-goal', summaryTitle: 'owned title' };
  const calls = [];
  const runtime = { sessionId: 'owned-session', sessionStore: {
    async readTarget(value) { assert.equal(this, runtime.sessionStore); calls.push(['read', Object.keys(value)]); return previous; },
    async updateTargetSummaryTitle(value) { calls.push(['write', Object.keys(value)]); assert.equal(value.summaryTitle, 'owned title'); return updated; },
  }, async recordTargetChanged(value) { calls.push('publish'); assert.equal(value.previousTarget, previous); assert.equal(value.target, updated); throw failure; } };
  await assert.rejects(mod.persistGeneratedGoalSummaryTitle.call(runtime, { targetID: 'owned-goal', title: 'owned title', traceContext: trace }), error => error === failure);
  assert.deepEqual(calls, [['read', ['sessionID']], ['write', ['sessionID', 'summaryTitle', 'targetID']], 'publish']);
  calls.length = 0;
  previous.summaryTitle = '  kept owned title  ';
  await mod.persistFallbackGoalSummaryTitle.call(runtime, { objective: 'owned objective', reason: 'owned-reason', targetID: 'owned-goal', traceContext: trace });
  assert.deepEqual(calls, [['read', ['sessionID']]]);
  calls.length = 0;
  previous.summaryTitle = '';
  updated.targetID = 'stale-owned-goal';
  await mod.persistGeneratedGoalSummaryTitle.call(runtime, { targetID: 'owned-goal', title: 'owned title', traceContext: trace });
  assert.deepEqual(calls, [['read', ['sessionID']], ['write', ['sessionID', 'summaryTitle', 'targetID']]]);
  groups.push('goal title write/returned-target/no-overwrite');
}

// Detached notice persistence retains its history effect on write rejection; stale branches never enqueue.
{
  const mod = modules['subagent-messages'];
  const calls = [];
  const input = { agentId: 'owned-agent', agentType: 'owned-type', responseId: 'owned-response', childSessionId: 'owned-child', childToolCallId: 'owned-call', summary: 'owned summary', message: 'owned <message>', traceContext: trace };
  const runtime = { branchGeneration: 2, runtimeTaskRegistry: { get() { return { branchGeneration: 1 }; } }, runtimeCommandQueue: { size() { throw Error('must not read optional log metadata'); } }, enqueueRuntimeCommand() { throw Error('must not enqueue stale branch'); } };
  assert.equal(mod.enqueueSubagentMessage.call(runtime, input), undefined);
  runtime.runtimeTaskRegistry.get = () => undefined;
  runtime.enqueueRuntimeCommand = command => { calls.push('enqueue'); runtime.command = command; };
  mod.enqueueSubagentMessage.call(runtime, input);
  assert.equal(runtime.command.messageLength, input.message.length);
  assert.equal(Object.hasOwn(runtime.command, 'parentToolCallId'), false);
  assert.equal(runtime.command.text, '<subagent-message>\n<agent-id>owned-agent</agent-id>\n<agent-type>owned-type</agent-type>\n<summary>owned summary</summary>\n<message>owned &lt;message&gt;</message>\n</subagent-message>');
  calls.length = 0;
  runtime.ensureContextInitialized = async value => { assert.equal(value, trace); calls.push('init'); };
  runtime.messageHistory = { addUser(text, metadata) { assert.equal(text, runtime.command.text); assert.equal(metadata.inputPresentation, 'subagent_reply_steer'); calls.push('history'); } };
  runtime.sessionId = 'owned-session';
  runtime.persistSyntheticUserNoticeForSession = async value => { assert.equal(value.visibility, 'model-only'); assert.equal(value.metadata.inputPresentation, 'subagent_reply_steer'); calls.push('write'); throw failure; };
  await assert.rejects(mod.persistSubagentMessageCommand.call(runtime, runtime.command, true), error => error === failure);
  assert.deepEqual(calls, ['init', 'history', 'write']);
  groups.push('subagent branch admission/history-before-notice-write');
}

// A control-only boundary commits history before message persistence and advances only after completion.
{
  const mod = modules['control-only-turn'];
  const calls = [];
  const runtime = { turnNumber: 0, sessionId: 'owned-session', async ensureContextInitialized() { calls.push('init'); }, async ensureSessionPersisted() { calls.push('session'); }, messageHistory: { addUser() { calls.push('history'); }, setCacheMiss() { calls.push('cache'); } }, createEvent(type, payload, context) { return { type, payload, context }; }, async appendEvent(event) { calls.push(event.type); if (event.payload.resultType) throw failure; } };
  const options = { messageId: 'owned-message', titleInput: 'owned title', historyText: 'owned text', turnInput: 'owned text', traceContext: trace, inputId: '', async persistMessage() { assert.equal(this, options); calls.push('message'); }, afterTurnBoundary() { assert.equal(this, options); assert.equal(runtime.turnNumber, 0); calls.push('after'); } };
  await assert.rejects(mod.emitControlOnlyUserTurn.call(runtime, options), error => error === failure);
  assert.equal(runtime.turnNumber, 0);
  assert.equal(calls.includes('after'), false);
  assert.equal(calls.includes('cache'), false);
  assert.deepEqual(calls.slice(0,4), ['init', 'session', 'history', 'message']);
  calls.length = 0;
  runtime.appendEvent = async event => { assert.equal(Object.hasOwn(event.payload, 'inputId'), false); calls.push(event.type); };
  await mod.emitControlOnlyUserTurn.call(runtime, options);
  assert.equal(runtime.turnNumber, 1);
  assert.deepEqual(calls.slice(-2), ['after', 'cache']);
  const records = [];
  const meta = { owned: 'launch' };
  runtime.sessionStore = {};
  runtime.config = {};
  runtime.getSessionModelSelection = () => ({ owned: 'model' });
  runtime.getTools = () => [{ name: 'OwnedTool' }];
  runtime.persistMessage = async record => { records.push(record); };
  runtime.persistPart = async () => { throw failure; };
  await assert.rejects(mod.persistWorkflowLaunchUserMessage.call(runtime, { messageID: 'owned-launch', text: 'owned launch', meta, traceContext: trace }), error => error === failure);
  assert.equal(runtime.latestConversationMessageId, 'owned-launch');
  assert.equal(records.length, 1);
  assert.equal(records[0].metadata.workflowLaunch, meta);
  assert.equal(records[0].semantics.origin, 'real_user');
  assert.deepEqual(Object.keys(records[0]), ['id','sessionID','role','time','agent','metadata','modelSelection','semantics','anchor','source','system','synthetic','tools','visibility']);
  groups.push('control-only turn/message/terminal publication gate');
}

// An empty uncommitted assistant rolls back only after successful delete; error carrier shares record identity.
{
  const mod = modules['turn-stop'];
  const anchor = { latestAssistantMessageId: 'previous-assistant', latestAssistantTurnId: 'previous-turn', latestConversationMessageId: 'previous-conversation' };
  const state = { model: { providerId: 'owned-provider', modelId: 'owned-model' }, modelResponse: '', currentUserMessageId: 'owned-user', turnRequestState: { entries: [] } };
  const runtime = { sessionId: 'owned-session', latestAssistantMessageId: 'owned-assistant', latestAssistantTurnId: 'owned-turn', latestConversationMessageId: 'owned-assistant', sessionStore: { async removeMessage() { throw failure; } } };
  const options = { assistantPersistenceAnchor: anchor, assistantCreatedAt: 10, assistantMessageId: 'owned-assistant', includeEmptyAssistant: false, modelTraceContext: trace, result: { finishReason: 'stop' } };
  await assert.rejects(mod.persistCompletedAssistantStep(runtime, state, options), error => error === failure);
  assert.equal(runtime.latestConversationMessageId, 'owned-assistant');
  runtime.sessionStore.removeMessage = async () => {};
  assert.equal(await mod.persistCompletedAssistantStep(runtime, state, options), false);
  assert.deepEqual(mod.captureAssistantPersistenceAnchor(runtime), anchor);
  const records = [];
  runtime.persistAssistantMessage = async (...args) => { records.push(['message', args]); };
  runtime.persistPart = async (...args) => { records.push(['part', args]); };
  const error = { name: 'OwnedLimit', data: { marker: 'owned' } };
  await mod.persistOutputTokenLimitErrorCarrier(runtime, state, { error, finishReason: 'length', model: state.model, modelTraceContext: trace });
  assert.deepEqual(records.map(value => value[0]), ['message', 'part', 'message']);
  const first = records[0][1], part = records[1][1][0], last = records[2][1];
  assert.equal(part.messageID, first[0]);
  assert.equal(last[0], first[0]);
  assert.equal(last[2], first[2]);
  assert.equal(last[3].error, error);
  assert.equal(last[3].tokens, part.tokens);
  assert.equal(first[3], undefined);
  groups.push('assistant rollback/error-carrier write identity');
}
console.log(JSON.stringify({ mode, groups, count: groups.length, selection: 'exact actual compiler JS for five owners, import-location rebinding only; transitive unchanged dependencies use tsx source resolution', limits: 'five compact synthetic persistence/lifecycle groups; no source-mode duplication, ordinary suites/builds/native unrun' }));
