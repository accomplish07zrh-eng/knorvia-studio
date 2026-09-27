import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type {
  McpPort,
  McpToolDescriptor,
  McpToolCallResult,
  PermissionBrokerRequest,
} from "@knorvia/contracts";
import { registerMcpTools } from "../src/mcp/index.js";
import { createToolRegistry } from "../src/tool/registry.js";
import { PermissionService, defaultPermissionConfig } from "../src/permission/service.js";
import { resolveToolPermission } from "../src/tool/executor/permission-flow.js";
import { serializeOutput } from "../src/tool/executor/result-serialization.js";
import { restrictBorrowedWindowsComputerUse } from "../src/mcp/windows-computer-use.js";
import { createBorrowedSubagentMcpAccess } from "../src/subagent/borrowed-mcp-port.js";
import type { ToolExecutionContext } from "../src/tool/types.js";
import type { ToolExecutorDeps } from "../src/tool/executor/types.js";

const trusted = new Set(["node_repl"]);
const context = {
  sessionId: "session-test",
  turnId: "turn-test",
  traceId: "trace-test",
  toolCallId: "call-test",
  abortSignal: new AbortController().signal,
  workingDirectory: "C:/fixture",
  workspaceRoot: "C:/fixture",
  workspaceIdentity: "workspace-test",
  runtimeScope: "main",
} as ToolExecutionContext;

function descriptor(toolName: string, serverName = "node_repl"): McpToolDescriptor {
  return {
    serverName,
    toolName,
    name: `mcp__${serverName}__${toolName}`,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  };
}

function register(
  toolName: string,
  options: { trusted?: boolean; serverName?: string; result?: McpToolCallResult } = {},
) {
  const registry = createToolRegistry();
  const calls: unknown[] = [];
  const port = {
    async callTool(request: unknown) {
      calls.push(request);
      return options.result ?? { content: [] };
    },
  } as unknown as McpPort;
  const names = registerMcpTools(registry, port, [descriptor(toolName, options.serverName)], {
    trustedWindowsComputerUseServerNames: options.trusted === false ? undefined : trusted,
  });
  return { entry: registry.get(names[0]!)!, calls };
}

async function permission(
  entry: ReturnType<typeof register>["entry"],
  options: {
    mode?: "build" | "yolo" | "edit" | "plan";
    allowed?: boolean;
    denied?: boolean;
    sessionAllowed?: boolean;
    projectDenied?: boolean;
    response?: "allow" | "deny";
    hookResponse?: "allow" | "modify" | "deny";
    responseWait?: Promise<"allow" | "deny">;
    responseUpdates?: boolean;
  } = {},
) {
  const service = new PermissionService({
    ...defaultPermissionConfig,
    allowedTools: new Set(options.allowed ? [entry.metadata.name] : []),
    disallowedTools: new Set(options.denied ? [entry.metadata.name] : []),
  });
  if (options.sessionAllowed)
    service.grantSessionPermission([
      { type: "addRules", behavior: "allow", rules: [{ toolName: entry.metadata.name }] },
    ]);
  const requests: PermissionBrokerRequest[] = [];
  const events: unknown[] = [];
  let sessionGrants = 0;
  let projectGrants = 0;
  const grant = service.grantSessionPermission.bind(service);
  service.grantSessionPermission = (updates) => {
    sessionGrants += 1;
    grant(updates);
  };
  const updates = [
    {
      type: "addRules" as const,
      behavior: "allow" as const,
      rules: [{ toolName: entry.metadata.name }],
    },
  ];
  const deps = {
    sessionId: context.sessionId,
    turnId: context.turnId,
    permissionService: service,
    getWorkingDirectory: () => context.workingDirectory,
    getWorkspaceRoot: () => context.workspaceRoot,
    emitEvent: async (event: unknown) => {
      events.push(event);
    },
    permissionBroker: {
      async requestPermission(request: PermissionBrokerRequest) {
        requests.push(request);
        return {
          decision: await (options.responseWait ?? options.response ?? "allow"),
          ...(options.responseUpdates
            ? { permissionUpdates: updates, sessionPermissionUpdates: updates }
            : {}),
        };
      },
    },
    ...(options.hookResponse
      ? {
          hookRunner: {
            async run() {
              return {
                additionalContexts: [],
                permissionRequestResult: {
                  behavior: options.hookResponse === "deny" ? "deny" : "allow",
                  ...(options.hookResponse === "modify"
                    ? { updatedInput: { approved: true } }
                    : {}),
                },
              };
            },
          },
        }
      : {}),
    ...(options.projectDenied || options.responseUpdates
      ? {
          sessionStore: {
            async getSession() {
              return { projectID: "project-test" };
            },
            async getProjectPermission() {
              return options.projectDenied
                ? { version: 1, deny: [{ toolName: entry.metadata.name }] }
                : null;
            },
            async saveProjectPermission() {
              projectGrants += 1;
            },
          },
        }
      : {}),
  } as unknown as ToolExecutorDeps;
  const outcome = await resolveToolPermission(
    deps,
    { id: context.toolCallId, name: entry.metadata.name, input: {} },
    entry,
    {},
    { additionalContexts: [] },
    options.mode ?? "build",
    context,
  );
  return { outcome, requests, events, sessionGrants, projectGrants };
}

