import { assert, plain, flush, check, collectionFixture } from "./behaviorOwners.fixture.mjs";

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
