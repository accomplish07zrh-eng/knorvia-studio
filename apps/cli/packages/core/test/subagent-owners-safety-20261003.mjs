import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  repo = path.resolve(core, "../../../.."),
  mode = process.argv[2],
  h = (b) => createHash("sha256").update(b).digest("hex");
assert.ok(["baseline", "current", "draft"].includes(mode));
const sources = {},
  locations = {};
if (mode === "baseline") {
  const b = await fs.readFile(path.join(core, "test/subagent-owners-baseline-20261003.json"));
  assert.equal(h(b), "bc847c5c92336930de86749ce0d0e8c72f5a1ea8373b88deb5429ce9bc9db8a9");
  for (const [n, v] of Object.entries(JSON.parse(b).files)) {
    for (const k of ["source", "compiled", "declaration"]) assert.equal(h(v[k]), v[k + "Sha256"]);
    sources[n] = v.compiled;
    locations[n] = path.join(core, "src/subagent", n + ".js");
  }
} else if (mode === "draft") {
  const b = JSON.parse(await fs.readFile(process.argv[3], "utf8"));
  assert.equal(b.diagnostics.length, 0);
  for (const [f, t] of b.emissions)
    if (f.endsWith(".js")) {
      const n = path.basename(f, ".js");
      sources[n] = t;
      locations[n] = path.join(core, "src/subagent", n + ".js");
    }
  assert.ok(sources.runner && sources.profile);
} else {
  const b = await fs.readFile(
    path.join(repo, "docs/evidence/knorvia-subagent-owners-current-20261003.json"),
  );
  assert.equal(h(b), "CURRENT_SUBAGENT_PIN");
  for (const [n, row] of Object.entries(JSON.parse(b).files)) {
    for (const [k, e] of Object.entries(row)) {
      const b = await fs.readFile(path.join(repo, e.path));
      assert.equal(h(b), e.sha256);
      if (k === "compiled") sources[n] = b.toString();
    }
    locations[n] = path.join(repo, row.source.path.replace(/\.ts$/u, ".js"));
  }
}
const dir = await fs.mkdtemp(path.join(tmpdir(), "knorvia-owned-subagent-"));
const io = { writes: [], failure: undefined };
globalThis.__knorviaOwnedSubagentIO = io;
await fs.writeFile(
  path.join(dir, "filesystem.mjs"),
  `export async function mkdir(p,o){globalThis.__knorviaOwnedSubagentIO.writes.push(['mkdir',p,o])} export async function writeFile(p,t,e){const io=globalThis.__knorviaOwnedSubagentIO;io.writes.push(['write',p,t,e]);if(io.failure)throw io.failure}`,
);
for (const [n, s] of Object.entries(sources))
  await fs.writeFile(
    path.join(dir, n + ".mjs"),
    s.replace(/(from\s+|import\s+)(['"])([^'"]+)\2/gu, (all, pre, q, spec) => {
      let target;
      if (spec === "node:fs/promises") target = path.join(dir, "filesystem.mjs");
      else if (spec === "@knorvia/contracts")
        target = path.join(core, "../contracts/dist/index.js");
      else if (spec === "@knorvia/shared") target = path.join(core, "../shared/dist/index.js");
      else if (spec.startsWith(".")) {
        target = path.resolve(path.dirname(locations[n]), spec);
        const own = Object.keys(locations).find((k) => locations[k] === target);
        if (own) target = path.join(dir, own + ".mjs");
      } else return all;
      return pre + q + pathToFileURL(target).href + q;
    }),
  );
const profile = await import(pathToFileURL(path.join(dir, "profile.mjs")).href),
  { createExploreSubagentPort } = await import(pathToFileURL(path.join(dir, "runner.mjs")).href),
  C = await import(pathToFileURL(path.join(core, "../contracts/dist/index.js")).href);
const groups = [];
{
  const content =
    "---\nname: Owned\ndescription: synthetic\npermissionMode: plan\ntools: [Read, Agent, Bash]\nskills: [owned]\n---\nOwned synthetic prompt";
  const project = profile.parseAgentProfileFromMarkdown({ content, source: "project" }).profile,
    user = profile.parseAgentProfileFromMarkdown({ content, source: "user" }).profile;
  assert.ok(project);
  assert.ok(!Object.hasOwn(project, "permissionMode"));
  assert.equal(user.permissionMode, "plan");
  const custom = { ...project, name: "Explore" };
  const active = profile.normalizeAgentProfiles([
    custom,
    project,
    { ...project, description: "last" },
  ]);
  assert.equal(active[1], custom);
  assert.equal(active[2].description, "last");
  assert.equal(profile.isBuiltInExploreAgentProfile(custom), false);
  groups.push("profile authority suppression and stable override identity");
}
function registry() {
  const tasks = new Map(),
    calls = [];
  return {
    tasks,
    calls,
    register(t) {
      calls.push("register:" + t.status);
      tasks.set(t.taskId, t);
    },
    remove(id) {
      calls.push("remove");
      tasks.delete(id);
    },
    get(id) {
      return tasks.get(id);
    },
    update(id, f) {
      const old = tasks.get(id);
      if (!old) return undefined;
      const t = f(old);
      tasks.set(id, t);
      calls.push("update:" + t.status);
      return t;
    },
    requestBackground(id) {
      const t = tasks.get(id);
      if (!t || t.isBackgrounded) return undefined;
      return this.update(id, (x) => ({ ...x, isBackgrounded: true }));
    },
    waitForBackgroundRequest() {
      return new Promise(() => {});
    },
    waitForTerminal(id) {
      return Promise.resolve(tasks.get(id));
    },
    queueMessage() {
      return false;
    },
    drainMessages() {
      return [];
    },
  };
}
const trace = { traceId: C.createTraceId(), spanId: "owned-span" },
  request = {
    sessionId: C.createSessionId("owned-parent"),
    turnId: C.createTurnId(),
    parentToolCallId: "owned-tool",
    agentType: "general-purpose",
    description: "Owned synthetic task",
    prompt: "Owned synthetic prompt",
    workingDirectory: "/owned/work",
    workspaceRoot: "/owned/work",
    trace,
    callerCanReadOutputFile: true,
  };
function fixture() {
  io.writes.length = 0;
  io.failure = undefined;
  const reg = registry(),
    events = [],
    children = [],
    notifications = [];
  const options = {
    runtimeTaskRegistry: reg,
    outputRootDir: "/owned/output",
    createAgentId: () => "owned-agent",
    inactivityTimeoutMs: 0,
    async emitParentEvent(e) {
      assert.equal(this, options);
      events.push(e);
    },
    enqueueParentTaskNotification(n) {
      assert.equal(this, options);
      notifications.push(n);
      return undefined;
    },
    async runExploreAgent(r, o) {
      assert.equal(this, options);
      children.push([r, o]);
      await r.onSessionReady();
      return { response: "Owned result", traceId: trace.traceId, events: [] };
    },
  };
  return {
    reg,
    events,
    children,
    notifications,
    options,
    port: createExploreSubagentPort(options),
  };
}
{
  const f = fixture();
  await assert.rejects(
    f.port.launch({ ...request, runInBackground: true }, { modelOverride: { background: "deny" } }),
    (e) => e.context.code === C.AgentErrorCode.BACKGROUND_UNAVAILABLE,
  );
  await assert.rejects(
    f.port.run({ ...request, agentType: "missing-owned" }),
    (e) => e.context.code === C.AgentErrorCode.UNKNOWN_AGENT_TYPE,
  );
  assert.equal(f.children.length, 0);
  assert.equal(io.writes.length, 0);
  assert.equal(f.reg.tasks.size, 0);
  groups.push("background override and unknown profile deny before any effects");
}
{
  const f = fixture(),
    failure = new Error("Owned metadata rejection");
  io.failure = failure;
  await assert.rejects(f.port.run(request), (e) => e === failure);
  assert.deepEqual(f.reg.calls, ["register:running", "remove"]);
  assert.equal(f.children.length, 0);
  assert.equal(f.events.length, 0);
  assert.equal(f.reg.tasks.size, 0);
  groups.push("initial write failure removes task before child launch");
}
{
  const f = fixture();
  const result = await f.port.run(request);
  assert.equal(result.status, "completed");
  assert.equal(f.children.length, 1);
  const [r] = f.children[0];
  assert.equal(r.profile.name, "general-purpose");
  assert.ok(!r.allowedTools.includes("Agent"));
  assert.ok(!r.allowedTools.includes("Task"));
  assert.ok(!r.allowedTools.includes("WebSearch") || r.profile.tools.includes("*"));
  assert.equal(r.background, false);
  assert.equal(r.workingDirectory, request.workingDirectory);
  assert.equal(r.sessionId, C.createSessionId("subagent_owned-agent"));
  assert.deepEqual(
    f.events.map((e) => e.type),
    [C.SessionEventType.SubagentSpawned, C.SessionEventType.SubagentStopped],
  );
  assert.equal(f.reg.get("owned-agent").output, result);
  assert.equal(f.reg.get("owned-agent").status, "completed");
  assert.equal(f.notifications.length, 0);
  const writes = io.writes.filter((x) => x[0] === "write");
  assert.deepEqual(
    writes.map((x) => path.basename(x[1])),
    ["metadata.json", "output.txt", "task.output", "metadata.json"],
  );
  assert.equal(writes[1][2], "Owned result");
  assert.equal(writes[2][2], writes[1][2]);
  assert.equal(JSON.parse(writes[3][2]).status, "completed");
  groups.push("foreground child isolation and terminal artifact/event identity");
}
{
  const f = fixture(),
    controller = new AbortController();
  let launch;
  f.options.runExploreAgent = async (r) => {
    launch = r;
    return await new Promise(() => {});
  };
  const pending = f.port.run(request, { signal: controller.signal });
  for (let i = 0; i < 20 && !launch; i++) await Promise.resolve();
  assert.ok(launch);
  controller.abort(new Error("Owned cancellation"));
  await assert.rejects(pending, (e) => e.type === C.CoreErrorType.ToolCancelled);
  assert.equal(f.reg.tasks.size, 0);
  assert.equal(f.events.length, 0);
  assert.ok(launch.background === false);
  groups.push("setup cancellation removes unready child and no terminal publication");
}
console.log(
  JSON.stringify({
    mode,
    count: groups.length,
    groups,
    selected: "exact emitted owners; unchanged dependency owners via source loader",
    filesystem: "owned in-memory mkdir/write ports only",
    liveIO: false,
  }),
);
