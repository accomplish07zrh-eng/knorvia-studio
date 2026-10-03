import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
export async function loadPermissionOwners(mode) {
  const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const repo = path.resolve(core, "../../../..");
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

  assert.ok(["baseline", "current", "draft"].includes(mode));
  const source = {};
  const entries = {};
  if (mode === "baseline") {
    const bytes = await fs.readFile(
      path.join(core, "test/runtime-permission-owners-baseline-20261003.json"),
    );
    assert.equal(hash(bytes), "23462209a7052ebdf464c7446c0bbfd69636943771409aade89ee6b49695b7fb");
    for (const [name, row] of Object.entries(JSON.parse(bytes).files)) {
      for (const key of ["source", "compiled", "declaration"])
        assert.equal(hash(row[key]), row[key + "Sha256"]);
      source[name] = row.compiled;
      entries[name] = path.join(core, "src/runtime", name.replace(/\.ts$/u, ".js"));
    }
  } else if (mode === "draft") {
    const bytes = await fs.readFile(process.argv[3]);
    assert.equal(hash(bytes), "acbc1beb05dbbb9b414bf3794c9c9cada374b7966906b6b5a87088c87b29b602");
    const draft = JSON.parse(bytes);
    assert.equal(draft.diagnostics.length, 0);
    assert.equal(draft.apiEqual, true);
    for (const [file, text] of draft.emissions) {
      if (!file.endsWith(".js")) continue;
      const name = file.split("/dist/runtime/")[1].replace(/\.js$/u, ".ts");
      source[name] = text;
      entries[name] = path.join(core, "src/runtime", name.replace(/\.ts$/u, ".js"));
    }
  } else {
    const bytes = await fs.readFile(
      path.join(repo, "docs/evidence/knorvia-runtime-permission-current-20261003.json"),
    );
    assert.equal(hash(bytes), "03dcdc43775b83950afaadcfbf75776f9e5df6ecb392859f31d9f45bd778c1e8");
    for (const [name, row] of Object.entries(JSON.parse(bytes).files)) {
      for (const [key, item] of Object.entries(row)) {
        const bytes = await fs.readFile(path.join(repo, item.path));
        assert.equal(hash(bytes), item.sha256, item.path);
        if (key === "compiled") source[name] = bytes.toString();
      }
      entries[name] = path.join(repo, row.source.path.replace(/\.ts$/u, ".js"));
    }
  }
  const consumerBytes = await fs.readFile(
    path.join(repo, "docs/evidence/runtime-permission-owner-consumer-20261003.json"),
  );
  assert.equal(
    hash(consumerBytes),
    "dcef7852b67e6ed46857a2875179a3f59627b6e4e6c855d3ef7634855079dcc7",
  );
  const consumer = JSON.parse(consumerBytes);
  for (const item of Object.values(consumer.files))
    assert.equal(hash(await fs.readFile(path.join(repo, item.path))), item.sha256);
  source["session-mode-port.ts"] = (
    await fs.readFile(path.join(repo, consumer.files.compiled.path))
  ).toString();
  entries["session-mode-port.ts"] = path.join(core, "src/runtime/session-mode-port.js");
  const dir = await fs.mkdtemp(path.join(tmpdir(), "knorvia-owned-permission-"));
  const target = (name) => path.join(dir, name.replaceAll("/", "__").replace(/\.ts$/u, ".mjs"));
  for (const [name, text] of Object.entries(source)) {
    await fs.writeFile(
      target(name),
      text.replace(/(from\s+|import\s+)(['"])([^'"]+)\2/gu, (all, prefix, quote, specifier) => {
        let file;
        if (specifier === "@knorvia/contracts")
          file = path.join(core, "../contracts/dist/index.js");
        else if (specifier === "@knorvia/shared")
          file = path.join(repo, "packages/shared/src/execution-state.ts");
        else if (specifier.startsWith(".")) {
          file = path.resolve(path.dirname(entries[name]), specifier);
          const own = Object.keys(entries).find((key) => entries[key] === file);
          if (own) file = target(own);
        } else return all;
        return prefix + quote + pathToFileURL(file).href + quote;
      }),
    );
  }
  const { grantPermissionFullAccess: grant } = await import(
    pathToFileURL(target("permission-full-access.ts")).href
  );
  const E = await import(pathToFileURL(target("execution-state.ts")).href);
  const R = await import(pathToFileURL(target("permission-grant-recovery.ts")).href);
  const B = await import(pathToFileURL(target("helpers/permission-broker.ts")).href);
  const { createRuntimeSessionModePort } = await import(
    pathToFileURL(target("session-mode-port.ts")).href
  );

  return { grant, E, R, B, createRuntimeSessionModePort };
}

export const trace = { traceId: "owned-trace", spanId: "owned-span" };
export function fixture() {
  const calls = [],
    receipts = [],
    events = [];
  const selected = [
    { pendingInputId: "owned-a" },
    { pendingInputId: "owned-a" },
    { pendingInputId: "owned-b" },
  ];
  const a = { id: "owned-a", intent: { mode: "build", planEnabled: false, owned: "same" } };
  const b = { id: "owned-b" };
  const c = { id: "owned-later", intent: { mode: "edit" } };
  const runtime = {
    sessionId: "owned-session",
    rootTraceContext: trace,
    config: { mode: "build", planEnabled: false },
    sessionPersisted: true,
    pendingInputReservations: new Map(),
    pendingInputDrains: 0,
    needsPlanModeExitReminder: false,
    activeTurn: { pendingInputs: [a, b, c] },
    async rebuildProjection() {
      assert.equal(this, runtime);
      calls.push("projection");
      return { pendingSteerInputs: selected };
    },
    createEvent(type, payload, context) {
      assert.equal(this, runtime);
      assert.equal(context, trace);
      calls.push("create");
      return {
        id: "owned-event",
        sessionId: runtime.sessionId,
        traceId: trace.traceId,
        type,
        timestamp: new Date(0),
        sequenceNumber: 0,
        payload,
      };
    },
    async appendEvent(event, context) {
      assert.equal(this, runtime);
      assert.equal(context, trace);
      calls.push("append");
      events.push(event);
    },
    async notifyEventSinks(event, context) {
      assert.equal(this, runtime);
      assert.equal(context, trace);
      calls.push("notify");
      runtime.notified = event;
    },
    eventStore: {
      async getEvents(id) {
        assert.equal(this, runtime.eventStore);
        assert.equal(id, runtime.sessionId);
        calls.push("events");
        return events;
      },
    },
    sessionStore: {
      async sessionEntries(input) {
        assert.equal(this, runtime.sessionStore);
        calls.push("entries");
        assert.equal(input.sessionID, runtime.sessionId);
        return receipts;
      },
      async commitPermissionFullAccess(input) {
        assert.equal(this, runtime.sessionStore);
        calls.push("commit");
        runtime.committed = input;
        receipts.push(input.receipt);
      },
      async saveSessionEntry(input) {
        assert.equal(this, runtime.sessionStore);
        calls.push("save");
        runtime.saved = input;
      },
    },
  };
  return { runtime, calls, receipts, events, selected, a, b, c };
}
