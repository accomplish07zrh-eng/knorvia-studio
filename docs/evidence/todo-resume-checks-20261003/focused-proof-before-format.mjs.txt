import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { hash, load, plain, repo } from "./todo-resume-fixture-20261003.mjs";
import { fixture } from "./resume-ports-20261003.mjs";
const mode = process.argv[2];
async function api(f) {
  if (mode !== "sealed") return load(mode, "resume.ts", f.modules);
  const bytes = fs.readFileSync(path.join(repo, "docs/evidence/todo-resume-checks-20261003/sealed-draft-review-emission.json"));
  assert.equal(hash(bytes), "c2db7fd831c1fd42efa19d225e21381e34af9f30ac470b723e1273d293fae1e6");
  const selected = JSON.parse(bytes); assert.deepEqual(selected.diagnostics, []); assert.equal(selected.apiEqual, true);
  for (const row of Object.values(selected.files)) for (const kind of ["source", "compiled", "declaration"]) assert.equal(hash(row[kind]), row[kind + "Sha256"]);
  const context = vm.createContext({ Error, Map, Set, Promise, String, Boolean, Date });
  const exports = { ...f.modules, "@knorvia/contracts": { SESSION_ENTRY_EXECUTION_STATE: "runtime/execution_state" } };
  const modules = new Map(Object.entries(exports).map(([id, values]) => [id, new vm.SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, { context, identifier: id })]));
  const entry = new vm.SourceTextModule(selected.files["resume.ts"].compiled, { context, identifier: "runtime/methods/resume.js" });
  await entry.link((specifier, parent) => {
    const id = specifier.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), specifier)) : specifier;
    assert.ok(modules.has(id), id); return modules.get(id);
  });
  await entry.evaluate(); return entry.namespace;
}
const observations = [];
for (const scenario of ["empty", "directory", "anchor"]) {
  const f = fixture(), logs = [], anchor = [];
  f.runtime.logger = Object.fromEntries(["warn", "info"].map(level => [level, (message, fields) => logs.push({ level, message, fields: plain(fields) })]));
  if (scenario === "empty") {
    f.messages.splice(0); f.hydration.appliedMessageCount = 0; f.hydration.messageCount = 0; f.hydration.partCount = 0;
    f.modules["runtime/methods/session-shell-environment.js"].restoreSessionShellEnvironmentSelectionForResume = async owner => { assert.equal(owner, f.runtime); assert.equal(owner.config.envInfo, undefined); return {}; };
  }
  if (scenario === "directory") f.runtime.discardPersistedPendingSteerInputs = async function () { this.workingDirectory = "/owned/port-changed"; };
  if (scenario === "anchor") f.modules["runtime/helpers/index.js"].getLatestActiveSessionMessageId = messages => {
    assert.equal(messages, f.messages); anchor.push([f.runtime.latestAssistantMessageId ?? null, f.runtime.latestAssistantTurnId ?? null, f.runtime.lastAssistantCompletedAtMs ?? null]); return "owned-assistant";
  };
  Object.assign(f.runtime, await api(f)); const output = await f.runtime.resumeFromStore();
  observations.push({ scenario, warningEvents: logs.filter(l => l.level === "warn").map(l => l.fields.event), resumedDirectory: f.events.at(-1).payload.directory, returnedDirectory: output.directory, loggedDirectory: logs.at(-1).fields.directory, anchor });
}
console.log(JSON.stringify({ mode, observations }, null, 2));
const expected = [
  { scenario: "empty", warningEvents: ["session.resume.persisted_messages_zero"], resumedDirectory: "/owned/session", returnedDirectory: "/owned/session", loggedDirectory: "/owned/session", anchor: [] },
  { scenario: "directory", warningEvents: [], resumedDirectory: "/owned/session", returnedDirectory: "/owned/session", loggedDirectory: "/owned/session", anchor: [] },
  { scenario: "anchor", warningEvents: [], resumedDirectory: "/owned/session", returnedDirectory: "/owned/session", loggedDirectory: "/owned/session", anchor: [[null, null, null]] },
];
assert.deepEqual(observations, expected);
console.log("ok one focused group: three concrete post-seal contract observations");
