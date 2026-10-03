// Synthetic data and virtual ports only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { load, plain, syntheticError } from "./shared-authority-fixture.mjs";

test("origin owner preserves positive trust, credential denial and resolver authority", async () => {
  const owner = await load("official-mcp-auth");
  assert.deepEqual(plain(owner.findOfficialMcpReservedHeaders(null)), []);
  const decide = (origin, knorviaApiOrigin, devTrustedOriginsRaw) =>
    plain(
      owner.isOfficialMcpOriginTrusted({
        origin,
        knorviaApiOrigin,
        devTrustedOriginsRaw,
        pluginId: "synthetic-plugin",
      }),
    );
  assert.deepEqual(
    decide("https://synthetic.example/path?q=1", "https://synthetic.example/other"),
    { detail: "ok", trusted: true },
  );
  assert.deepEqual(
    decide("https://user:synthetic@synthetic.example", "https://synthetic.example"),
    { detail: "origin_mismatch", trusted: false },
  );
  assert.deepEqual(decide("https://outside.example", undefined, "https://outside.example"), {
    detail: "knorvia_origin_unresolved",
    trusted: false,
  });
  assert.deepEqual(decide("http://127.0.0.1:3999/x", undefined, " http://127.0.0.1:3999 "), {
    detail: "ok",
    trusted: true,
  });
  assert.deepEqual(decide("http://127.0.0.1:4000", undefined, "http://127.0.0.1:3999"), {
    detail: "knorvia_origin_unresolved",
    trusted: false,
  });
  assert.deepEqual(decide("  ", "https://synthetic.example"), {
    detail: "invalid_input",
    trusted: false,
  });
  const options = {
    devTrustedOriginsRaw: "http://localhost:3999",
    calls: 0,
    async resolveKnorviaApiOrigin() {
      assert.equal(this, options);
      this.calls += 1;
      throw syntheticError("resolver");
    },
  };
  const registry = owner.createOfficialMcpTrustedOriginRegistry(options);
  assert.deepEqual(
    plain(
      await registry.isTrusted({ origin: "http://localhost:3999", pluginId: "p", mcpKey: "k" }),
    ),
    { detail: "knorvia_origin_unresolved", trusted: false },
  );
  options.resolveKnorviaApiOrigin = async () => undefined;
  options.devTrustedOriginsRaw = "http://localhost:4000";
  assert.equal(
    (await registry.isTrusted({ origin: "http://localhost:4000", pluginId: "p", mcpKey: "k" }))
      .trusted,
    true,
  );
  assert.equal(options.calls, 1);
  assert.deepEqual(
    plain(
      owner.summarizeOfficialMcpIdentityHeaders({
        Authorization: "synthetic-never-log",
        "Bigmodel-Organization": "synthetic-org",
        "Bigmodel-Target-Type": "TEAM",
      }),
    ),
    {
      identityHeaderNames: ["authorization", "bigmodel-organization", "bigmodel-target-type"],
      identityOrganizationPresent: true,
      identityProjectPresent: false,
      identityTeamPaired: false,
      identityTargetType: "TEAM",
    },
  );
});

test("environment owner isolates paired capture and forbids authority passthrough restoration", async () => {
  const owner = await load("runtimeEnv");
  const input = {
    KNORVIA_CUA_PERMISSION_BROKER_SOCKET: " synthetic-socket ",
    KNORVIA_CUA_PLUGIN_AUTHORITY: " synthetic-authority ",
    KNORVIA_CUA_PERMISSION_BROKER_REFRESH_MARKER: " synthetic-refresh ",
    OTEL_SERVICE_NAME: " synthetic-agent ",
    HTTP_PROXY: "synthetic-proxy",
    npm_config_ca: "synthetic-ca",
    Keep: "",
    Missing: undefined,
  };
  assert.deepEqual(plain(owner.sanitizeKnorviaRuntimeEnv(input)), { Keep: "" });
  assert.equal(input.HTTP_PROXY, "synthetic-proxy");
  assert.deepEqual(plain(owner.getCapturedKnorviaCuaBrokerCredentials()), {
    socket: "synthetic-socket",
    pluginAuthority: "synthetic-authority",
    refreshMarker: "synthetic-refresh",
  });
  owner.getCapturedKnorviaCuaBrokerCredentials().socket = "caller-copy";
  owner.sanitizeKnorviaRuntimeEnv({});
  assert.equal(owner.getCapturedKnorviaCuaBrokerCredentials().socket, "synthetic-socket");
  owner.sanitizeKnorviaRuntimeEnv({ KNORVIA_CUA_PLUGIN_AUTHORITY: "new-half" });
  const missing = owner.getCapturedKnorviaCuaBrokerCredentials();
  assert.deepEqual(Object.keys(missing), ["socket", "pluginAuthority"]);
  assert.equal(missing.socket, undefined);
  assert.equal(missing.pluginAuthority, undefined);
  owner.sanitizeKnorviaRuntimeEnv({
    OTEL_SERVICE_NAME: "",
    OTEL_EXPORTER_OTLP_HEADERS: " synthetic-header ",
  });
  assert.deepEqual(plain(owner.getCapturedKnorviaAgentTelemetryEnv()), {
    OTEL_SERVICE_NAME: "synthetic-agent",
    OTEL_EXPORTER_OTLP_HEADERS: "synthetic-header",
  });
  const pass = owner.buildKnorviaToolEnvPassthroughEnv({
    KNORVIA_TOOL_ENV_PASSTHROUGH_JSON: JSON.stringify({
      HTTP_PROXY: "old",
      KNORVIA_CUA_PLUGIN_AUTHORITY: "blocked",
      OTEL_SERVICE_NAME: "blocked",
      "invalid-key": "blocked",
      NO_PROXY: "prior",
    }),
    HTTP_PROXY: "new",
    NODE_ENV: "test",
    KNORVIA_CUA_PERMISSION_BROKER_SOCKET: "blocked",
    KNORVIA_CUA_PERMISSION_BROKER_TOKEN: "synthetic-legacy-policy",
  });
  assert.deepEqual(JSON.parse(pass.KNORVIA_TOOL_ENV_PASSTHROUGH_JSON), {
    HTTP_PROXY: "new",
    KNORVIA_CUA_PERMISSION_BROKER_TOKEN: "synthetic-legacy-policy",
    NO_PROXY: "prior",
  });
  const inPlace = { http_proxy: "synthetic", npm_config_cafile: "synthetic", Keep: undefined };
  owner.sanitizeKnorviaRuntimeEnvInPlace(inPlace);
  assert.deepEqual(Object.keys(inPlace), ["Keep"]);
  assert.equal(owner.shouldCaptureKnorviaToolEnvPassthroughKey("OTEL_UNLISTED"), false);
  assert.equal(owner.shouldSanitizeKnorviaRuntimeEnvKey("OTEL_UNLISTED"), false);
  owner.resetCapturedKnorviaAgentTelemetryEnvForTest();
  assert.deepEqual(plain(owner.getCapturedKnorviaAgentTelemetryEnv()), {});
});

