// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
import assert from "node:assert/strict";
import { join } from "node:path";
import { before, describe, test } from "node:test";
import type {
  KnorviaOfficialMcpAuthConfig,
  McpOfficialProvenance,
  McpServerConfig,
  PluginDiagnostic,
  PluginManifest,
  PluginOptionValues,
} from "@knorvia/contracts";
import { bindTarget, type BoundTarget } from "../src/harness/target-binder.js";
import {
  adapterFrom,
  baseRequest,
  createSandbox,
  exportedFunction,
  setupPorts,
  writePlugin,
} from "./support/fixtures.js";

interface LoadedPluginFixture {
  readonly id: string;
  readonly manifest: PluginManifest;
  readonly manifestPath: string;
  readonly marketplace: string;
  readonly rootPath: string;
  readonly source: "cache" | "inline" | "official";
}

type LoadDefinitions = (input: {
  diagnostics: PluginDiagnostic[];
  loaded: LoadedPluginFixture;
}) => Record<string, unknown>;

type ResolveServers = (input: {
  dataPath: string;
  definitions?: Record<string, unknown>;
  diagnostics: PluginDiagnostic[];
  env: Record<string, string | undefined>;
  loaded: LoadedPluginFixture;
  options: PluginOptionValues;
  workingDirectory: string;
}) => Record<string, McpServerConfig>;

let indexTarget: BoundTarget | undefined;
let mcpTarget: BoundTarget | undefined;
let authTarget: BoundTarget | undefined;

function required(value: BoundTarget | undefined, name: string): BoundTarget {
  if (value === undefined) throw new Error(`${name} target was not bound`);
  return value;
}

function loaded(
  root: string,
  manifest: PluginManifest,
  marketplace = "inline",
  source: LoadedPluginFixture["source"] = "inline",
): LoadedPluginFixture {
  return {
    id: `${manifest.name}@${marketplace}`,
    manifest,
    manifestPath: join(root, ".knorvia-plugin", "plugin.json"),
    marketplace,
    rootPath: root,
    source,
  };
}

function resolver(): ResolveServers {
  return exportedFunction<ResolveServers>(required(mcpTarget, "mcp"), "resolvePluginMcpServers");
}

function resolveFixture(
  plugin: LoadedPluginFixture,
  definitions: Record<string, unknown>,
  overrides: Partial<{
    dataPath: string;
    env: Record<string, string | undefined>;
    options: PluginOptionValues;
    workingDirectory: string;
  }> = {},
): { diagnostics: PluginDiagnostic[]; servers: Record<string, McpServerConfig> } {
  const diagnostics: PluginDiagnostic[] = [];
  const servers = resolver()({
    dataPath: overrides.dataPath ?? join(plugin.rootPath, ".data"),
    definitions,
    diagnostics,
    env: overrides.env ?? {},
    loaded: plugin,
    options: overrides.options ?? {},
    workingDirectory: overrides.workingDirectory ?? join(plugin.rootPath, ".working"),
  });
  return { diagnostics, servers };
}

before(async () => {
  [indexTarget, mcpTarget, authTarget] = await Promise.all([
    bindTarget("index"),
    bindTarget("mcp"),
    bindTarget("mcp-official-auth"),
  ]);
});

