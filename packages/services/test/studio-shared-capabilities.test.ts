import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NativeMcpServerRecord, SkillSummary } from "@knorvia/shared";
import type { StudioKernelRegistry } from "../src/studio-runtime/app/ports.js";
import type { StudioKernelTurn } from "../src/studio-runtime/kernelTypes.js";
import {
  projectStudioMcpServers,
  withStudioSharedCapabilities,
} from "../src/studio-runtime/adapters/sharedCapabilities.js";
import { codexStudioMcpConfig } from "../src/studio-runtime/adapters/kernels/codexProtocol.js";
import { claudeArgs } from "../src/studio-runtime/adapters/kernels/claudeProtocol.js";
import { projectStudioPluginMcp } from "../src/studio-runtime/adapters/pluginMcpProjection.js";
import { recoverTemporaryMcpConfigs } from "../src/studio-runtime/adapters/temporaryMcpConfig.js";

const record = (
  name: string,
  config: NativeMcpServerRecord["config"],
  scope: "workspace" | "user" = "user",
  enabled = true,
): NativeMcpServerRecord => ({ source: "knorviaagentmcp", scope, name, config, enabled });

test("workspace MCP shadows user MCP even when disabled; unsupported fields fail before launch", () => {
  assert.deepEqual(
    projectStudioMcpServers([
      record("same", { command: "old" }, "workspace", false),
      record("same", { command: "should-not-return" }),
      record("enabled", { command: "node", args: ["server.js"], env: { TOKEN: "secret" } }),
    ]),
    [
      {
        name: "enabled",
        type: "stdio",
        command: "node",
        args: ["server.js"],
        env: { TOKEN: "secret" },
      },
    ],
  );
  assert.throws(
    () =>
      projectStudioMcpServers([
        record("oauth", {
          type: "http",
          url: "https://host",
          oauth: { type: "authorization_code" },
        }),
      ]),
    /oauth/,
  );
  assert.throws(
    () =>
      projectStudioMcpServers([
        record("broken", { type: "stdio", command: "node", args: [1] as unknown as string[] }),
      ]),
    /args/,
  );
  assert.throws(() => projectStudioMcpServers([record("__proto__", { command: "node" })]), /名称/);
});

test("Codex native config maps stdio and HTTP, refuses SSE; Claude gets private path only", () => {
  const projected = projectStudioMcpServers([
    record("local", {
      type: "stdio",
      command: "node",
      args: ["server.js"],
      env: { TOKEN: "private" },
    }),
    record("web", {
      type: "http",
      url: "https://host/mcp",
      headers: { Authorization: "Bearer private" },
    }),
  ]);
  assert.deepEqual(codexStudioMcpConfig(projected).mcp_servers.web, {
    url: "https://host/mcp",
    http_headers: { Authorization: "Bearer private" },
  });
  assert.throws(
    () =>
      codexStudioMcpConfig([{ name: "old", type: "sse", url: "https://host/sse", headers: {} }]),
    /SSE/,
  );
  const args = claudeArgs({
    ...baseTurn("claude-code"),
    sharedMcpConfigPath: "C:\\private\\mcp.json",
  } as StudioKernelTurn);
  assert.deepEqual(args.slice(args.indexOf("--mcp-config"), args.indexOf("--mcp-config") + 2), [
    "--mcp-config",
    "C:\\private\\mcp.json",
  ]);
  assert.equal(args.join(" ").includes("Bearer private"), false);
});

