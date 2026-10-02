import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const core = new URL("../", import.meta.url),
  hash = (x) => createHash("sha256").update(x).digest("hex"),
  read = (p) => fs.readFile(new URL(p, core), "utf8");
const baselines = {
    "background-notifications": "5b25e8078582481e7b9dc5062666761175b3d7016935508bd67f6aac16302378",
    hooks: "5fad4e0da8d5094fc9f6bfc4ef62a0824a07a93790926ec526c474c9eac02bc4",
    "title-generation-sidecar": "d442adbe18ab5cf8e11369319bba1fa364b413bc94e55aa675291f616d77294f",
    "session-title": "b9d3677033700714a8c06b6fe1183e2767988c0770b9d7e19572b657b9aad536",
    "workspace-generate-text": "59b4bc9bbff157c26cff543ac35d25a034addebf69304351a1610debda7a8d62",
  },
  old = {},
  urls = {};
const data = (s) => "data:text/javascript;base64," + Buffer.from(s).toString("base64");
for (const [n, pin] of Object.entries(baselines)) {
  const text = await read("test/runtime-" + n + "-baseline-20261003.json");
  assert.equal(hash(text), pin);
  const f = JSON.parse(text).files[n];
  for (const k of ["source", "compiled", "declaration"]) assert.equal(hash(f[k]), f[k + "Sha256"]);
  const bind = (s) =>
    s.replace(
      /from "([^"]+)"/gu,
      (_, p) =>
        `from ${JSON.stringify(p.startsWith(".") ? (urls[p.replace("./", "").replace(".js", "")] ?? new URL("dist/runtime/methods/" + p, core).href) : import.meta.resolve(p))}`,
    );
  urls[n] = data(bind(f.compiled));
  old[n] = await import(urls[n]);
}
async function observe(o) {
  const trace = { traceId: "owned-trace", spanId: "owned-span" },
    results = {};
  // Failure after one ledger promotion must not duplicate the synthetic notice.
  {
    const calls = [],
      failure = Error("Owned ledger mark"),
      origin = {
        backgroundSource: "workflow",
        workId: "owned",
        title: "Owned",
        workflowNotification: { owned: true },
      },
      commands = [0, 1].map((i) => ({
        id: "owned-" + i,
        text: "Owned " + i,
        traceContext: trace,
        originMeta: origin,
      }));
    const runtime = {
      sessionId: "owned",
      async ensureContextInitialized(t) {
        assert.equal(t, trace);
        calls.push("init");
      },
      messageHistory: {
        addUser(text) {
          calls.push("history");
          assert.equal(text, "Owned 0\n\nOwned 1");
        },
      },
      async persistSyntheticUserNoticeForSession(x) {
        calls.push("notice");
        assert.equal(x.metadata.originMeta.title, "Owned · Owned");
        assert.equal("workflowNotification" in x.metadata.originMeta, false);
      },
      sessionStore: {
        async markSessionInputPromoted(x) {
          calls.push(x.id);
          if (x.id === "owned-0") throw failure;
        },
      },
      logger: {
        warn(label, x) {
          calls.push("warn");
          assert.equal(x.errorMessage, failure.message);
        },
      },
    };
    const value = await o["background-notifications"].persistBackgroundTaskNotificationBatch.call(
      runtime,
      commands,
    );
    assert.equal(value.backgroundSource, "workflow");
    assert.deepEqual(calls, ["init", "history", "notice", "owned-0", "warn", "owned-1"]);
    results.notification = calls;
  }
  // Failed admission must leave SessionStart available; successful activation commits before dispatch.
  {
    const calls = [],
      failure = Error("Owned activation"),
      runtime = {
        sessionStartHookRan: false,
        workspaceHookAdmission: {
          async activate() {
            calls.push("activate");
            throw failure;
          },
        },
      };
    await assert.rejects(
      o.hooks.runSessionStartHooks.call(runtime, "startup", trace),
      (e) => e === failure,
    );
    assert.equal(runtime.sessionStartHookRan, false);
    runtime.workspaceHookAdmission.activate = async () => calls.push("activate-ok");
    const empty = await o.hooks.runSessionStartHooks.call(runtime, "startup", trace);
    assert.equal(runtime.sessionStartHookRan, true);
    assert.equal(await o.hooks.runStopHooks.call(runtime, "", 0, trace), empty);
    results.hook = calls;
  }
  // Store failure in explicit rename must stop publication; successful stored title publishes once.
  {
    const calls = [],
      failure = Error("Owned title write"),
      runtime = {
        sessionId: "owned",
        sessionStore: {
          async getSession() {
            calls.push("read");
            return { title: "Before" };
          },
          async updateSession(x) {
            calls.push("write");
            assert.equal(x.titleSource, "custom");
            throw failure;
          },
        },
        createEvent(type, payload, t) {
          calls.push("create");
          assert.equal(t, trace);
          assert.deepEqual(payload, { previousTitle: "Before", source: "custom", title: "Owned" });
          return { type, payload };
        },
        async appendEvent(e, t) {
          calls.push("append");
          assert.equal(t, trace);
        },
      };
    await assert.rejects(
      o["session-title"].setCustomSessionTitle.call(runtime, {
        title: "Owned",
        traceContext: trace,
      }),
      (e) => e === failure,
    );
    assert.deepEqual(calls, ["read", "write"]);
    runtime.sessionStore.updateSession = async () => calls.push("write-ok");
    await o["session-title"].setCustomSessionTitle.call(runtime, {
      title: "Owned",
      traceContext: trace,
    });
    results.title = calls;
  }
  // Append failure must prevent the model call in both detached request owners; no live provider.
  for (const n of ["title-generation-sidecar", "workspace-generate-text"]) {
    const calls = [],
      failure = Error("Owned request append"),
      model = {
        providerId: "owned",
        modelId: "owned",
        displayName: "Owned",
        properties: {},
        optionSpecs: { reasoningLevel: { values: ["low"] }, maxOutputTokens: { max: 5000 } },
        options: { reasoningLevel: "low" },
        bind(options) {
          return { ...this, options };
        },
        async generateText() {
          calls.push("unexpected-model");
          throw Error("Must not launch");
        },
      };
    const scope = {
      run: (fn) => fn(),
      setResultType() {
        calls.push("result");
      },
      finishCompleted() {
        calls.push("completed");
      },
      finishFailed(stage, category, e) {
        assert.equal(e, failure);
        calls.push("failed");
      },
      finishCancelled() {
        calls.push("cancelled");
      },
    };
    const runtime = {
      config: { titleGeneration: {} },
      rootTraceContext: trace,
      agentTelemetry: {
        detached() {
          calls.push("telemetry");
          return scope;
        },
      },
      getSessionModelSelection() {
        return { providerId: "owned", modelId: "owned" };
      },
      modelFactory() {
        calls.push("factory");
        return model;
      },
      createEvent(type, payload) {
        calls.push("create");
        assert.equal(payload.toolCount, 0);
        return { type, payload };
      },
      async appendEvent() {
        calls.push("append");
        throw failure;
      },
    };
    const promise =
      n === "title-generation-sidecar"
        ? o[n].generateTitleCandidate.call(runtime, "Owned input", {
            querySource: "session_title",
            traceContext: trace,
          })
        : o[n].generateWorkspaceText.call(runtime, {
            selection: { providerId: "owned", modelId: "owned" },
            prompt: "Owned",
            querySource: "owned",
          });
    await assert.rejects(promise, (e) => e === failure);
    assert.deepEqual(calls, ["telemetry", "factory", "create", "append", "failed"]);
    results[n] = calls;
  }
  return results;
}
const observations = await observe(old);
console.log(
  JSON.stringify({
    mode: "immutable predecessor actual emitted",
    syntheticSafetyGroups: 5,
    observations,
  }),
);
