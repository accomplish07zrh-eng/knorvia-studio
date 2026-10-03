import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

const baseline = process.argv.includes("--baseline");
const selected = process.argv.find((arg) => arg.startsWith("--owner="))?.slice(8);
const names = {
  browser: "browserControlMainBridge",
  attachments: "remotePromptAttachments",
  collection: "remoteWorkspaceServiceCollection",
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const quote = (value) => "Q(" + value + ")";
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function load(owner, ports, globals = {}) {
  const file = baseline
    ? "/tmp/knorvia-host-baseline/" + names[owner] + ".ts"
    : path.join(process.cwd(), "packages/desktop/src/host/" + names[owner] + ".ts");
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  let nonce = 0;
  vm.runInNewContext(
    code,
    {
      exports,
      module: { exports },
      Error,
      Promise,
      Math,
      Date,
      String,
      Object,
      Array,
      Map,
      Set,
      require: (id) => {
        if (id === "node:crypto") return { randomUUID: () => "uuid-" + ++nonce };
        if (Object.hasOwn(ports, id)) return ports[id];
        throw new Error("Unprovided product port: " + id);
      },
      ...globals,
    },
    { filename: file },
  );
  return exports;
}
function check(owner, name, fn) {
  if (!selected || selected === owner) test(owner + ": " + name, fn);
}
console.log(
  "sourceMode=" +
    (baseline ? "frozen-baseline" : "installed-candidate") +
    "; owner=" +
    (selected ?? "all"),
);

function browserFixture(deps = {}) {
  let now = 100,
    nextTimer = 0;
  const timers = new Map(),
    posts = [];
  const parameters = { postToMain: (message) => posts.push(message), ...deps };
  const api = load(
    "browser",
    { "@knorvia/shared": { HostResponseTypes: { BrowserExecuteRequest: "browser.execute" } } },
    {
      Date: { now: () => now },
      setTimeout: (fn, ms) => {
        const id = ++nextTimer;
        timers.set(id, { fn, ms });
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
    },
  ).createBrowserControlMainBridge(parameters);
  return {
    api,
    posts,
    timers,
    parameters,
    advance: (ms) => {
      now += ms;
    },
  };
}
check("browser", "captured authority, duplicate correlation and dispose settlement", async () => {
  const f = browserFixture();
  const [descriptor] = await f.api.list();
  assert.equal((await f.api.list())[0], descriptor);
  assert.deepEqual(plain(descriptor.capabilities.tab), []);
  assert.equal(descriptor.capabilities.browser[0].id, "visibility");
  const id = descriptor.id,
    generation = descriptor.generation;
  descriptor.id = "mutated-descriptor";
  descriptor.generation = -1;
  const command = { method: "navigate", url: "synthetic://page" };
  f.parameters.timeoutMs = 1;
  const denied = await f.api.execute({
    browserId: "mutated-descriptor",
    browserGeneration: generation,
    sessionId: "session",
    command,
  });
  assert.equal(denied.error.code, "backend_unavailable");
  const stale = await f.api.execute({
    browserId: id,
    browserGeneration: -1,
    sessionId: "session",
    command,
  });
  assert.equal(stale.elapsedMs, 0);
  assert.equal(f.posts.length, 0);
  const pending = f.api.execute({
    requestId: "same",
    browserId: id,
    browserGeneration: generation,
    sessionId: "session",
    workspaceKey: "identity",
    workspacePath: "/virtual/work",
    workspaceIdentity: "remote:opaque",
    remoteSessionId: "remote-session",
    command,
  });
  assert.equal(f.posts[0].command, command);
  assert.deepEqual(plain(f.posts[0]), {
    type: "browser.execute",
    requestId: "same",
    browserId: id,
    browserGeneration: generation,
    sessionId: "session",
    workspaceKey: "identity",
    workspacePath: "/virtual/work",
    workspaceIdentity: "remote:opaque",
    remoteSessionId: "remote-session",
    clientMode: "desktop-continuous",
    sessionContext: "live",
    command,
  });
  const duplicate = await f.api.execute({ requestId: "same", sessionId: "other", command });
  assert.equal(duplicate.error.code, "duplicate_request_id");
  assert.equal(duplicate.error.sideEffect, "none");
  assert.equal(f.posts.length, 1);
  assert.equal(f.timers.size, 1);
  assert.equal(f.timers.values().next().value.ms, 30000);
  f.advance(7);
  f.api.dispose();
  assert.equal((await pending).error.sideEffect, "uncertain");
  assert.equal(f.timers.size, 0);
  await f.api.handleResult({
    requestId: "same",
    get result() {
      throw new Error("late result observed");
    },
  });
  const result = { ok: true, elapsedMs: 4, data: { synthetic: true } };
  const afterDispose = f.api.execute({ requestId: "same", sessionId: "session", command });
  await f.api.handleResult({ requestId: "same", result });
  assert.equal(await afterDispose, result);
});
check("browser", "timeout cancellation and detached recording identity", async () => {
  let completeRecording, observed;
  const f = browserFixture({
    timeoutMs: 5,
    materializeRecording: (input) => {
      observed = input;
      return new Promise((resolve) => {
        completeRecording = resolve;
      });
    },
  });
  const timed = f.api.execute({
    requestId: "timed",
    sessionId: "s",
    turnId: "turn",
    workspaceIdentity: "identity",
    remoteSessionId: "remote",
    command: { method: "playwright", action: { name: "locator", operation: "fill", timeoutMs: 8 } },
  });
  const timer = f.timers.values().next().value;
  assert.equal(timer.ms, 2008);
  f.advance(2008);
  timer.fn();
  assert.equal((await timed).error.sideEffect, "uncertain");
  assert.deepEqual(plain(f.posts[1].command), { method: "cancelRequest", requestId: "timed" });
  assert.equal(f.posts[1].workspaceIdentity, "identity");
  await f.api.handleResult({ requestId: "timed", result: { ok: true } });
  const artifact = { path: "/virtual/main-recording", extra: "preserve" };
  const result = {
    ok: true,
    elapsedMs: 1,
    extra: { keep: true },
    recording: { status: "completed", artifact, duration: 9 },
  };
  const recording = f.api.execute({
    requestId: "record",
    sessionId: "s",
    workspacePath: "/virtual/work",
    workspaceIdentity: "wid",
    remoteSessionId: "rid",
    command: { method: "recordingStatus", outputPath: "/virtual/out" },
  });
  const resultMessage = { requestId: "record", result };
  const handled = f.api.handleResult(resultMessage);
  assert.equal(observed.artifact, artifact);
  assert.deepEqual(plain(observed), {
    artifact,
    localPath: artifact.path,
    outputPath: "/virtual/out",
    workspacePath: "/virtual/work",
    workspaceIdentity: "wid",
    remoteSessionId: "rid",
  });
  const reused = f.api.execute({
    requestId: "record",
    sessionId: "s",
    command: { method: "screenshot" },
  });
  f.api.dispose();
  assert.equal((await reused).error.code, "backend_unavailable");
  const materialized = { path: "/virtual/out", extra: "materialized" };
  const currentData = { replacedDuringMaterialization: true };
  resultMessage.result = { ...result, extra: currentData };
  completeRecording(materialized);
  await handled;
  const finished = await recording;
  assert.equal(finished.recording.artifact, materialized);
  assert.equal(finished.extra, currentData);
  assert.equal(result.recording.artifact, artifact);
  const withoutOutput = f.api.execute({
    requestId: "strip",
    sessionId: "s",
    command: { method: "recordingStatus" },
  });
  await f.api.handleResult({ requestId: "strip", result });
  assert.equal(Object.hasOwn((await withoutOutput).recording, "artifact"), false);
  const pathError = new Error("synthetic-artifact-path-failure");
  const unreadable = f.api.execute({
    requestId: "unreadable",
    sessionId: "s",
    command: { method: "recordingStatus", outputPath: "/virtual/out" },
  });
  await f.api.handleResult({
    requestId: "unreadable",
    result: {
      ok: true,
      recording: {
        status: "completed",
        artifact: {
          get path() {
            throw pathError;
          },
        },
      },
    },
  });
  const failed = await unreadable;
  assert.equal(failed.error.code, "execution_error");
  assert.equal(failed.error.message, pathError.message);
  assert.equal(failed.error.sideEffect, "none");
});

function attachmentsFixture(failUpload = false) {
  const commands = [],
    uploads = [],
    failure = new Error("synthetic-upload-failure");
  const backend = {
    exec: async (command) => {
      commands.push(command);
      const listeners = { stdout: [], stderr: [] };
      return {
        stdout: { on: (_name, fn) => listeners.stdout.push(fn) },
        stderr: { on: (_name, fn) => listeners.stderr.push(fn) },
        onClose: (fn) => {
          queueMicrotask(() => {
            if (command === 'printf %s "$HOME"')
              for (const cb of listeners.stdout) cb(" /virtual/home///\n");
            fn(0);
          });
        },
      };
    },
    upload: async (...args) => {
      uploads.push(args);
      if (failUpload) throw failure;
    },
  };
  const api = load("attachments", {
    "@knorvia/server/remote/posixShell.js": { quotePosixPathArg: quote },
  });
  return { api, backend, commands, uploads, failure };
}
check(
  "attachments",
  "sequential staging preserves data and task/session proxy identity",
  async () => {
    const f = attachmentsFixture();
    const remote = {
      filename: "remote.png",
      localPath: "~/.knorvia-studio/tmp/prompt-attachments/trace/file",
      extra: { kept: true },
    };
    const local = {
      filename: "dir\\pic?.png",
      localPath: "/virtual/local/file",
      extra: { kept: true },
    };
    const attachments = [remote, local],
      options = { synthetic: true };
    const input = {
      taskId: "task",
      traceId: "trace ?/",
      content: local.localPath + " " + local.localPath,
      attachments,
    };
    const out = await f.api.materializeRemotePromptAttachments(input, {
      backend: f.backend,
      uploadOptions: options,
    });
    const expected =
      "/virtual/home/.knorvia-studio/tmp/prompt-attachments/trace/uuid-1/02-pic-.png";
    assert.deepEqual(f.uploads, [[local.localPath, expected, options]]);
    assert.equal(out.attachments[0], remote);
    assert.equal(out.attachments[1].extra, local.extra);
    assert.equal(out.attachments[1].localPath, expected);
    assert.equal(local.localPath, "/virtual/local/file");
    assert.equal(out.content, expected + " " + expected);
    assert.equal(out.uploadedCount, 1);
    assert.deepEqual(f.commands, [
      'printf %s "$HOME"',
      "mkdir -p " +
        quote(expected.slice(0, expected.lastIndexOf("/"))) +
        " && command chmod 700 " +
        [
          "/virtual/home/.knorvia-studio/tmp/prompt-attachments",
          "/virtual/home/.knorvia-studio/tmp/prompt-attachments/trace",
          "/virtual/home/.knorvia-studio/tmp/prompt-attachments/trace/uuid-1",
        ]
          .map(quote)
          .join(" "),
      "command chmod 600 " + quote(expected),
    ]);
    const calls = [],
      preparation = [];
    const service = {
      sendPrompt(...args) {
        calls.push({ receiver: this, args });
        return "sent";
      },
      enqueueTaskCommand(...args) {
        calls.push({ receiver: this, args });
        return "queued";
      },
      other: () => "other",
    };
    const materializePromptAttachments = async function (params) {
      assert.equal(typeof this, "object");
      assert.equal(this.materializePromptAttachments, materializePromptAttachments);
      preparation.push(params);
      return { content: "rewritten", attachments: out.attachments };
    };
    const taskOptions = { materializePromptAttachments };
    const task = f.api.createRemotePromptAttachmentTaskService(service, taskOptions);
    taskOptions.materializePromptAttachments = () => {
      throw new Error("original callback replaced");
    };
    assert.equal(task.other, service.other);
    assert.notEqual(task.sendPrompt, task.sendPrompt);
    const params = {
      taskId: "task",
      traceId: "trace",
      content: "draft",
      attachments,
      extra: { same: true },
    };
    assert.equal(await task.sendPrompt(params, "discard"), "sent");
    assert.equal(preparation[0].attachments, attachments);
    assert.equal(calls[0].receiver, service);
    assert.equal(calls[0].args.length, 1);
    assert.equal(calls[0].args[0].extra, params.extra);
    assert.equal(calls[0].args[0].content, "rewritten");
    const session = f.api.createRemotePromptAttachmentSessionService(service, {
      materializePromptAttachments,
    });
    const unqualified = { sessionId: "session", inputId: "", content: "draft" };
    await session.sendPrompt(unqualified, "preserved");
    assert.equal(calls[1].args[0], unqualified);
    assert.equal(calls[1].args[1], "preserved");
    assert.equal(preparation.length, 1);
    await session.sendPrompt({ sessionId: "session", content: "draft" });
    assert.equal(preparation[1].traceId, "session");
  },
);
check(
  "attachments",
  "lexical containment and failure cleanup preserve original cause",
  async () => {
    const f = attachmentsFixture(true);
    const stable = [
      { filename: "x", localPath: "   " },
      { filename: "y", localPath: "~/.knorvia-studio/tmp/prompt-attachments/a" },
    ];
    const unchanged = await f.api.materializeRemotePromptAttachments(
      { traceId: "t", content: "untouched", attachments: stable },
      { backend: f.backend },
    );
    assert.equal(unchanged.attachments, stable);
    assert.equal(f.commands.length, 0);
    const empty = { taskId: "t", traceId: "trace", content: "c", attachments: [], extra: "keep" };
    const emptyOut = await f.api.materializeRemotePromptAttachments(empty, { backend: f.backend });
    assert.equal(emptyOut.extra, "keep");
    assert.equal(emptyOut.attachments, empty.attachments);
    await assert.rejects(
      f.api.materializeRemotePromptAttachments(
        {
          traceId: "t",
          content: "/virtual/local",
          attachments: [{ filename: "image", localPath: "/virtual/local" }],
        },
        { backend: f.backend },
      ),
      (error) => error.cause === f.failure && error.message === "远端附件上传失败：image",
    );
    assert.equal(f.uploads[0].length, 2);
    assert.equal(f.commands.filter((x) => x === 'printf %s "$HOME"').length, 2);
    assert.equal(
      f.commands.at(-1),
      "rm -f Q(/virtual/home/.knorvia-studio/tmp/prompt-attachments/t/uuid-1/01-image) && rmdir Q(/virtual/home/.knorvia-studio/tmp/prompt-attachments/t/uuid-1) 2>/dev/null || true",
    );
    const n = f.commands.length;
    await f.api.cleanupRemotePromptAttachment(
      f.backend,
      "/virtual/home/.knorvia-studio/tmp/prompt-attachments-sibling/file",
    );
    assert.equal(f.commands.length, n + 1);
    await f.api.cleanupStaleRemotePromptAttachments(f.backend, 0.5);
    assert.equal(
      f.commands.at(-1),
      "if [ -d Q(/virtual/home/.knorvia-studio/tmp/prompt-attachments) ]; then find Q(/virtual/home/.knorvia-studio/tmp/prompt-attachments) -type f -mmin +1 -delete; find Q(/virtual/home/.knorvia-studio/tmp/prompt-attachments) -mindepth 1 -depth -type d -empty -delete; fi",
    );
  },
);

function collectionFixture() {
  const events = [],
    responses = [],
    errors = [],
    logs = [],
    entries = [];
  let handler, networkGetter;
  const setting = {
    get: async () => ({
      httpProxy: "synthetic-proxy",
      httpProxyNoProxy: "synthetic-exclusion",
      httpProxyCaCertPath: "/virtual/cert",
      memoryEnabled: true,
      askUserQuestionAutoResolutionEnabled: false,
      integratedTerminalShell: "synthetic-shell",
    }),
  };
  const agent = {
    onDynamicSessionRuntimePreferencesRequest: () => {
      events.push("subscribe-factory");
      return (fn) => {
        handler = fn;
        events.push("subscribe");
      };
    },
    respondSessionRuntimePreferences: async (message) => {
      responses.push(message);
    },
  };
  const connection = new Proxy(
    { agentService: agent },
    {
      get(target, key) {
        return Object.hasOwn(target, key) ? target[key] : { remote: String(key) };
      },
    },
  );
  class Collection {
    register(token, value) {
      entries.push([token, value]);
      return this;
    }
  }
  const services = new Proxy(
    { ServiceCollection: Collection },
    {
      get(target, key) {
        return Object.hasOwn(target, key) ? target[key] : String(key);
      },
    },
  );
  const nodes = {
    createServiceLogger: (scope) => {
      events.push("logger:" + scope);
      return Object.fromEntries(
        ["info", "warn", "debug"].map((level) => [level, (...args) => logs.push([level, ...args])]),
      );
    },
    createSettingService: () => {
      events.push("setting");
      return setting;
    },
    createCredentialService: () => {
      events.push("credential");
      return { local: "credential" };
    },
    createHostApiNetworkTransport: (getter) => {
      events.push("network");
      networkGetter = getter;
      return { local: "transport" };
    },
    createBroadcastService: (port) => {
      events.push("broadcast");
      return port;
    },
    createUsageStatsService: (params) => ({ local: "usage", params }),
    createSubagentsService: (params) => ({ local: "subagents", params }),
    createMemoryService: () => ({ local: "memory" }),
    createSettingsSyncService: (params) => ({ local: "sync", params }),
    registerHostApiNetworkTransportForDispose: (collection, transport) =>
      events.push(["dispose-association", collection, transport]),
  };
  const api = load("collection", {
    "@knorvia/services": services,
    "@knorvia/services/node": nodes,
    "@knorvia/shared": { DEFAULT_KNORVIA_MODEL_CONTEXT_BUDGET_STRATEGY: "synthetic-budget" },
    "./legacyRemoteWorkspaceRpcContract.js": {
      assertLegacyRemoteWorkspaceRpcContract: (value) => {
        assert.equal(value, connection);
        events.push("assert");
      },
    },
  });
  const port = { synthetic: "port" },
    transfer = { synthetic: "transfer" };
  const result = api.createRemoteWorkspaceServiceCollection({
    connectionServices: connection,
    sourceServices: {
      get ignored() {
        throw new Error("sourceServices observed");
      },
    },
    parentPort: port,
    createReportingRemoteKnorviaTaskService: (value) => {
      events.push("reporting");
      return { reporting: value };
    },
    createRemotePromptAttachmentTaskService: (value) => {
      events.push("attachment-task");
      return { attachment: value };
    },
    createRemotePromptAttachmentSessionService: (value) => {
      events.push("attachment-session");
      return { attachment: value };
    },
    promptAttachmentTransferService: transfer,
    runtimePreferencesBridge: { onError: (error) => errors.push(error) },
  });
  return {
    events,
    responses,
    errors,
    logs,
    entries,
    setting,
    agent,
    connection,
    result,
    port,
    transfer,
    dispatch: (request) => handler(request),
    network: () => networkGetter(),
  };
}
check(
  "collection",
  "ordered registry preserves local/remote authority and wrapper placement",
  async () => {
    const f = collectionFixture();
    assert.deepEqual(f.events.slice(0, 11), [
      "logger:remote-runtime-preferences",
      "assert",
      "setting",
      "credential",
      "network",
      "broadcast",
      "reporting",
      "attachment-task",
      "attachment-session",
      "subscribe-factory",
      "subscribe",
    ]);
    const tokens = [
      "IStudioRuntimeService",
      "IFileService",
      "IGitService",
      "IGitCheckpointService",
      "ISystemService",
      "ITerminalService",
      "ISettingService",
      "ICredentialService",
      "IBroadcastService",
      "IKnorviaTaskService",
      "IKnorviaAgentService",
      "IKnorviaSessionService",
      "IFileWatcherService",
      "IModelSelectionService",
      "IProviderSettingsService",
      "IUsageStatsService",
      "ISkillsService",
      "ISkillSyncService",
      "IMcpSyncService",
      "IPluginSyncService",
      "IPluginsService",
      "IPluginManagementService",
      "ICommandsService",
      "ISubagentsService",
      "IHooksService",
      "IMemoryService",
      "ISettingsSyncService",
      "IPromptAttachmentTransferService",
    ];
    assert.deepEqual(
      f.entries.map(([token]) => token),
      tokens,
    );
    const values = new Map(f.entries);
    assert.equal(values.get("ISettingService"), f.setting);
    assert.equal(values.get("IKnorviaAgentService"), f.agent);
    assert.equal(values.get("IBroadcastService"), f.port);
    assert.equal(values.get("IPromptAttachmentTransferService"), f.transfer);
    assert.equal(values.get("IKnorviaTaskService").attachment.reporting.remote, "taskService");
    assert.equal(values.get("IProviderSettingsService").remote, "providerSettingsService");
    assert.equal(values.get("IModelSelectionService").remote, "modelSelectionService");
    assert.equal(f.events.at(-1)[1], f.result);
    assert.deepEqual(plain(await f.network()), {
      httpProxy: "synthetic-proxy",
      noProxy: "synthetic-exclusion",
      caCertPath: "/virtual/cert",
    });
  },
);
check(
  "collection",
  "runtime preferences retain settings authority and response failure identity",
  async () => {
    const f = collectionFixture();
    const request = { requestId: "request", sessionId: "session", scope: "user-execution" };
    assert.equal(f.dispatch(request), undefined);
    await flush();
    assert.deepEqual(plain(f.responses[0]), {
      requestId: "request",
      resolution: {
        status: "resolved",
        preferences: {
          askUserQuestionAutoResolutionEnabled: false,
          nativeSearchEnhancementsEnabled: true,
          memoryEnabled: true,
          modelContextBudgetStrategy: "synthetic-budget",
          integratedTerminalShell: "synthetic-shell",
        },
      },
    });
    const readFailure = new Error("synthetic-setting-failure");
    f.setting.get = () => Promise.reject(readFailure);
    f.dispatch({ requestId: "failed-setting", sessionId: "session", scope: "other" });
    await flush();
    assert.deepEqual(plain(f.responses[1]), {
      requestId: "failed-setting",
      resolution: { status: "failed", message: readFailure.message },
    });
    const responseFailure = new Error("synthetic-response-failure");
    f.setting.get = async () => ({
      memoryEnabled: "true",
      integratedTerminalShell: "synthetic-shell",
    });
    f.agent.respondSessionRuntimePreferences = async (message) => {
      f.responses.push(message);
      throw responseFailure;
    };
    f.dispatch({ requestId: "failed-send", sessionId: "session", scope: "cached" });
    await flush();
    assert.equal(f.responses.length, 3);
    assert.equal(
      Object.hasOwn(f.responses[2].resolution.preferences, "integratedTerminalShell"),
      false,
    );
    assert.equal(f.responses[2].resolution.preferences.memoryEnabled, false);
    assert.equal(f.errors[0], responseFailure);
    assert.equal(f.logs.at(-1)[2], "runtime preferences host response failed");
  },
);