test("trusted request_access asks in every mode despite allowlist and old session grants", async () => {
  const { entry } = register("computer_request_access");
  for (const mode of ["build", "edit", "plan", "yolo"] as const) {
    const { outcome, requests } = await permission(entry, {
      mode,
      allowed: true,
      sessionAllowed: true,
    });
    assert.equal(outcome.allowed, true);
    assert.equal(requests.length, 1, mode);
    assert.equal(requests[0]?.optionsPolicy, "no-always-allow");
    assert.equal(requests[0]?.sideEffectScope, "system");
    assert.equal(requests[0]?.riskLevel, "high");
    assert.deepEqual(requests[0]?.suggestedPermissionUpdates, []);
  }
});

test("request_access waits for user even when PermissionRequest hook instantly allows or modifies", async () => {
  for (const hookResponse of ["allow", "modify"] as const) {
    const user = Promise.withResolvers<"allow" | "deny">();
    let settled = false;
    const pending = permission(register("computer_request_access").entry, {
      hookResponse,
      responseWait: user.promise,
    }).then((result) => {
      settled = true;
      return result;
    });
    await delay(5);
    assert.equal(settled, false, hookResponse);
    user.resolve("deny");
    assert.equal((await pending).outcome.allowed, false);
  }
});

test("user-only access retains hook denial and refuses broker rule persistence", async () => {
  const denied = await permission(register("computer_request_access").entry, {
    hookResponse: "deny",
    responseWait: new Promise(() => {}),
  });
  assert.equal(denied.outcome.allowed, false);
  const allowed = await permission(register("computer_request_access").entry, {
    responseUpdates: true,
  });
  assert.equal(allowed.outcome.allowed, true);
  assert.equal(allowed.sessionGrants, 0);
  assert.equal(allowed.projectGrants, 0);
});

test("ordinary MCP permission hooks and session-enabled alwaysAsk tools retain their existing policy", async () => {
  const { entry } = register("ordinary_tool", { trusted: false });
  assert.equal(
    (await permission(entry, { hookResponse: "allow", responseWait: new Promise(() => {}) }))
      .outcome.allowed,
    true,
  );
  entry.permission = {
    ...entry.permission,
    alwaysAsk: true,
    askOptions: { allowAlways: "session" },
  };
  const allowed = await permission(entry, { sessionAllowed: true });
  assert.equal(allowed.outcome.allowed, true);
  assert.equal(allowed.requests.length, 0);
});

test("trusted operations reuse driver grant without another prompt, but explicit deny wins even in yolo", async () => {
  for (const name of [
    "computer_list_windows",
    "computer_observe",
    "computer_action",
    "computer_stop",
  ]) {
    const { entry } = register(name);
    for (const mode of ["build", "yolo"] as const) {
      const allowed = await permission(entry, { mode });
      assert.equal(allowed.outcome.allowed, true, name);
      assert.equal(allowed.requests.length, 0, name);
      for (const deny of [{ denied: true }, { projectDenied: true }]) {
        const denied = await permission(entry, { mode, ...deny });
        assert.equal(denied.outcome.allowed, false, name);
        assert.equal(denied.requests.length, 0, name);
      }
    }
  }
});

test("declining access does not prevent a subsequent stop; access deny never dispatches", async () => {
  const access = register("computer_request_access");
  const denied = await permission(access.entry, { response: "deny" });
  assert.equal(denied.outcome.allowed, false);
  assert.deepEqual(access.calls, []);
  const stop = await permission(register("computer_stop").entry);
  assert.equal(stop.outcome.allowed, true);
  assert.equal(stop.requests.length, 0);
});

test("server name/annotations and unknown tool names cannot acquire the trusted bypass", async () => {
  for (const [name, options] of [
    ["computer_action", { trusted: false }],
    ["computer_action", { serverName: "third_party" }],
    ["computer_action_extra", {}],
    ["js", {}],
  ] as const) {
    const { entry } = register(name, options);
    assert.equal(entry.permission.alwaysAsk, undefined);
    assert.equal(entry.prepareApproval, undefined);
    assert.equal((await permission(entry)).requests.length, 1);
  }
});

