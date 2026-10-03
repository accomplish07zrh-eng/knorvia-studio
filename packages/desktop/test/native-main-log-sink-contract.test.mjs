import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { loadNativeOwner } from "./native-owner-fixture.mjs";

// Authored and unrun; fs, services/shared APIs, clock, console and process streams
// are supplied. The actual retained retention owner consumes the same fake fs.
const modules = {
  "node:fs": "export const mkdirSync = port.mkdir; export const appendFileSync = port.append; export const readdirSync = port.read; export const unlinkSync = port.unlink;",
  "@knorvia/shared": "export const formatTimestamp = port.timestamp; export const redactDiagnosticValue = port.redact;",
  "@knorvia/services/node": "export const getAppConfigDir = port.config; export const maybeThrowInjectedFsFault = port.inject;",
};
const banner = "const process=nativeFixture.process; const console=nativeFixture.console; const Date=nativeFixture.Date;";
function ports() {
  const state = { now: new Date(2024, 4, 20, 12), trace: [], handlers: [], entries: [], output: [], writes: [], formatted: [] };
  state.Date = class extends Date { constructor(...args) { super(...(args.length ? args : [state.now])); } };
  state.process = { pid: 123, env: {}, stdout: { on(event, callback) { state.handlers.push(["stdout", event, callback]); state.trace.push(["stdout"]); } },
    stderr: { on(event, callback) { state.handlers.push(["stderr", event, callback]); state.trace.push(["stderr"]); } } };
  state.console = {};
  for (const name of ["log", "warn", "error"]) state.console[name] = function (...args) {
    assert.equal(this, undefined); state.trace.push(["console", name]); state.output.push([name, ...args]);
    if (state.consoleFailure) throw state.consoleFailure;
  };
  state.mkdir = (...args) => { state.trace.push(["mkdir", ...args]); if (state.mkdirFailure) throw state.mkdirFailure; };
  state.read = (...args) => { state.trace.push(["read", ...args]); return state.entries; };
  state.unlink = (path) => { state.trace.push(["unlink", path]); if (state.unlinkFailure) throw state.unlinkFailure; };
  state.append = (path, line) => { state.trace.push(["append", path]); state.writes.push([path, line]); if (state.appendFailure) throw state.appendFailure; };
  state.config = () => { state.trace.push(["config"]); return "fixture-data"; };
  state.inject = (value) => { state.trace.push(["inject", value]); if (state.injectFailure) throw state.injectFailure; };
  state.timestamp = (value) => { state.formatted.push(value); state.trace.push(["format"]); return "fixture-ts"; };
  state.redact = (value) => value;
  return state;
}

async function load(state) { return (await loadNativeOwner("logger", state, modules, banner)).logger; }

test("startup directory/retention warning precedes same-handler stdout and stderr registration", async () => {
  const state = ports(); state.process.env = { KNORVIA_ENV: "test", KNORVIA_E2E_RUNTIME_LOG_DIR: " fixture-startup " };
  state.entries = [{ name: "2024-05-01.log", isFile() { return true; } }]; state.unlinkFailure = new Error("fixture locked log");
  await load(state);
  assert.deepEqual(state.trace.map(([event]) => event), ["mkdir", "read", "unlink", "console", "stdout", "stderr"]);
  assert.deepEqual(state.trace[0], ["mkdir", "fixture-startup", { recursive: true }]);
  assert.deepEqual(state.output, [["warn", "[log-retention] failed to delete expired logs from fixture-startup:", ["2024-05-01.log"], "retentionDays=14"]]);
  assert.equal(state.handlers[0][1], "error"); assert.equal(state.handlers[1][1], "error");
  assert.equal(state.handlers[0][2], state.handlers[1][2]); assert.equal(state.writes.length, 0);
});

test("write uses live directory, exact daily line and the same redacted values for console", async () => {
  const state = ports();
  const input = { fixture: "input" }; const safe = { masked: true }; const calls = [];
  state.redact = (...args) => { calls.push(args); return args[0] === input ? safe : args[0]; };
  const logger = await load(state); state.trace.length = 0;
  state.process.env = { KNORVIA_ENV: "test", KNORVIA_E2E_RUNTIME_LOG_DIR: " fixture-next " };
  logger.info("fixture", input, undefined);
  assert.deepEqual(calls, [["fixture"], [input], [undefined]]);
  assert.deepEqual(state.writes, [[join("fixture-next", "2024-05-20.log"), '[fixture-ts] [info] [pid:123] [main] fixture {"masked":true} \n']]);
  assert.equal(state.output[0][3], safe);
  assert.deepEqual(state.trace.map(([event]) => event), ["format", "mkdir", "console", "inject", "append"]);
  state.process.env.KNORVIA_E2E_RUNTIME_LOG_DIR = " "; logger.warn("fallback");
  assert.equal(state.writes[1][0], join("fixture-data", "logs", "2024-05-20.log"));
  assert.equal(state.trace.filter(([event]) => event === "read").length, 0);
});

test("production debug skips capture while renderer debug still writes and live development debug resumes", async () => {
  const state = ports(); const logger = await load(state); state.trace.length = 0;
  state.process.env.NODE_ENV = "production"; logger.debug("skipped"); assert.deepEqual(state.trace, []);
  logger.fromRenderer("debug", ["renderer"]); assert.equal(state.writes.length, 1);
  assert.match(state.writes[0][1], /\[debug\] \[pid:123\] \[renderer\] renderer\n$/);
  state.process.env.NODE_ENV = "development"; logger.debug("main"); assert.equal(state.writes.length, 2);
});

test("console EPIPE still appends, append/fault errors are swallowed, other phase errors retain priority", async () => {
  const state = ports(); const logger = await load(state); state.trace.length = 0;
  const pipe = { code: "EPIPE" }; state.consoleFailure = pipe; logger.error("pipe"); assert.equal(state.writes.length, 1);
  state.consoleFailure = undefined; state.injectFailure = new Error("fixture injection"); logger.info("fault");
  assert.equal(state.writes.length, 1); state.injectFailure = undefined;
  state.appendFailure = new Error("fixture append"); logger.warn("append"); assert.equal(state.writes.length, 2);
  const failure = new Error("fixture console"); state.consoleFailure = failure;
  assert.throws(() => logger.info("stopped"), (error) => error === failure); assert.equal(state.writes.length, 2);
  state.consoleFailure = undefined; state.mkdirFailure = failure;
  assert.throws(() => logger.info("mkdir"), (error) => error === failure); assert.equal(state.writes.length, 2);
  assert.doesNotThrow(() => state.handlers[0][2](pipe));
  assert.throws(() => state.handlers[1][2](failure), (error) => error === failure);
});
