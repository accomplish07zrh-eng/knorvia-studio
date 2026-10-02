import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => createHash('sha256').update(value).digest('hex');
const mode = process.argv[2];
let bytes;
if (mode === 'baseline') {
  const original = await readFile(path.join(core, 'test/runtime-control-only-turn-baseline-20261003.json'));
  assert.equal(hash(original), 'aa856852ac258b6359da089cfbfd37a3f7a7958bcd5b73191776df105ae7ef01');
  const data = JSON.parse(original).files['control-only-turn'];
  bytes = data.compiled;
  assert.equal(hash(bytes), data.compiledSha256);
} else if (mode === 'sealed-draft') {
  bytes = await readFile(process.argv[3], 'utf8');
  assert.equal(hash(bytes), '267c01e384defa82498d4e258169636dbe780e4296b4b27ee011d469be34d405');
} else if (mode === 'current') {
  const repo = path.resolve(core, '../../../..');
  const manifestBytes = await readFile(path.join(repo, 'docs/evidence/knorvia-runtime-goal-stop-five-current-20261003.json'));
  assert.equal(hash(manifestBytes), 'CURRENT_MANIFEST_PIN');
  const entries = JSON.parse(manifestBytes).files['control-only-turn'];
  for (const [kind, entry] of Object.entries(entries)) {
    const artifact = await readFile(path.join(repo, entry.path));
    assert.equal(hash(artifact), entry.sha256);
    if (kind === 'compiled') bytes = artifact.toString();
  }
} else throw Error('Explicit strict mode required');
const rebound = bytes.replace(/(from\s+|import\s+)(["'])(\.[^"']+)\2/g, (_, prefix, quote, specifier) => prefix + quote + pathToFileURL(path.resolve(core, 'src/runtime/methods', specifier)).href + quote);
const temporary = await mkdtemp(path.join(tmpdir(), 'knorvia-control-presence-owned-'));
const file = path.join(temporary, 'owner.mjs');
await writeFile(file, rebound);
const mod = await import(pathToFileURL(file).href);
const records = [];
const runtime = { turnNumber: 0, async ensureContextInitialized() {}, async ensureSessionPersisted() {}, messageHistory: { addUser() {}, setCacheMiss() {} }, createEvent(type, payload) { return { type, payload }; }, async appendEvent(event) { records.push(event); } };
await mod.emitControlOnlyUserTurn.call(runtime, { messageId: 'owned-message', titleInput: 'owned title', historyText: 'owned input', turnInput: 'owned input', traceContext: { traceId: 'owned-trace', spanId: 'owned-span' }, async persistMessage() {} });
assert.deepEqual(Object.keys(records[0].payload), ['turnNumber', 'input', 'messageId', 'executionKind'], 'absent optional metadata must remain absent from TurnStarted');
assert.equal(Object.hasOwn(records[0].payload, 'workflowLaunch'), false);
assert.equal(Object.hasOwn(records[0].payload, 'intent'), false);
console.log(JSON.stringify({ mode, groups: 1, observation: 'TurnStarted absence of optional launch/intent fields', overlap: 'same control-only publication owner as five-group safety fixture; no added total claim' }));
