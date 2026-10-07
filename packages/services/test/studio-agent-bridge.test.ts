import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createStudioAgentBridge } from "../src/studio-runtime/adapters/studioAgentBridge.js";
import { fixture } from "./studio-agent-tools.fixture.js";

test("real stdio MCP transport exposes only scoped tools and revokes its bearer grant", async () => {
  const f = await fixture();
  const bridge = createStudioAgentBridge(
    (turn, sink, signal) => f.service.agentTools(turn, sink, signal),
    process.execPath,
  );
  const controller = new AbortController();
  const issued = await bridge.issue(f.caller, f.sink, controller.signal);
  assert.equal(issued.server.type, "stdio");
  if (issued.server.type !== "stdio") throw new Error("expected stdio");
  const child = spawn(issued.server.command, issued.server.args, {
    env: { ...process.env, ...issued.server.env },
    stdio: ["pipe", "pipe", "ignore"],
  });
  const lines = createInterface({ input: child.stdout });
  let sequence = 0;
  const replies = new Map<number, (value: Record<string, any>) => void>();
  lines.on("line", (line) => {
    const value = JSON.parse(line);
    replies.get(value.id)?.(value);
  });
  async function query(method: string, params?: unknown): Promise<Record<string, any>> {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("MCP response timeout")), 5000);
      replies.set(id, (value) => {
        clearTimeout(timer);
        replies.delete(id);
        resolve(value);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }
  try {
    const initialized = await query("initialize", { protocolVersion: "2025-06-18" });
    assert.equal(initialized.result.serverInfo.name, "knorvia-studio-agents");
    const catalog = await query("tools/list");
    assert.equal(catalog.result.tools.length, 9);
    assert.equal(
      catalog.result.tools.some((entry: any) => /answer|approve|configure/.test(entry.name)),
      false,
    );
    const dispatch = catalog.result.tools.find((entry: any) => entry.name === "dispatch_task");
    assert.equal(dispatch.inputSchema.additionalProperties, false);
    const response = await query("tools/call", { name: "list_kernels", arguments: {} });
    const kernels = JSON.parse(response.result.content[0].text);
    assert.equal(kernels[0].kernel, "codex");
    assert.equal(Object.hasOwn(kernels[0], "executablePath"), false);
    issued.revoke();
    const revoked = await query("tools/call", { name: "list_kernels", arguments: {} });
    assert.equal(revoked.result.isError, true);
    const unauthorized = await fetch(issued.server.env.KNORVIA_STUDIO_AGENT_URL + "/tool", {
      method: "POST",
      headers: { authorization: "Bearer invalid" },
      body: "{}",
    });
    assert.equal(unauthorized.status, 401);
  } finally {
    replies.clear();
    lines.close();
    child.kill();
    issued.revoke();
    await bridge.disposeAllAndWait();
    await f.close();
  }
});
