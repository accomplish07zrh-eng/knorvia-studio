import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { StudioKernelRegistry } from "../src/studio-runtime/app/ports.js";
import type { StoredRun } from "../src/studio-runtime/app/storePort.js";
import type { StudioKernelEvent, StudioKernelTurn } from "../src/studio-runtime/kernelTypes.js";
import { createStudioAgentBridge } from "../src/studio-runtime/adapters/studioAgentBridge.js";
import { withStudioSharedCapabilities } from "../src/studio-runtime/adapters/sharedCapabilities.js";
import { startCodex } from "../src/studio-runtime/adapters/kernels/codexProtocol.js";
import { KernelRun } from "../src/studio-runtime/adapters/kernels/kernelRun.js";
import type { ProtocolProcess } from "../src/studio-runtime/adapters/kernels/processTransport.js";
import { fixture, until } from "./studio-agent-tools.fixture.js";

function mcpClient(server: { command: string; args: string[]; env: Record<string, string> }) {
  const child = spawn(server.command, server.args, {
    env: { ...process.env, ...server.env },
    stdio: ["pipe", "pipe", "ignore"],
  });
  const lines = createInterface({ input: child.stdout });
  const replies = new Map<number, (value: Record<string, any>) => void>();
  let sequence = 0;
  lines.on("line", (line) => {
    const value = JSON.parse(line);
    replies.get(value.id)?.(value);
  });
  async function query(method: string, params?: unknown): Promise<Record<string, any>> {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("provider MCP response timeout")), 5000);
      replies.set(id, (value) => {
        clearTimeout(timer);
        replies.delete(id);
        resolve(value);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  return {
    query,
    async call(name: string, input: unknown) {
      const response = await query("tools/call", { name, arguments: input });
      assert.equal(response.result.isError, undefined, response.result.content[0].text);
      return JSON.parse(response.result.content[0].text);
    },
    close() {
      lines.close();
      child.kill();
    },
  };
}

function sharedOptions(dataDir: string, agentBridge: ReturnType<typeof createStudioAgentBridge>) {
  return {
    dataDir,
    agentBridge,
    skills: {
      async list() {
        return { skills: [], diagnostics: [], capability: { userScopeAvailable: true } };
      },
      async buildPromptContext({ prompt }: { prompt: string }) {
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
        return { plugins: [], diagnostics: [] };
      },
    },
  };
}

test("production Codex thread injection reaches scoped dispatch/result tools and revokes on return", async () => {
  const f = await fixture(undefined, { artifactCount: 3 });
  const bridge = createStudioAgentBridge(
    (turn, sink, signal) => f.service.agentTools(turn, sink, signal),
    process.execPath,
  );
  let client: ReturnType<typeof mcpClient> | undefined;
  const methods: string[] = [];
  const registry: StudioKernelRegistry = {
    adapter: () => ({
      async run(turn, sink) {
        const run = new KernelRun(turn, sink);
        // 离线替身只替换原生响应；MCP 配置生成、子进程和 admission 都走真实实现。
        run.process = {
          notify() {},
          async request(method: string, params: Record<string, any>) {
            methods.push(method);
            if (method === "initialize") return {};
            if (method === "thread/start") {
              assert.equal(params.approvalsReviewer, "user");
              const server = params.config.mcp_servers.knorvia_studio_agents;
              assert.equal(server.command, process.execPath);
              client = mcpClient(server);
              await client.query("initialize", { protocolVersion: "2025-06-18" });
              const catalog = await client.query("tools/list");
              assert.equal(catalog.result.tools.length, 9);
              const kernels = await client.call("list_kernels", {});
              assert.equal(kernels[0].kernel, "codex");
              const accepted = await client.call("dispatch_task", {
                commandId: "provider-route",
                kernel: "codex",
                task: "write a report",
                context: "offline provider route",
              });
              f.service.tick();
              await until(() => f.db.read<StoredRun>("run", accepted.runId)?.state === "succeeded");
              const events = await client.call("get_events", {});
              const result = await client.call("get_result", {
                taskId: accepted.taskId,
                resultId: events[0].resultRef.id,
              });
              assert.equal(result.results[0].result.text.length, 18000);
              assert.equal(result.artifacts.length, 3);
              await client.call("ack_event", { eventId: events[0].id });
              return { thread: { id: "provider-thread" }, model: turn.model };
            }
            assert.equal(method, "thread/read");
            return { thread: { id: "provider-thread", cwd: turn.workspacePath } };
          },
        } as unknown as ProtocolProcess;
        await startCodex(run);
        await run.flush();
        return run.done.promise;
      },
    }),
    inspect: async () => [],
    manage: async () => {
      throw new Error("unused");
    },
    dispose: async () => {},
  };
  try {
    const wrapped = withStudioSharedCapabilities(registry, sharedOptions(f.path, bridge));
    const result = await wrapped
      .adapter("codex")
      .run({ ...f.caller, text: "/status" }, f.sink, new AbortController().signal);
    assert.equal(result.status, "succeeded");
    assert.deepEqual(methods, ["initialize", "thread/start", "thread/read"]);
    assert.equal(f.paths.length, 1);
    assert.ok(client);
    const revoked = await client.query("tools/call", { name: "list_kernels", arguments: {} });
    assert.equal(revoked.result.isError, true);
  } finally {
    client?.close();
    await bridge.disposeAllAndWait();
    await f.close();
  }
});

test("unsupported Antigravity and SSH paths show notices without local grants or paths", async () => {
  const f = await fixture();
  let grants = 0;
  const bridge = createStudioAgentBridge(() => {
    grants++;
    throw new Error("unsupported providers must not receive a local grant");
  }, process.execPath);
  const received: StudioKernelTurn[] = [];
  const events: StudioKernelEvent[] = [];
  const registry: StudioKernelRegistry = {
    adapter: () => ({
      async run(turn) {
        received.push(turn);
        return { status: "succeeded", text: "ordinary provider turn", resultKnown: true };
      },
    }),
    options: async () => ({ models: [], sharedResourceWarnings: ["native warning"] }),
    inspect: async () => [],
    manage: async () => {
      throw new Error("unused");
    },
    dispose: async () => {},
  };
  const remote = "ssh:012345678901234567890123:codex";
  try {
    const wrapped = withStudioSharedCapabilities(registry, sharedOptions(f.path, bridge));
    for (const kernel of ["antigravity", remote] as const) {
      const options = await wrapped.options?.({
        kernel,
        config: { executablePath: "", permission: "ask" },
      });
      assert.equal(options?.sharedResourceWarnings?.[0], "native warning");
      assert.match(options?.sharedResourceWarnings?.[1] ?? "", /Studio Agent/);
      const result = await wrapped.adapter(kernel).run(
        { ...f.caller, kernel, conversationId: "group:example:member" },
        {
          emit: async (event) => {
            events.push(event);
          },
          ask: async () => ({}),
        },
        new AbortController().signal,
      );
      assert.equal(result.status, "succeeded");
    }
    assert.equal(grants, 0);
    assert.equal(
      events.filter((event) => event.type === "progress" && /Studio Agent/.test(event.text)).length,
      2,
    );
    assert.equal(received[1]?.sharedMcpServers, undefined);
    assert.equal(received[1]?.sharedMcpConfigPath, undefined);
    assert.deepEqual(received[0]?.sharedMcpServers, []);
    assert.equal(JSON.stringify(received).includes("KNORVIA_STUDIO_AGENT_TOKEN"), false);
  } finally {
    await bridge.disposeAllAndWait();
    await f.close();
  }
});
