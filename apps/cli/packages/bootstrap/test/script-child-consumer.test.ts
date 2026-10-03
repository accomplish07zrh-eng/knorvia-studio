import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runScriptWorkflowChild } from "../src/app/script-workflow-process.js";

test("unchanged process adapter receives real child events and routes synthetic requests", async () => {
  const events: unknown[] = [];
  const requests: unknown[] = [];
  const body = 'phase("synthetic"); log("synthetic log"); return await agent(args.prompt);';
  const result = await runScriptWorkflowChild({
    args: { prompt: "synthetic prompt" },
    document: {
      body,
      content: body,
      hash: "synthetic-test-only",
      meta: { name: "synthetic-child", description: "Synthetic contract fixture", phases: [] },
      path: fileURLToPath(new URL("synthetic.workflow.js", import.meta.url)),
    },
    handleEvent: (event) => {
      events.push(event);
    },
    handleRequest: async (request) => {
      requests.push(request);
      return { value: { synthetic: true }, stats: { tokens: { total: 1 } } };
    },
    workingDirectory: fileURLToPath(new URL(".", import.meta.url)),
  });
  assert.deepEqual(result, { stderr: "", value: { synthetic: true } });
  assert.deepEqual(events, [
    { type: "phase", payload: { title: "synthetic" } },
    { type: "log", payload: { message: "synthetic log", phase: "synthetic" } },
  ]);
  assert.deepEqual(requests, [
    {
      id: "req_1",
      kind: "request",
      type: "agent",
      payload: { callPath: "root/agent0", phase: "synthetic", prompt: "synthetic prompt" },
    },
  ]);
});
