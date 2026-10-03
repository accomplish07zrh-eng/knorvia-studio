import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(ports) {
  const file = process.env.KNORVIA_CRON_BASELINE || 'packages/desktop/src/host/cronRunLifecycle.ts';
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, Error, Promise, ...ports }, { filename: file });
  return exports;
}
const identity = () => ({ automationId: 'synthetic-automation', runId: 'synthetic-run', workspaceKey: 'synthetic-workspace', scheduledAt: null, trigger: 'manual' });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('Cron claim injected authority, live await identities and heartbeat lifetime', async () => {
  const timers = [], cleared = [];
  const api = load({
    setInterval(callback, delay) { timers.push({ callback, delay }); return timers.length === 1 ? 0 : timers.length; },
    clearInterval(token) { cleared.push(token); },
  });
  let rejectTouch;
  const touchResult = { catch(callback) { assert.equal(this, touchResult); rejectTouch = callback; return 'opaque'; } };
  let touched = 0;
  const firstRepo = { touchManualClaim() { assert.fail('old repo must not be captured'); } };
  const currentRepo = { touchManualClaim(a, w) { assert.equal(this, currentRepo); assert.equal(a, 'live-automation'); assert.equal(w, 'live-workspace'); touched++; return touchResult; } };
  const logs = [];
  const heartbeatParams = { ...identity(), repo: firstRepo, logWarn(message, error) { assert.equal(this, heartbeatParams); logs.push([message, error]); } };
  const heartbeat = api.startManualClaimHeartbeat(heartbeatParams);
  assert.equal(timers[0].delay, 60000); assert.equal(touched, 0);
  Object.assign(heartbeatParams, { repo: currentRepo, automationId: 'live-automation', workspaceKey: 'live-workspace', intervalMs: 7 });
  assert.equal(timers[0].callback(), undefined); assert.equal(touched, 1);
  heartbeat.dispose(); heartbeat.dispose(); assert.deepEqual(cleared, [0, 0]);
  heartbeatParams.runId = 'late-run';
  const renewalError = new Error('renewal identity');
  rejectTouch(renewalError);
  assert.deepEqual(logs.splice(0), [['续租 manual automation claim 失败 automation=live-automation runId=late-run', renewalError]]);
  const warningFailure = new Error('warning identity');
  heartbeatParams.logWarn = () => { throw warningFailure; };
  assert.throws(() => rejectTouch(renewalError), error => error === warningFailure);
  const syncTouchFailure = new Error('sync touch identity');
  heartbeatParams.repo = { touchManualClaim() { throw syncTouchFailure; } };
  assert.throws(() => timers[0].callback(), error => error === syncTouchFailure);
  api.startManualClaimHeartbeat({ ...identity(), repo: currentRepo, logWarn() {}, intervalMs: 0 });
  assert.equal(timers[1].delay, 0);

  const phase = [], admission = deferred();
  const terminalParams = { ...identity(), outcome: 'succeeded', error: 'old error', extra: { synthetic: true }, repo: null, logWarn() { assert.fail('success must not warn'); } };
  const afterClaimRepo = {
    markRunOutcome(run, outcome, error) { assert.equal(this, afterClaimRepo); phase.push(['outcome', run, outcome, error]); terminalParams.repo = releaseRepo; return Promise.resolve(); },
  };
  const releaseRepo = { releaseManualClaim(a, w) { assert.equal(this, releaseRepo); phase.push(['release', a, w]); return Promise.resolve(); } };
  const admissionRepo = { ensureRunClaimed(params) { assert.equal(this, admissionRepo); assert.equal(params, terminalParams); assert.equal(params.extra, terminalParams.extra); phase.push('claimed'); return admission.promise; } };
  terminalParams.repo = admissionRepo;
  const terminal = api.settleCronRunTerminalOutcome(terminalParams);
  assert.deepEqual(phase, ['claimed']);
  Object.assign(terminalParams, { repo: afterClaimRepo, runId: 'after-await-run', outcome: 'stopped', error: 'after-await-error', automationId: 'after-await-automation', workspaceKey: 'after-await-workspace' });
  admission.resolve(); await terminal;
  assert.deepEqual(phase.splice(0), ['claimed', ['outcome', 'after-await-run', 'stopped', 'after-await-error'], ['release', 'after-await-automation', 'after-await-workspace']]);

  const outcomeFailure = new Error('outcome identity');
  const recoverParams = { ...identity(), outcome: 'failed', repo: null, logWarn(message, error) { assert.equal(this, recoverParams); assert.equal(error, outcomeFailure); phase.push(message); this.trigger = 'schedule'; } };
  recoverParams.repo = { ensureRunClaimed(params) { assert.equal(params, recoverParams); return Promise.reject(outcomeFailure); }, markRunOutcome() { assert.fail('claim failure must skip outcome'); }, releaseManualClaim() { assert.fail('live schedule trigger must skip release'); } };
  await api.settleCronRunTerminalOutcome(recoverParams);
  assert.deepEqual(phase.splice(0), ['回写定时任务运行结果失败 automation=synthetic-automation runId=synthetic-run']);
  recoverParams.trigger = 'manual'; recoverParams.logWarn = () => { throw warningFailure; };
  await assert.rejects(api.settleCronRunTerminalOutcome(recoverParams), error => error === warningFailure);
  recoverParams.logWarn = function (message, error) { assert.equal(this, recoverParams); phase.push([message, error]); };
  recoverParams.repo.releaseManualClaim = function () { phase.push('manual release'); return Promise.resolve(); };
  await api.settleCronRunTerminalOutcome(recoverParams);
  assert.equal(phase[0][1], outcomeFailure); assert.equal(phase[1], 'manual release'); phase.length = 0;
  recoverParams.repo.ensureRunClaimed = () => Promise.resolve();
  recoverParams.repo.markRunOutcome = () => { throw outcomeFailure; };
  await api.recordCronRunOutcomeBestEffort(recoverParams);
  assert.equal(phase[0][1], outcomeFailure); assert.equal(phase.length, 1); phase.length = 0;

  const dispatchFailure = new Error('dispatch recording identity');
  const releaseFailure = new Error('release identity');
  const dispatchParams = { ...identity(), dispatchError: new Error('original dispatch'), repo: null, logWarn(message, error) { assert.equal(this, dispatchParams); phase.push([message, error]); } };
  const dispatchAdmission = deferred();
  const dispatchRepo = {
    markRunDispatch(payload) { assert.equal(this, dispatchRepo); assert.deepEqual(Object.keys(payload), ['runId', 'dispatchStatus', 'error']); assert.equal(payload.runId, 'synthetic-run'); assert.equal(payload.dispatchStatus, 'failed_to_dispatch'); assert.equal(payload.error, 'original dispatch'); phase.push('dispatch'); return dispatchAdmission.promise; },
  };
  const nextReleaseRepo = { releaseManualClaim(a, w) { assert.equal(this, nextReleaseRepo); assert.equal(a, 'released-live-automation'); assert.equal(w, 'released-live-workspace'); phase.push('release after dispatch'); return Promise.resolve(); } };
  dispatchParams.repo = dispatchRepo;
  const settlement = api.settleManualDispatchFailureBestEffort(dispatchParams);
  assert.deepEqual(phase, ['dispatch']);
  Object.assign(dispatchParams, { repo: nextReleaseRepo, automationId: 'released-live-automation', workspaceKey: 'released-live-workspace' });
  dispatchAdmission.resolve(); await settlement;
  assert.deepEqual(phase.splice(0), ['dispatch', 'release after dispatch']);
  assert.equal(dispatchParams.dispatchError.message, 'original dispatch');
  dispatchParams.repo = { markRunDispatch() { throw dispatchFailure; }, releaseManualClaim() { phase.push('release despite warned dispatch'); return Promise.reject(releaseFailure); } };
  await api.settleManualDispatchFailureBestEffort(dispatchParams);
  assert.equal(phase[0][1], dispatchFailure); assert.match(phase[0][0], /^回写 manual automation 派发失败状态失败 /);
  assert.equal(phase[1], 'release despite warned dispatch'); assert.equal(phase[2][1], releaseFailure); assert.match(phase[2][0], /^释放 manual automation claim 失败 /); phase.length = 0;
  dispatchParams.logWarn = () => { throw warningFailure; };
  await assert.rejects(api.settleManualDispatchFailureBestEffort(dispatchParams), error => error === warningFailure);
  assert.deepEqual(phase, []);
  dispatchParams.repo.markRunDispatch = () => Promise.resolve();
  await assert.rejects(api.settleManualDispatchFailureBestEffort(dispatchParams), error => error === warningFailure);
  assert.deepEqual(phase.splice(0), ['release despite warned dispatch']);
  const conversionFailure = new Error('conversion identity');
  dispatchParams.dispatchError = { toString() { throw conversionFailure; } };
  await assert.rejects(api.settleManualDispatchFailureBestEffort(dispatchParams), error => error === conversionFailure);
  assert.deepEqual(phase, []);
  let reads = 0;
  Object.defineProperty(dispatchParams, 'dispatchError', { get() { reads++; return reads === 1 ? new Error('first read') : new Error('second read'); } });
  dispatchParams.repo = { markRunDispatch(payload) { assert.equal(payload.error, 'second read'); return Promise.resolve(); }, releaseManualClaim() { return Promise.resolve(); } };
  await api.settleManualDispatchFailureBestEffort(dispatchParams); assert.equal(reads, 2);
});