test("only enabled static plugin MCP crosses; private config is reported without revealing values", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-plugin-mcp-"));
  try {
    await mkdir(join(root, ".knorvia-plugin"));
    await writeFile(
      join(root, ".knorvia-plugin", "plugin.json"),
      JSON.stringify({
        name: "demo",
        commands: { nativeOnly: "./commands/native.md" },
        hooks: { PreToolUse: [{ command: "native-hook" }] },
        mcpServers: {
          safe: { type: "stdio", command: "node", args: ["server.js"], env: { TOKEN: "literal" } },
          remote: {
            type: "http",
            url: "https://host/mcp",
            headers: { Authorization: "Bearer literal" },
          },
          private: {
            type: "http",
            url: "https://host",
            auth: { type: "knorvia_official", secret: "PRIVATE" },
          },
          dynamic: { command: "node", env: { TOKEN: "${USER_TOKEN}" } },
        },
      }),
    );
    const plugin = {
      id: "demo@inline",
      name: "demo",
      rootPath: root,
      enabled: true,
      declaredMcpServerNames: ["safe", "remote", "private", "dynamic"],
      mcpServerNames: [
        "plugin:demo:safe",
        "plugin:demo:remote",
        "plugin:demo:private",
        "plugin:demo:dynamic",
      ],
    };
    const projection = await projectStudioPluginMcp(
      {
        async listPlugins() {
          return { plugins: [plugin], diagnostics: [] } as never;
        },
      },
      root,
    );
    assert.deepEqual(projection.servers, [
      {
        name: "plugin:demo:safe",
        type: "stdio",
        command: "node",
        args: ["server.js"],
        env: { TOKEN: "literal" },
      },
      {
        name: "plugin:demo:remote",
        type: "http",
        url: "https://host/mcp",
        headers: { Authorization: "Bearer literal" },
      },
    ]);
    assert.deepEqual(
      projection.unavailable.map((item) => item.serverName),
      ["private", "dynamic"],
    );
    assert.equal(JSON.stringify(projection.unavailable).includes("PRIVATE"), false);
    assert.equal(JSON.stringify(projection.unavailable).includes("USER_TOKEN"), false);
    assert.equal(JSON.stringify(projection).includes("native-hook"), false);
    const nativeConfig = codexStudioMcpConfig(projection.servers).mcp_servers;
    assert.deepEqual(nativeConfig["plugin:demo:safe"], {
      command: "node",
      args: ["server.js"],
      env: { TOKEN: "literal" },
    });
    assert.deepEqual(nativeConfig["plugin:demo:remote"], {
      url: "https://host/mcp",
      http_headers: { Authorization: "Bearer literal" },
    });
    const invalidName = await projectStudioPluginMcp(
      {
        async listPlugins() {
          return {
            plugins: [
              {
                ...plugin,
                name: "demo / broken",
                mcpServerNames: ["plugin:demo / broken:safe"],
                declaredMcpServerNames: ["safe"],
              },
            ],
            diagnostics: [],
          } as never;
        },
      },
      root,
    );
    assert.equal(invalidName.servers.length, 0);
    assert.match(invalidName.unavailable[0]?.reason ?? "", /名称/);
    const events: unknown[] = [];
    const registry = {
      adapter() {
        return {
          async run(turn: StudioKernelTurn) {
            assert.equal(
              (turn as StudioKernelTurn & { sharedMcpServers?: unknown[] }).sharedMcpServers
                ?.length,
              2,
            );
            return { status: "succeeded" as const, text: "ok", resultKnown: true };
          },
        };
      },
      async options() {
        return { models: [] };
      },
      async inspect() {
        return [];
      },
      async manage() {
        throw new Error("unused");
      },
      async dispose() {},
    } satisfies StudioKernelRegistry;
    const wrapped = withStudioSharedCapabilities(registry, {
      dataDir: root,
      skills: {
        async list() {
          return { skills: [], diagnostics: [], capability: { userScopeAvailable: true } };
        },
        async buildPromptContext({ prompt }) {
          return { prompt, activatedSkillNames: [] };
        },
      },
      mcp: {
        async loadMcpFromUserDirectory() {
          return { servers: [] };
        },
      },
      plugins: {
        async listPlugins() {
          return { plugins: [plugin], diagnostics: [] } as never;
        },
      },
    });
    const options = await wrapped.options?.({
      kernel: "codex",
      workspacePath: root,
      config: { executablePath: "", permission: "ask" },
    });
    assert.match(options?.sharedResourceWarnings?.[0] ?? "", /private/);
    assert.equal(JSON.stringify(options).includes("PRIVATE"), false);
    assert.equal(JSON.stringify(options).includes("Bearer literal"), false);
    await wrapped.adapter("codex").run(
      { ...baseTurn("codex"), conversationId: "group:example:member" },
      {
        async emit(event) {
          events.push(event);
        },
        async ask() {
          return {};
        },
      },
      new AbortController().signal,
    );
    assert.equal((events[0] as { type?: string }).type, "progress");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("invalid shared MCP fails as a known pre-launch result", async () => {
  let launched = false;
  const wrapped = withStudioSharedCapabilities(
    {
      adapter() {
        return {
          async run() {
            launched = true;
            return { status: "succeeded", text: "unreachable", resultKnown: true } as const;
          },
        };
      },
      async inspect() {
        return [];
      },
      async manage() {
        throw new Error("unused");
      },
      async dispose() {},
    },
    {
      dataDir: tmpdir(),
      skills: {
        async list() {
          return { skills: [], diagnostics: [], capability: { userScopeAvailable: true } };
        },
        async buildPromptContext({ prompt }) {
          return { prompt, activatedSkillNames: [] };
        },
      },
      mcp: {
        async loadMcpFromUserDirectory() {
          return { servers: [record("broken", { type: "other", url: "https://host" })] };
        },
      },
      plugins: {
        async listPlugins() {
          return { plugins: [], diagnostics: [] } as never;
        },
      },
    },
  );
  const result = await wrapped.adapter("codex").run(
    baseTurn("codex"),
    {
      async emit() {},
      async ask() {
        return {};
      },
    },
    new AbortController().signal,
  );
  assert.equal(launched, false);
  assert.deepEqual(
    { status: result.status, resultKnown: result.resultKnown },
    { status: "failed", resultKnown: true },
  );
  assert.match(result.error ?? "", /传输类型/);
});

function baseTurn(kernel: StudioKernelTurn["kernel"]): StudioKernelTurn {
  return {
    runId: "run",
    turnId: "turn",
    conversationId: "conversation",
    kernel,
    workspacePath: tmpdir(),
    permission: "ask",
    text: "Use $demo",
  };
}

test("external turn receives enabled plugin skill and MCP snapshot, then removes temporary Claude config", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-shared-"));
  const skill: SkillSummary = {
    id: "plugin:demo",
    name: "demo",
    description: "Demo plugin skill",
    body: "Do the demo.",
    path: join(root, "plugin", "SKILL.md"),
    scope: "plugin",
    enabled: true,
    pluginName: "plugin",
  };
  let seenTurn: StudioKernelTurn | undefined;
  let privatePath = "";
  let builtin = 0;
  const registry = {
    adapter(kernel: StudioKernelTurn["kernel"]) {
      return {
        async run(turn: StudioKernelTurn) {
          if (kernel === "knorvia") builtin++;
          seenTurn = turn;
          privatePath =
            (turn as StudioKernelTurn & { sharedMcpConfigPath?: string }).sharedMcpConfigPath ?? "";
          if (privatePath) {
            const content = JSON.parse(await readFile(privatePath, "utf8")) as {
              mcpServers: Record<string, unknown>;
            };
            assert.deepEqual(content.mcpServers.local, {
              command: "node",
              args: [],
              env: { TOKEN: "secret" },
            });
            assert.equal((await stat(privatePath)).isFile(), true);
          }
          return { status: "succeeded" as const, text: "ok", resultKnown: true };
        },
      };
    },
    async inspect() {
      return [];
    },
    async manage() {
      throw new Error("unused");
    },
    async dispose() {},
  } satisfies StudioKernelRegistry;
  const wrapped = withStudioSharedCapabilities(registry, {
    dataDir: root,
    skills: {
      async list() {
        return { skills: [skill], diagnostics: [], capability: { userScopeAvailable: true } };
      },
      async buildPromptContext({ prompt }) {
        return { prompt: `${prompt}\nDo the demo.`, activatedSkillNames: ["demo"] };
      },
    },
    mcp: {
      async loadMcpFromUserDirectory() {
        return { servers: [record("local", { command: "node", env: { TOKEN: "secret" } })] };
      },
    },
    plugins: {
      async listPlugins() {
        return { plugins: [], diagnostics: [] } as never;
      },
    },
  });
  const sink = {
    async emit() {},
    async ask() {
      return {};
    },
  };
  try {
    await wrapped
      .adapter("claude-code")
      .run(baseTurn("claude-code"), sink, new AbortController().signal);
    assert.match(seenTurn?.text ?? "", /Do the demo/);
    assert.match(seenTurn?.text ?? "", /Demo plugin skill/);
    assert.equal((seenTurn?.text ?? "").includes("secret"), false);
    await assert.rejects(stat(privatePath), { code: "ENOENT" });
    await wrapped.adapter("knorvia").run(baseTurn("knorvia"), sink, new AbortController().signal);
    assert.equal(builtin, 1);
    assert.equal(seenTurn?.text, "Use $demo");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("native CLI slash commands bypass skill prompt rewriting while retaining MCP projection", async () => {
  const received: StudioKernelTurn[] = [];
  const wrapped = withStudioSharedCapabilities(
    {
      adapter() {
        return {
          async run(turn) {
            received.push(turn);
            return { status: "succeeded", text: "ok", resultKnown: true } as const;
          },
        };
      },
      async inspect() {
        return [];
      },
      async manage() {
        throw new Error("unused");
      },
      async dispose() {},
    },
    {
      dataDir: tmpdir(),
      skills: {
        async list() {
          return { skills: [], diagnostics: [], capability: { userScopeAvailable: true } };
        },
        async buildPromptContext() {
          throw new Error("Native command must not become a skill prompt");
        },
      },
      mcp: {
        async loadMcpFromUserDirectory() {
          return { servers: [record("shared", { command: "node" })] };
        },
      },
      plugins: {
        async listPlugins() {
          return { plugins: [], diagnostics: [] } as never;
        },
      },
    },
  );
  for (const text of ["/status ", "/compact", "/review current changes"]) {
    const result = await wrapped.adapter("codex").run(
      { ...baseTurn("codex"), text },
      {
        async emit() {},
        async ask() {
          return {};
        },
      },
      new AbortController().signal,
    );
    assert.equal(result.status, "succeeded");
  }
  assert.deepEqual(
    received.map((turn) => turn.text),
    ["/status ", "/compact", "/review current changes"],
  );
  assert.ok(received.every((turn) => turn.sharedMcpServers?.[0]?.name === "shared"));
});

test("crash recovery removes dead Host MCP secrets and preserves a live Host directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-mcp-recovery-"));
  const token = "not-a-real-token-for-recovery-test";
  const dead = join(root, "shared-mcp", "turn-99999998-12345678-1234-1234-1234-123456789abc");
  const live = join(root, "shared-mcp", "turn-99999999-12345678-1234-1234-1234-123456789abc");
  const unknown = join(root, "shared-mcp", "turn-legacy-unknown-owner");
  try {
    for (const dir of [dead, live, unknown]) {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "mcp.json"), token);
    }
    assert.equal(await recoverTemporaryMcpConfigs(root, (pid) => pid === 99999999), 1);
    await assert.rejects(stat(dead), { code: "ENOENT" });
    assert.equal(await readFile(join(live, "mcp.json"), "utf8"), token);
    assert.equal(await readFile(join(unknown, "mcp.json"), "utf8"), token);
    assert.equal(await recoverTemporaryMcpConfigs(root, (pid) => pid === 99999999), 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed and cancelled Claude turns remove the temporary private MCP config", async () => {
  const root = await mkdtemp(join(tmpdir(), "knorvia-mcp-turn-"));
  const controller = new AbortController();
  let calls = 0;
  const wrapped = withStudioSharedCapabilities(
    {
      adapter() {
        return {
          async run(turn) {
            calls++;
            assert.equal((await readFile(turn.sharedMcpConfigPath!, "utf8")).includes("fake-key"), true);
            if (calls === 1) throw new Error("local CLI substitute failed");
            controller.abort();
            return { status: "cancelled", text: "", resultKnown: true } as const;
          },
        };
      },
      async inspect() { return []; },
      async manage() { throw new Error("unused"); },
      async dispose() {},
    },
    {
      dataDir: root,
      skills: {
        async list() { return { skills: [], diagnostics: [], capability: { userScopeAvailable: true } }; },
        async buildPromptContext({ prompt }) { return { prompt, activatedSkillNames: [] }; },
      },
      mcp: {
        async loadMcpFromUserDirectory() {
          return { servers: [record("local", { command: "node", env: { API_KEY: "fake-key" } })] };
        },
      },
      plugins: { async listPlugins() { return { plugins: [], diagnostics: [] } as never; } },
    },
  );
  const sink = { async emit() {}, async ask() { return {}; } };
  try {
    await assert.rejects(wrapped.adapter("claude-code").run(baseTurn("claude-code"), sink, new AbortController().signal), /local CLI substitute failed/);
    assert.deepEqual(await readdir(join(root, "shared-mcp")), []);
    const result = await wrapped.adapter("claude-code").run(baseTurn("claude-code"), sink, controller.signal);
    assert.equal(result.status, "cancelled");
    assert.deepEqual(await readdir(join(root, "shared-mcp")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
