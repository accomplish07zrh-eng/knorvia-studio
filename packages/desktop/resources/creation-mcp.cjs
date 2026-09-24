"use strict";

// A narrow stdio MCP adapter. The Host owns credentials, authorization and task state.
const readline = require("node:readline");

const names = ["list_models", "create_image", "create_video", "get_job", "wait_job", "cancel_job"];
const tools = [
  { name: "list_models", description: "List configured Knorvia image and video generation models. Use an enabled, configured model ID for creation.", annotations: { readOnlyHint: true }, inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "create_image", description: "Start text-to-image or image-to-image generation. Returns a durable job; call wait_job or get_job for the result. A reference image must be in the current project or an existing Creation output. May incur API charges.", annotations: { destructiveHint: true }, inputSchema: { type: "object", properties: { model_id: { type: "string" }, prompt: { type: "string" }, reference_image_path: { type: "string", description: "Optional PNG, JPEG or WebP path in the current project or an existing Creation output for image-to-image." }, request_id: { type: "string", description: "Optional stable idempotency ID, reuse it if retrying the same request." } }, required: ["model_id", "prompt"], additionalProperties: false } },
  { name: "create_video", description: "Start video generation from a text prompt. Returns a durable job; call wait_job or get_job for the result. May incur API charges.", annotations: { destructiveHint: true }, inputSchema: { type: "object", properties: { model_id: { type: "string" }, prompt: { type: "string" }, request_id: { type: "string" } }, required: ["model_id", "prompt"], additionalProperties: false } },
  { name: "get_job", description: "Read the current state and local output paths of a generation job.", annotations: { readOnlyHint: true }, inputSchema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"], additionalProperties: false } },
  { name: "wait_job", description: "Wait up to 20 seconds for a generation job, then return its current state. Repeat while queued or running.", annotations: { readOnlyHint: true }, inputSchema: { type: "object", properties: { job_id: { type: "string" }, seconds: { type: "number", minimum: 1, maximum: 20 } }, required: ["job_id"], additionalProperties: false } },
  { name: "cancel_job", description: "Stop local waiting for a generation job. Remote processing or billing may continue.", annotations: { destructiveHint: true }, inputSchema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"], additionalProperties: false } },
];

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

async function callHost(name, args) {
  const url = process.env.KNORVIA_CREATION_BRIDGE_URL;
  const token = process.env.KNORVIA_CREATION_BRIDGE_TOKEN;
  if (!url || !token) throw new Error("Knorvia creation bridge is unavailable");
  const response = await fetch(url + "/tool", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, arguments: args }),
    signal: AbortSignal.timeout(25000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(String(body.error || `HTTP ${response.status}`));
  return body.result;
}

async function handle(request) {
  if (!request || typeof request !== "object" || !Object.hasOwn(request, "id")) return;
  const { id, method } = request;
  try {
    if (method === "initialize") {
      send({ jsonrpc: "2.0", id, result: { protocolVersion: request.params?.protocolVersion || "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "knorvia-creation", version: "1.0.0" } } });
    } else if (method === "ping") {
      send({ jsonrpc: "2.0", id, result: {} });
    } else if (method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: { tools } });
    } else if (method === "tools/call") {
      const name = request.params?.name;
      if (!names.includes(name)) throw new Error("Unknown creation tool");
      try {
        const result = await callHost(name, request.params?.arguments || {});
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result) }] } });
      } catch (error) {
        send({ jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Creation call failed" }] } });
      }
    } else {
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
    }
  } catch (error) {
    send({ jsonrpc: "2.0", id, error: { code: -32603, message: error instanceof Error ? error.message : "Internal error" } });
  }
}

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  if (line.length > 1024 * 1024) return;
  try { void handle(JSON.parse(line)); }
  catch { /* Invalid notification/frame: do not contaminate stdio with diagnostics. */ }
});