describe("MCP declarations, templates and authority", { concurrency: false }, () => {
  test("MCP-01: manifest definitions merge after .mcp.json and override duplicate server keys", (context) => {
    const sandbox = createSandbox(context);
    const manifest: PluginManifest = {
      mcpServers: {
        duplicate: { type: "http", url: "https://manifest.invalid/mcp" },
        manifestOnly: { command: "manifest-runner" },
      },
      name: "merged-mcp",
    };
    const root = writePlugin(sandbox, "merged-mcp", manifest, {
      ".mcp.json": `${JSON.stringify({
        mcpServers: {
          duplicate: { type: "http", url: "https://file.invalid/mcp" },
          fileOnly: { command: "file-runner" },
        },
      })}\n`,
    });
    const diagnostics: PluginDiagnostic[] = [];
    const loadDefinitions = exportedFunction<LoadDefinitions>(
      required(mcpTarget, "mcp"),
      "loadPluginMcpServerDefinitions",
    );

    const definitions = loadDefinitions({ diagnostics, loaded: loaded(root, manifest) });
    assert.deepEqual(Object.keys(definitions).sort(), ["duplicate", "fileOnly", "manifestOnly"]);
    assert.deepEqual(definitions.duplicate, {
      type: "http",
      url: "https://manifest.invalid/mcp",
    });
    assert.deepEqual(diagnostics, []);
  });

  test("MCP-01: manifest path and array sources merge in declaration order", (context) => {
    const sandbox = createSandbox(context);
    const manifest: PluginManifest = {
      mcpServers: [
        "./mcp/first.json",
        "./mcp/second.json",
        { inlineOnly: { command: "inline-runner", type: "stdio" } },
      ],
      name: "array-mcp",
    };
    const root = writePlugin(sandbox, "array-mcp", manifest, {
      "mcp/first.json": `${JSON.stringify({
        firstOnly: { command: "first-runner" },
        overridden: { command: "first-value" },
      })}\n`,
      "mcp/second.json": `${JSON.stringify({
        overridden: { command: "second-value" },
        secondOnly: { command: "second-runner" },
      })}\n`,
    });
    const diagnostics: PluginDiagnostic[] = [];
    const loadDefinitions = exportedFunction<LoadDefinitions>(
      required(mcpTarget, "mcp"),
      "loadPluginMcpServerDefinitions",
    );

    const definitions = loadDefinitions({ diagnostics, loaded: loaded(root, manifest) });
    assert.deepEqual(Object.keys(definitions).sort(), [
      "firstOnly",
      "inlineOnly",
      "overridden",
      "secondOnly",
    ]);
    assert.deepEqual(definitions.overridden, { command: "second-value" });
    assert.deepEqual(diagnostics, []);
  });

  test("MCP-02: one invalid server is diagnosed without disabling valid siblings", (context) => {
    const sandbox = createSandbox(context);
    const manifest: PluginManifest = { name: "partial-mcp" };
    const root = writePlugin(sandbox, "partial-mcp", manifest);
    const { diagnostics, servers } = resolveFixture(loaded(root, manifest), {
      bad: { type: "stdio" },
      filteredArgs: { args: [42], command: "filtered", type: "stdio" },
      good: { command: "runner", type: "stdio" },
    });

    assert.deepEqual(Object.keys(servers).sort(), [
      "plugin:partial-mcp:filteredArgs",
      "plugin:partial-mcp:good",
    ]);
    assert.deepEqual((servers["plugin:partial-mcp:filteredArgs"] as { args?: string[] }).args, []);
    assert.ok(
      diagnostics.some(
        (item) =>
          item.code === "plugin_mcp_server_disabled" && item.pluginId === "partial-mcp@inline",
      ),
    );
  });

  test("MCP-03: metadata keeps raw names while runtime keys are namespaced", (context) => {
    const sandbox = createSandbox(context);
    const root = writePlugin(sandbox, "namespaced", {
      mcpServers: {
        alpha: { command: "alpha-runner" },
        beta: { type: "http", url: "https://example.invalid/mcp" },
      },
      name: "namespaced",
    });
    setupPorts();

    const outcome = adapterFrom(
      required(indexTarget, "index"),
      sandbox.storage,
    ).discoverPluginsSync(baseRequest(sandbox, [root]));
    assert.deepEqual(outcome.plugins[0]?.declaredMcpServerNames, ["alpha", "beta"]);
    assert.deepEqual(outcome.plugins[0]?.mcpServerNames, [
      "plugin:namespaced:alpha",
      "plugin:namespaced:beta",
    ]);
    assert.deepEqual(Object.keys(outcome.mcpServers), [
      "plugin:namespaced:alpha",
      "plugin:namespaced:beta",
    ]);
  });

  test("MCP-04: missing variables disable one server while unavailable context variables remain literal", (context) => {
    const sandbox = createSandbox(context);
    const manifest: PluginManifest = {
      name: "template-policy",
      userConfig: { required: { required: true, type: "string" } },
    };
    const root = writePlugin(sandbox, "template-policy", manifest);
    const { diagnostics, servers } = resolveFixture(
      loaded(root, manifest),
      {
        missing: {
          type: "http",
          url: "https://example.invalid/${user_config.required}",
        },
        preserved: {
          args: [
            "${session.id}",
            "${skill.path}",
            "${unknown.value}",
            "${PUBLIC_VALUE}",
            "${env.PUBLIC_VALUE}",
          ],
          command: "runner",
          type: "stdio",
        },
      },
      { env: { PUBLIC_VALUE: "public" } },
    );

    assert.equal(servers["plugin:template-policy:missing"], undefined);
    assert.deepEqual((servers["plugin:template-policy:preserved"] as { args?: string[] }).args, [
      "${session.id}",
      "${skill.path}",
      "${unknown.value}",
      "${PUBLIC_VALUE}",
      "${env.PUBLIC_VALUE}",
    ]);
    assert.ok(diagnostics.some((item) => item.code === "plugin_variable_missing"));
  });

  test("MCP-05: plugin/data/working/env/user-config templates resolve in supported positions", (context) => {
    const sandbox = createSandbox(context);
    const manifest: PluginManifest = {
      name: "resolved-templates",
      userConfig: {
        profile: { type: "string" },
      },
    };
    const root = writePlugin(sandbox, "resolved-templates", manifest);
    const dataPath = join(sandbox.storage, "custom-data");
    const { diagnostics, servers } = resolveFixture(
      loaded(root, manifest),
      {
        stdio: {
          args: [
            "${KNORVIA_PLUGIN_ROOT}",
            "${KNORVIA_PLUGIN_DATA}",
            "${KNORVIA_PROJECT_DIR}",
            "${user_config.profile}",
          ],
          command: "runner",
          type: "stdio",
        },
      },
      {
        dataPath,
        env: { PUBLIC_VALUE: "public" },
        options: { profile: "dev" },
        workingDirectory: sandbox.working,
      },
    );
    assert.deepEqual((servers["plugin:resolved-templates:stdio"] as { args?: string[] }).args, [
      root,
      dataPath,
      sandbox.working,
      "dev",
    ]);
    assert.deepEqual(diagnostics, []);
  });

  test("MCP-06: sensitive user config is accepted in headers/env but rejected in URL, command and args", (context) => {
    const sandbox = createSandbox(context);
    const manifest: PluginManifest = {
      name: "sensitive-policy",
      userConfig: {
        token: { sensitive: true, type: "string" },
      },
    };
    const root = writePlugin(sandbox, "sensitive-policy", manifest);
    const { diagnostics, servers } = resolveFixture(
      loaded(root, manifest),
      {
        argLeak: { args: ["${user_config.token}"], command: "runner", type: "stdio" },
        commandLeak: { command: "${user_config.token}", type: "stdio" },
        headerAllowed: {
          headers: { "X-Plugin-Token": "${user_config.token}" },
          type: "http",
          url: "https://example.invalid/mcp",
        },
        stdioEnvAllowed: {
          command: "runner",
          env: { TOKEN: "${user_config.token}" },
          type: "stdio",
        },
        urlLeak: { type: "http", url: "https://example.invalid/${user_config.token}" },
      },
      { options: { token: "secret-value" } },
    );
    assert.deepEqual(Object.keys(servers).sort(), [
      "plugin:sensitive-policy:headerAllowed",
      "plugin:sensitive-policy:stdioEnvAllowed",
    ]);
    assert.equal(
      (servers["plugin:sensitive-policy:headerAllowed"] as { headers?: Record<string, string> })
        .headers?.["X-Plugin-Token"],
      "secret-value",
    );
    assert.equal(
      (servers["plugin:sensitive-policy:stdioEnvAllowed"] as { env?: Record<string, string> }).env
        ?.TOKEN,
      "secret-value",
    );
    assert.ok(diagnostics.filter((item) => item.code === "plugin_variable_missing").length >= 3);
  });

  test("MCP-07: host plugin ID overwrites a forged stdio env value", (context) => {
    const sandbox = createSandbox(context);
    const manifest: PluginManifest = { name: "host-id" };
    const root = writePlugin(sandbox, "host-id", manifest);
    const { servers } = resolveFixture(loaded(root, manifest), {
      stdio: {
        command: "runner",
        env: { KNORVIA_PLUGIN_ID: "forged@attacker", OTHER: "kept" },
        type: "stdio",
      },
    });
    const env = (servers["plugin:host-id:stdio"] as { env?: Record<string, string> }).env;
    assert.ok(env);
    assert.equal(env.KNORVIA_PLUGIN_ID, "host-id@inline");
    assert.equal(env.OTHER, "kept");
    assert.equal(env.KNORVIA_PLUGIN_ROOT, root);
    assert.equal(env.KNORVIA_PLUGIN_DATA, join(root, ".data"));
    assert.equal(env.KNORVIA_PROJECT_DIR, join(root, ".working"));
    assert.equal(env.CLAUDE_PLUGIN_ROOT, root);
    assert.equal(env.CLAUDE_PLUGIN_DATA, join(root, ".data"));
  });

  test("MCP-08: official installed/cache origin is builtin and third-party origin is plugin", (context) => {
    const sandbox = createSandbox(context);
    const manifest: PluginManifest = { name: "source-authority" };
    const root = writePlugin(sandbox, "source-authority", manifest);
    const definitions = { server: { command: "runner", type: "stdio" } };
    const official = resolveFixture(
      loaded(root, manifest, "knorvia-plugins-bundled", "cache"),
      definitions,
    ).servers["plugin:source-authority:server"];
    const community = resolveFixture(loaded(root, manifest, "community", "cache"), definitions)
      .servers["plugin:source-authority:server"];
    assert.deepEqual(official?.source, { kind: "builtin" });
    assert.deepEqual(community?.source, { kind: "plugin" });
  });

  test("MCP-09: environment templates distinguish sensitive and ordinary sinks", (context) => {
    const sandbox = createSandbox(context);
    const manifest: PluginManifest = { name: "environment-templates" };
    const root = writePlugin(sandbox, "environment-templates", manifest);
    const { diagnostics, servers } = resolveFixture(
      loaded(root, manifest),
      {
        missingKnorvia: {
          args: ["${KNORVIA_MISSING}"],
          command: "runner",
          type: "stdio",
        },
        sensitiveHeader: {
          headers: { "X-Public": "${PUBLIC_VALUE}" },
          type: "http",
          url: "https://example.invalid/mcp",
        },
        stdio: {
          args: [
            "${PUBLIC_VALUE}",
            "${env.PUBLIC_VALUE}",
            "${env:PUBLIC_VALUE}",
            "${KNORVIA_CUSTOM}",
          ],
          command: "runner",
          env: {
            BARE: "${PUBLIC_VALUE}",
            COLON: "${env:PUBLIC_VALUE}",
            CUSTOM: "${KNORVIA_CUSTOM}",
            DOT: "${env.PUBLIC_VALUE}",
          },
          type: "stdio",
        },
      },
      { env: { KNORVIA_CUSTOM: "custom", PUBLIC_VALUE: "public" } },
    );

    assert.deepEqual(Object.keys(servers).sort(), [
      "plugin:environment-templates:sensitiveHeader",
      "plugin:environment-templates:stdio",
    ]);
    assert.equal(
      (
        servers["plugin:environment-templates:sensitiveHeader"] as {
          headers?: Record<string, string>;
        }
      ).headers?.["X-Public"],
      "public",
    );
    assert.deepEqual((servers["plugin:environment-templates:stdio"] as { args?: string[] }).args, [
      "${PUBLIC_VALUE}",
      "${env.PUBLIC_VALUE}",
      "${env:PUBLIC_VALUE}",
      "custom",
    ]);
    assert.deepEqual(
      (
        servers["plugin:environment-templates:stdio"] as {
          env?: Record<string, string>;
        }
      ).env,
      {
        BARE: "public",
        CLAUDE_PLUGIN_DATA: join(root, ".data"),
        CLAUDE_PLUGIN_ROOT: root,
        CLAUDE_PROJECT_DIR: join(root, ".working"),
        COLON: "${env:PUBLIC_VALUE}",
        CUSTOM: "custom",
        DOT: "${env.PUBLIC_VALUE}",
        KNORVIA_PLUGIN_DATA: join(root, ".data"),
        KNORVIA_PLUGIN_ID: "environment-templates@inline",
        KNORVIA_PLUGIN_ROOT: root,
        KNORVIA_PROJECT_DIR: join(root, ".working"),
      },
    );
    assert.ok(diagnostics.some((item) => item.code === "plugin_variable_missing"));
  });
});