test("settings owner preserves legacy migration and tolerant reads versus strict patches", async () => {
  const owner = await load("validationAppSettings");
  const settings = owner.appSettingsSchema.parse({
    locale: "en-US",
    closeToTrayOnWindows: false,
    messageStreamShowReasoning: false,
    desktopWindowSize: { width: 1 },
    embeddedBrowserViewportPreference: { width: -1, height: 600 },
    knorviaEndpointOrigin: "https://synthetic.example/path",
    lastWorkspaceSession: [
      { kind: "local", workspacePath: "/synthetic/local", workspacePurpose: "conversation" },
      { kind: "remote", historyId: "r" },
    ],
    lastOpenTabs: ["/synthetic/local", "/synthetic/extra", "/synthetic/extra", 9],
    remoteWorkspaceHistory: [
      {
        id: "r",
        workspacePath: "/synthetic/remote",
        workspaceIdentity: "synthetic-identity",
        target: {
          kind: "ssh",
          host: "synthetic.example",
          username: "synthetic",
          resourcePackages: { selectedPackageIds: ["retired"] },
        },
        lastOpenedAt: 1,
        lastConnectionStatus: "failed",
        lastConnectionError: "synthetic-failure",
      },
    ],
  });
  assert.equal(settings.localePreference, "en-US");
  assert.equal(settings.closeToTrayOnWindows, true);
  assert.equal(settings.messageStreamShowReasoning, true);
  assert.equal(settings.desktopWindowSize, undefined);
  assert.deepEqual(settings.embeddedBrowserViewportPreference, { width: 800, height: 600 });
  assert.equal(settings.knorviaEndpointOrigin, "https://synthetic.example");
  assert.deepEqual(
    settings.lastWorkspaceSession.map((entry) => entry.workspacePath),
    ["/synthetic/local", "/synthetic/remote", "/synthetic/extra", "/synthetic/extra"],
  );
  assert.deepEqual(settings.lastWorkspaceSession[1].target, {
    kind: "ssh",
    host: "synthetic.example",
    username: "synthetic",
  });
  assert.equal(settings.lastWorkspaceSession[1].workspaceIdentity, "synthetic-identity");
  assert.equal("remoteWorkspaceHistory" in settings, false);
  const current = owner.appSettingsSchema.parse({
    closeToTrayOnWindows: false,
    closeToTrayOnWindowsMigrationInitialized: true,
    messageStreamShowReasoning: false,
    messageStreamShowReasoningMigrationInitialized: true,
    knorviaEndpointOrigin: "invalid",
  });
  assert.equal(current.closeToTrayOnWindows, false);
  assert.equal(current.messageStreamShowReasoning, false);
  assert.equal(current.knorviaEndpointOrigin, undefined);
  assert.equal(
    owner.appSettingsPatchSchema.safeParse({ desktopWindowSize: { width: 1 } }).success,
    false,
  );
  assert.equal(
    owner.appSettingsPatchSchema.safeParse({
      embeddedBrowserViewportPreference: { width: -1, height: 600 },
    }).success,
    false,
  );
  assert.equal(owner.appSettingsSchema.safeParse({ lastWorkspaceSession: "bad" }).success, false);
});