test("trusted metadata ignores misleading annotations and retains read-only observations", () => {
  const action = register("computer_action").entry;
  assert.equal(action.metadata.readOnly, false);
  assert.equal(action.metadata.destructive, true);
  assert.equal(action.metadata.concurrentSafe, false);
  assert.equal(action.metadata.sideEffectScope, "system");
  assert.equal(action.metadata.riskLevel, "high");
  assert.equal(register("computer_observe").entry.metadata.readOnly, true);
  assert.equal(register("computer_list_windows").entry.metadata.readOnly, true);
  assert.equal(register("computer_stop").entry.metadata.concurrentSafe, true);
});

test("a trusted frame above generic MCP budget keeps exact data, dimensions and ordering through serialization", async () => {
  // Real PNG encoding is the runtime's contract; this test isolates transport preservation.
  const data = Buffer.alloc(300_000, 61).toString("base64");
  const metadata = { observationId: "observation-test", width: 1600, height: 900 };
  const result = {
    content: [
      { type: "image", mimeType: "image/png", data },
      { type: "text", text: JSON.stringify(metadata) },
    ],
    structuredContent: metadata,
  };
  const { entry, calls } = register("computer_observe", { result });
  const output = await entry.handler({}, context);
  assert.strictEqual(output, result);
  const serialized = await serializeOutput(
    {} as ToolExecutorDeps,
    output,
    entry,
    context,
    context.toolCallId,
    context.abortSignal,
  );
  assert.equal(serialized.truncated, false);
  assert.ok(Array.isArray(serialized.modelContent));
  assert.equal(serialized.modelContent[0]?.type, "image");
  assert.equal(
    (serialized.modelContent[0] as { dataUrl: string }).dataUrl,
    `data:image/png;base64,${data}`,
  );
  assert.equal((serialized.modelContent[0] as { detail: string }).detail, "original");
  assert.equal((serialized.modelContent[1] as { text: string }).text, JSON.stringify(metadata));
  assert.equal((calls[0] as { workspaceKey: string }).workspaceKey, context.workspaceIdentity);
  const spoof = register("computer_observe", { trusted: false, result });
  const normalized = (await spoof.entry.handler({}, context)) as McpToolCallResult;
  assert.equal(
    normalized.content.some((block) => block.type === "image"),
    false,
  );
});

test("trusted image/text bounds reject rather than silently shrink actionable frames", async () => {
  for (const content of [
    [{ type: "image", mimeType: "image/png", data: "A".repeat(12 * 1024 * 1024) }],
    [{ type: "text", text: "a".repeat(65 * 1024) }],
    Array.from({ length: 2 }, () => ({ type: "image", mimeType: "image/png", data: "AAAA" })),
  ]) {
    const { entry } = register("computer_observe", { result: { content } });
    await assert.rejects(entry.handler({}, context), /Computer Use.*limit/);
  }
});

test("error observations keep their image and expose the error fact", async () => {
  const result = {
    isError: true,
    content: [{ type: "image", mimeType: "image/png", data: "AAAA" }],
  };
  const { entry } = register("computer_action", { result });
  const content = entry.formatModelContent!(await entry.handler({}, context));
  assert.ok(Array.isArray(content));
  assert.equal(content[0]?.type, "image");
  assert.equal((content.at(-1) as { text: string }).text, "MCP tool returned an error.");
});

test("subagent borrowing hides and rejects trusted computer tools while ordinary JS and third parties remain", async () => {
  const calls: string[] = [];
  const parentPort = {
    async callTool(request: { toolName: string }) {
      calls.push(request.toolName);
      return { content: [] };
    },
  } as unknown as McpPort;
  const descriptors = [
    descriptor("computer_action"),
    descriptor("computer_request_access"),
    descriptor("js"),
    descriptor("computer_action", "third_party"),
  ];
  const borrowed = restrictBorrowedWindowsComputerUse(
    createBorrowedSubagentMcpAccess(parentPort, {
      statuses: { node_repl: { status: "connected" }, third_party: { status: "connected" } },
      tools: descriptors,
    }),
    trusted,
  );
  assert.deepEqual(
    (await borrowed.port.listTools()).map((tool) => tool.name),
    ["mcp__node_repl__js", "mcp__third_party__computer_action"],
  );
  await assert.rejects(
    borrowed.port.callTool({ serverName: "node_repl", toolName: "computer_action", arguments: {} }),
    /unavailable to subagents/,
  );
  assert.equal(calls.length, 0);
  await borrowed.port.callTool({ serverName: "node_repl", toolName: "js", arguments: {} });
  assert.deepEqual(calls, ["js"]);
  assert.equal(descriptors.length, 4);
});