describe("official MCP auth and provenance", { concurrency: false }, () => {
  test("AUTH-01: exact auth works for HTTP/stdio and rejects malformed, SSE and OAuth coexistence", (context) => {
    const sandbox = createSandbox(context);
    const parseAuth = exportedFunction<
      (value: unknown, mcpKey: string) => KnorviaOfficialMcpAuthConfig | undefined
    >(required(authTarget, "mcp-official-auth"), "parseKnorviaOfficialAuth");
    assert.deepEqual(parseAuth(undefined, "none"), undefined);
    assert.deepEqual(parseAuth({ provider: "jwt_token", type: "knorvia_official" }, "exact"), {
      provider: "jwt_token",
      type: "knorvia_official",
    });
    assert.throws(() => parseAuth({ provider: "other", type: "knorvia_official" }, "bad"));

    const manifest: PluginManifest = { name: "official-auth" };
    const root = writePlugin(sandbox, "official-auth", manifest);
    const auth = { provider: "jwt_token", type: "knorvia_official" };
    const { diagnostics, servers } = resolveFixture(
      loaded(root, manifest, "knorvia-plugins-bundled", "official"),
      {
        http: { auth, type: "http", url: "https://example.invalid/mcp" },
        oauthConflict: {
          auth,
          oauth: { clientId: "client", type: "authorization_code" },
          type: "http",
          url: "https://example.invalid/conflict",
        },
        sse: { auth, type: "sse", url: "https://example.invalid/events" },
        stdio: { auth, command: "runner", type: "stdio" },
      },
    );
    assert.deepEqual(Object.keys(servers).sort(), [
      "plugin:official-auth:http",
      "plugin:official-auth:stdio",
    ]);
    assert.ok(diagnostics.filter((item) => item.code === "plugin_mcp_server_disabled").length >= 2);
  });

  test("AUTH-02: reserved static headers reject official HTTP auth but stay valid for ordinary HTTP", (context) => {
    const sandbox = createSandbox(context);
    const manifest: PluginManifest = { name: "reserved-headers" };
    const root = writePlugin(sandbox, "reserved-headers", manifest);
    const { diagnostics, servers } = resolveFixture(
      loaded(root, manifest, "knorvia-plugins-bundled", "official"),
      {
        ordinary: {
          headers: { Authorization: "Bearer ordinary-static" },
          type: "http",
          url: "https://example.invalid/ordinary",
        },
        official: {
          auth: { provider: "jwt_token", type: "knorvia_official" },
          headers: { Authorization: "Bearer forged" },
          type: "http",
          url: "https://example.invalid/official",
        },
      },
    );
    assert.ok(servers["plugin:reserved-headers:ordinary"]);
    assert.equal(servers["plugin:reserved-headers:official"], undefined);
    assert.ok(diagnostics.some((item) => item.code === "plugin_mcp_server_disabled"));
  });

  test("AUTH-03: file provenance cannot be forged and host provenance uses loaded identity", (context) => {
    const sandbox = createSandbox(context);
    const buildProvenance = exportedFunction<
      (identity: { mcpKey: string; pluginId: string }) => McpOfficialProvenance
    >(required(authTarget, "mcp-official-auth"), "buildOfficialProvenance");
    assert.deepEqual(buildProvenance({ mcpKey: "raw", pluginId: "plugin@market" }), {
      mcpKey: "raw",
      pluginId: "plugin@market",
      source: "plugin",
    });

    const manifest: PluginManifest = { name: "provenance" };
    const root = writePlugin(sandbox, "provenance", manifest);
    const { servers } = resolveFixture(
      loaded(root, manifest, "knorvia-plugins-bundled", "official"),
      {
        raw: {
          auth: { provider: "jwt_token", type: "knorvia_official" },
          official: { mcpKey: "forged", pluginId: "attacker@fake", source: "plugin" },
          type: "http",
          url: "https://example.invalid/mcp",
        },
      },
    );
    assert.deepEqual(
      (servers["plugin:provenance:raw"] as { official?: McpOfficialProvenance }).official,
      {
        mcpKey: "raw",
        pluginId: "provenance@knorvia-plugins-bundled",
        source: "plugin",
      },
    );
  });

  test("AUTH-04: resolving official definitions uses no network or credential port", (context) => {
    const sandbox = createSandbox(context);
    const manifest: PluginManifest = { name: "no-auth-side-effect" };
    const root = writePlugin(sandbox, "no-auth-side-effect", manifest);
    const ports = setupPorts();
    const { servers } = resolveFixture(
      loaded(root, manifest, "knorvia-plugins-bundled", "official"),
      {
        remote: {
          auth: { provider: "jwt_token", type: "knorvia_official" },
          type: "http",
          url: "https://unreachable.invalid/mcp",
        },
      },
    );
    assert.ok(servers["plugin:no-auth-side-effect:remote"]);
    assert.deepEqual(ports.calls, []);
  });

  test("AUTH-05: the complete reserved-header set is normalized only for official auth", (context) => {
    const sandbox = createSandbox(context);
    const manifest: PluginManifest = { name: "complete-reserved-headers" };
    const root = writePlugin(sandbox, "complete-reserved-headers", manifest);
    const reservedHeaders = [
      " Authorization ",
      " X-Bigmodel-Authorization ",
      " BIGMODEL-TARGET-TYPE ",
      " bigmodel-organization ",
      " BIGMODEL-PROJECT ",
      " X-CODING-PLAN-API-KEY ",
      " MCP-Session-ID ",
      " mcp-protocol-version ",
    ];
    const auth = { provider: "jwt_token", type: "knorvia_official" };
    const definitions: Record<string, unknown> = {
      ordinary: {
        headers: Object.fromEntries(reservedHeaders.map((name) => [name, "ordinary"])),
        type: "http",
        url: "https://example.invalid/ordinary",
      },
      ...Object.fromEntries(
        reservedHeaders.map((name, index) => [
          `official${index}`,
          {
            auth,
            headers: { [name]: "forged" },
            type: "http",
            url: `https://example.invalid/official-${index}`,
          },
        ]),
      ),
    };
    const { diagnostics, servers } = resolveFixture(
      loaded(root, manifest, "knorvia-plugins-bundled", "official"),
      definitions,
    );

    assert.deepEqual(Object.keys(servers), ["plugin:complete-reserved-headers:ordinary"]);
    assert.deepEqual(
      Object.keys(
        (
          servers["plugin:complete-reserved-headers:ordinary"] as {
            headers?: Record<string, string>;
          }
        ).headers ?? {},
      ),
      reservedHeaders,
    );
    assert.equal(
      diagnostics.filter((item) => item.code === "plugin_mcp_server_disabled").length,
      reservedHeaders.length,
    );
  });
});
