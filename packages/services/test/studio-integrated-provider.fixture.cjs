// SPDX-License-Identifier: Apache-2.0
// Offline provider responses only; Studio discovery, MCP and workspace IO stay real.
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { createInterface } = require("node:readline");
const { randomUUID } = require("node:crypto");
if (process.argv.includes("--version")) {
  console.log("codex integration fixture 1.0.0");
  process.exit(0);
}
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const respond = (id, result) => send({ id, result });
const notice = (method, params) => send({ method, params });
let session;
let servers;
let mcp;
function client(server) {
  const child = spawn(server.command, server.args, {
    env: { ...process.env, ...server.env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const pending = new Map();
  let id = 0;
  createInterface({ input: child.stdout }).on("line", (line) => {
    const frame = JSON.parse(line);
    pending.get(frame.id)?.(frame);
  });
  child.stderr.resume();
  return {
    async call(name, input) {
      const sequence = ++id;
      const frame = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("MCP response timed out")), 10000);
        pending.set(sequence, (value) => {
          clearTimeout(timer);
          pending.delete(sequence);
          resolve(value);
        });
        child.stdin.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: sequence,
            method: "tools/call",
            params: { name, arguments: input },
          }) + "\n",
        );
      });
      if (frame.result.isError) throw new Error(frame.result.content[0].text);
      return JSON.parse(frame.result.content[0].text);
    },
    async close() {
      const exit = new Promise((resolve) => child.once("exit", resolve));
      child.stdin.end();
      await exit;
    },
  };
}
async function execute(text) {
  try {
    if (text.startsWith("integration-child:")) {
      fs.writeFileSync("report.txt", "isolated child report\n");
      text = "integration child completed";
    } else {
      if (!text.includes("Preserve the original goal and customer data"))
        throw new Error("The reloaded handoff lost its original goal");
      mcp = client(servers.knorvia_studio_agents);
      const kernels = await mcp.call("list_kernels", {});
      if (!kernels.some((entry) => entry.kernel === "codex"))
        throw new Error("Production discovery did not expose the configured kernel");
      const input = {
        commandId: "integrated-child-dispatch",
        kernel: "codex",
        task: "integration-child: write report.txt in the isolated workspace",
        context: text,
      };
      const accepted = await mcp.call("dispatch_task", input);
      const duplicate = await mcp.call("dispatch_task", input);
      if (duplicate.taskId !== accepted.taskId || duplicate.runId !== accepted.runId)
        throw new Error("Duplicate dispatch created a different child");
      let task;
      for (let i = 0; i < 300; i++) {
        task = await mcp.call("get_task", { taskId: accepted.taskId });
        if (task.state === "completed") break;
        if (["failed", "needs-input", "cancelled"].includes(task.state))
          throw new Error("Child did not complete: " + task.state);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      if (task.state !== "completed") throw new Error("Child completion timed out");
      const events = await mcp.call("get_events", {});
      if (events.length !== 1) throw new Error("Expected one durable completion event");
      const event = events[0];
      const result = await mcp.call("get_result", {
        taskId: accepted.taskId,
        resultId: event.resultRef.id,
      });
      const ack = await mcp.call("ack_event", { eventId: event.id });
      fs.writeFileSync(
        "integration-observation.json",
        JSON.stringify({ accepted, event, result, ack }),
      );
      await mcp.close();
      mcp = undefined;
      text = "integration parent completed";
    }
    notice("item/completed", {
      threadId: session,
      item: { id: "reply", type: "agentMessage", text },
    });
    notice("turn/completed", { threadId: session, turn: { id: "turn", status: "completed" } });
  } catch (error) {
    await mcp?.close();
    notice("turn/completed", {
      threadId: session,
      turn: { id: "turn", status: "failed", error: { message: error.message } },
    });
  }
}
createInterface({ input: process.stdin }).on("line", (line) => {
  const { id, method, params = {} } = JSON.parse(line);
  if (method === "initialize") return respond(id, {});
  if (method === "model/list")
    return respond(id, {
      data: [{ model: "integration-model", displayName: "Offline fixture", isDefault: true }],
      nextCursor: null,
    });
  if (method === "config/read") return respond(id, { config: { model: "integration-model" } });
  if (method === "thread/start" || method === "thread/resume") {
    session = params.threadId || randomUUID();
    servers = params.config?.mcp_servers;
    return respond(id, { thread: { id: session }, model: "integration-model" });
  }
  if (method === "turn/start") {
    respond(id, { turn: { id: "turn" } });
    void execute(params.input[0].text);
  }
});
