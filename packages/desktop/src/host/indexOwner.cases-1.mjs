import { assert, plain, defer, drain, check, harness } from "./indexOwner.fixture.mjs";

check("startup", async () => {
  const h = harness({ platform: "win32" });
  assert.equal(h.fakeProcess.title, "host-synthetic-window");
  for (const level of ["log", "warn", "error"])
    h.fakeConsole[level]({ synthetic: true }, { second: true });
  assert.deepEqual(
    h.events.filter((event) => typeof event === "string" && event.startsWith("factory:")),
    [
      "factory:browser",
      "factory:repo",
      "factory:network",
      "factory:self",
      "factory:tracker",
      "factory:logger",
      "factory:usage",
      "factory:registry",
      "factory:controller",
      "factory:attachment",
    ],
  );
  await h.invalid();
  await h.send({ type: "InitLocal" });
  assert.equal(h.control.startupOptions, null);
  const base = new h.Port(),
    env = { SYNTHETIC_ENV: "value" };
  const targets = [
    { workspacePath: "/one", workspaceIdentity: "one" },
    { workspacePath: "/two", workspaceIdentity: "two" },
  ];
  const initial = h.send(
    {
      type: "InitLocal",
      databaseStartupId: "startup",
      runtimeProcessEnvPatch: env,
      agentWarmupTargets: targets,
      deviceMid: "synthetic-device",
    },
    base,
  );
  const queued = new h.Port(),
    detached = new h.Port();
  await h.send(
    {
      type: "AttachServicePort",
      requestId: "queued",
      attachmentId: "queued",
      clientMode: "web-remote-replayable",
      scope: { kind: "local" },
    },
    queued,
  );
  await h.send(
    {
      type: "AttachServicePort",
      requestId: "gone",
      attachmentId: "gone",
      clientMode: "desktop-continuous",
      scope: { kind: "local" },
    },
    detached,
  );
  detached.close();
  const duplicate = new h.Port();
  await h.send({ type: "InitLocal" }, duplicate);
  assert.equal(duplicate.closed, true);
  assert.equal(h.events.filter((event) => event === "startup-start").length, 1);
  assert.equal(h.control.backendLoads, 0);
  h.control.startupGate.resolve();
  await initial;
  assert.equal(h.control.startupOptions.env, env);
  assert.deepEqual(plain(h.control.startupOptions.workingDirectories), ["/one", "/two"]);
  assert.equal(h.control.localOptions.runtimeProcessEnvPatch, env);
  assert.equal(h.control.localOptions.serviceAuthorityMode, "desktop-local");
  assert.equal(h.control.localOptions.agentRuntimeContext.getDeviceMid(), "synthetic-device");
  assert.equal(typeof h.control.localOptions.cuaOperationStateReporter.onStateChanged, "function");
  const cuaEvent = { synthetic: true };
  h.control.localOptions.cuaOperationStateReporter.onStateChanged(cuaEvent);
  assert.deepEqual(plain(h.messages.at(-1)), { type: "CuaOperationState", ...cuaEvent });
  const attached = h.events.filter((event) => Array.isArray(event) && event[0] === "attach");
  assert.equal(attached.length, 2);
  assert.equal(attached[0][1].port, base);
  assert.equal(attached[1][1].port, queued);
  assert.equal(h.scopes[1].options.clientMode, "web-remote-replayable");
  assert.deepEqual(
    h.events
      .filter((event) => Array.isArray(event) && event[0] === "warmup")
      .map((event) => plain(event[1])),
    targets,
  );
  const authority = h.control.localOptions.authorizeLocalMediaPreviewPath("synthetic-media");
  const request = h.messages.find(
    (message) => message.type === "LocalMediaPreviewPathAuthorizeRequest",
  );
  await h.send({
    type: "LocalMediaPreviewPathAuthorizeResult",
    requestId: request.requestId,
    ok: true,
    path: "synthetic-approved",
  });
  assert.equal(await authority, "synthetic-approved");
  h.control.localOptions.processLifecycleReporter.onExit({ signal: undefined, pid: 999 });
  assert.equal(h.messages.at(-1).signal, null);
  const snapshots = h.messages.filter((message) => message.type === "DatabaseStartupState").length;
  await h.send({ type: "DatabaseStartupControl", control: { action: "snapshot" } });
  assert.equal(
    h.messages.filter((message) => message.type === "DatabaseStartupState").length,
    snapshots + 1,
  );
  await h.send({
    type: "DatabaseStartupControl",
    control: { action: "retry", attemptId: "original-attempt" },
  });
  assert.deepEqual(h.events.at(-1), ["retry", "original-attempt"]);
});
check("remote", async () => {
  const h = harness();
  await h.init();
  assert.equal(h.control.backendLoads, 0);
  const session = await h.connect();
  assert.equal(h.control.backendLoads, 1);
  assert.equal(h.control.remoteOptions.appVersion, "synthetic-version");
  assert.equal(h.control.remoteOptions.deployLockMode, "caller-serialized");
  assert.equal(h.control.remoteOptions.remoteRuntimeNetwork, undefined);
  assert.equal(typeof h.control.remoteOptions.remoteAssetNetwork.fetch, "function");
  assert.deepEqual(plain(h.control.remoteOptions.remoteRuntimeEnv), {
    SYNTHETIC_PUBLIC_ENV: "value",
  });
  const scope = {
    kind: "remote",
    remoteSessionId: session.remoteSessionId,
    workspacePath: session.workspacePath,
    workspaceIdentity: session.workspaceIdentity,
  };
  const denied = new h.Port();
  await h.send(
    {
      type: "AttachServicePort",
      requestId: "bad",
      attachmentId: "bad",
      clientMode: "desktop-continuous",
      scope: { ...scope, workspaceIdentity: "remote:other" },
    },
    denied,
  );
  assert.equal(denied.closed, true);
  assert.equal(
    h.events.filter(
      (event) => Array.isArray(event) && event[0] === "attach" && event[1].attachmentId === "bad",
    ).length,
    0,
  );
  const gate = defer();
  h.control.attachWait = gate;
  const desktop = new h.Port(),
    waiting = h.send(
      {
        type: "AttachServicePort",
        requestId: "desktop",
        attachmentId: "desktop",
        clientMode: "desktop-continuous",
        scope,
      },
      desktop,
    );
  await drain();
  assert.equal(h.control.exposures.length, 1);
  gate.resolve();
  await waiting;
  assert.equal(h.control.mediaOptions.scope, scope);
  const limiter = h.control.mediaOptions.requestLimiter;
  assert.deepEqual(plain(limiter.getState()), { active: 0, limit: 4 });
  for (let index = 0; index < 4; index++) assert.equal(limiter.tryAcquire(), true);
  assert.equal(limiter.tryAcquire(), false);
  assert.deepEqual(plain(limiter.getState()), { active: 4, limit: 4 });
  for (let index = 0; index < 5; index++) limiter.release();
  assert.deepEqual(plain(limiter.getState()), { active: 0, limit: 4 });
  const mobile = new h.Port();
  await h.send(
    {
      type: "AttachServicePort",
      requestId: "mobile",
      attachmentId: "mobile",
      clientMode: "web-remote-replayable",
      scope,
    },
    mobile,
  );
  assert.equal(
    h.events.filter((event) => Array.isArray(event) && event[0] === "media-create").length,
    1,
  );
  await h.send({
    type: "BindRemoteWorkspaceContext",
    remoteSessionId: session.remoteSessionId,
    workspacePath: "/new",
    workspaceIdentity: "remote:new",
  });
  assert.ok(
    h.events.some((event) => Array.isArray(event) && event[0] === "detach-stale" && event[2] === 2),
  );
  assert.ok(
    h.events.some(
      (event) =>
        Array.isArray(event) &&
        event[0] === "remove-source" &&
        event[1].workspaceIdentity === "remote:identity",
    ),
  );
  const artifact = { path: "synthetic-artifact", nested: {} };
  assert.throws(
    () =>
      h.control.browserOptions.materializeRecording({
        artifact,
        workspacePath: "/new",
        remoteSessionId: session.remoteSessionId,
      }),
    /requires workspaceIdentity/,
  );
  const result = await h.control.browserOptions.materializeRecording({
    artifact,
    workspacePath: "/new",
    workspaceIdentity: "remote:new",
    remoteSessionId: session.remoteSessionId,
  });
  assert.equal(result, artifact);
  assert.equal(
    h.events.find((event) => Array.isArray(event) && event[0] === "recording")[1].remoteBackend,
    h.control.remoteHandle.capabilities.browserRecordingUploader,
  );
  const materialized = await h.control.taskMaterializer({
    taskId: "task",
    traceId: "trace",
    content: "synthetic-content",
    attachments: [],
  });
  assert.equal(materialized.content, "prepared:synthetic-content");
  h.control.registryOptions.onSessionClosed({
    remoteSessionId: session.remoteSessionId,
    exitCode: 5,
    signal: null,
  });
  const close = h.messages.findLast((message) => message.type === "RemoteWorkspaceClosed");
  assert.equal(close.reason, "connection-closed");
  assert.equal(close.exitCode, 5);
  assert.equal(
    h.control.controllerOptions.resolveSource({
      workspacePath: "/missing",
      workspaceIdentity: "remote:missing",
    }),
    null,
  );
});
