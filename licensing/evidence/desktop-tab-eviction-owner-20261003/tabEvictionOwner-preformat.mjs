import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const sourceFile = process.env.KNORVIA_EVICTION_BASELINE
  ? '/tmp/knorvia-tab-eviction-baseline/residency.ts'
  : new URL('./browserTabResidencyPolicy.ts', import.meta.url);
const source = ts.transpileModule(fs.readFileSync(sourceFile, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(source, { module, exports: module.exports, Error });
const { selectBrowserTabLimitVictim: select, BROWSER_TAB_LIMIT } = module.exports;
function candidate(id, properties = {}) {
  return {
    tabId: id, windowId: 1, sessionId: 'synthetic', residency: 'live-background',
    guestAttached: true, openedAt: 20, lastActivityAt: 10, lastSelectedAt: 5,
    preferred: false, currentTask: false, selected: false, visible: false,
    operationActive: false, captureActive: false, audible: false, mediaActive: false,
    loading: false, downloadActive: false, ...properties,
  };
}

test('complete tab eviction owner preserves protected state, stable ranking and original identity', () => {
  assert.equal(BROWSER_TAB_LIMIT, 32);
  const protectedTab = candidate('protected', { residency: 'live-visible' });
  Object.defineProperty(protectedTab, 'selected', { get() { throw new Error('protected short circuit'); } });
  assert.equal(select([protectedTab], { windowId: 1, tabLimit: 1 }), null);
  const victim = candidate('victim', {
    residency: 'suspended', guestAttached: false, preferred: true, currentTask: true,
  });
  assert.equal(select([protectedTab, victim], { windowId: 1, tabLimit: 1 }), victim);
  for (const flag of ['selected', 'visible', 'operationActive', 'captureActive', 'audible', 'mediaActive', 'loading', 'downloadActive']) {
    const running = candidate('running', { [flag]: true, lastActivityAt: -100 });
    assert.equal(select([running, victim], { windowId: 1, tabLimit: 1 }), victim);
  }
  for (const residency of ['restoring', 'suspend-pending']) {
    assert.equal(select([candidate('running', { residency }), victim], { windowId: 1, tabLimit: 1 }), victim);
  }
  const outside = candidate('outside', { windowId: 2, lastActivityAt: -100 });
  assert.equal(select([outside, victim], { windowId: 1, tabLimit: 1 }), null);
  const a = candidate('a', { lastActivityAt: 8 });
  const b = candidate('b', { lastSelectedAt: 4 });
  const c = candidate('c', { openedAt: 10 });
  const original = [b, c, a];
  assert.equal(select(original, { windowId: 1, tabLimit: 2 }), a);
  assert.deepEqual(original, [b, c, a]);
  assert.equal(select([c, b], { windowId: 1, tabLimit: 1 }), b);
  assert.equal(select([candidate('z'), c], { windowId: 1, tabLimit: 1 }), c);
  const lexical = candidate('a');
  assert.equal(select([candidate('z'), lexical], { windowId: 1, tabLimit: 1 }), lexical);
  const stable = candidate('z', { lastSelectedAt: null, openedAt: 999 });
  assert.equal(select([stable, candidate('a', { lastSelectedAt: null, openedAt: 0 })], { windowId: 1, tabLimit: 1 }), stable);
  const nonfinite = candidate('z', { lastActivityAt: Number.NaN });
  assert.equal(select([nonfinite, candidate('a', { lastActivityAt: Number.NaN })], { windowId: 1, tabLimit: 1 }), nonfinite);
  assert.equal(select([victim], { windowId: 1, tabLimit: Number.NaN }), victim);
  let protectionReads = 0;
  const quiet = candidate('quiet');
  Object.defineProperty(quiet, 'selected', { get() { protectionReads++; return false; } });
  assert.equal(select([quiet], { windowId: 1 }), null);
  assert.equal(protectionReads, 0);
  const originalError = new Error('synthetic getter failure');
  Object.defineProperty(quiet, 'selected', { get() { throw originalError; } });
  assert.throws(() => select([quiet, victim], { windowId: 1, tabLimit: 1 }), (error) => error === originalError);
});
