// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
type ProviderFetch = typeof globalThis.fetch;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function patchThinking(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(patchThinking);
  const source = record(value);
  if (!source) return value;
  const next = Object.fromEntries(
    Object.entries(source).map(([key, entry]) => [key, patchThinking(entry)]),
  );
  if (next.type === "thinking" && typeof next.signature !== "string") next.signature = "";
  return next;
}
function normalizeRequestBody(body: unknown): unknown {
  const source = record(body);
  if (!source) return body;
  const next = patchThinking(source) as Record<string, unknown>;
  if (typeof next.system === "string") next.system = [{ type: "text", text: next.system }];
  if (Array.isArray(next.messages))
    next.messages = next.messages.map((message) => {
      const item = record(message);
      if (!item || item.role !== "system" || !Array.isArray(item.content)) return message;
      if (item.content.length !== 1) return message;
      const part = record(item.content[0]);
      return part?.type === "text" && typeof part.text === "string"
        ? { ...item, content: part.text }
        : message;
    });
  return next;
}
function patchToolResult(block: Record<string, unknown>): Record<string, unknown> {
  if (block.type !== "tool_result") return block;
  if (typeof block.name === "string")
    return {
      ...block,
      type: "tool_use",
      id: String(block.id ?? block.tool_use_id ?? `tool_${crypto.randomUUID()}`),
      input: block.input ?? {},
    };
  const content = block.content;
  return {
    type: "text",
    text: typeof content === "string" ? content : JSON.stringify(content ?? ""),
  };
}
interface SignatureState {
  signature: string;
  observedDelta: boolean;
}
function transformSseEvent(
  source: string,
  states: Map<number, SignatureState>,
  newline: string,
): string {
  const lines = source.split(/\r?\n/);
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data || data === "[DONE]") return source;
  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(data);
    const value = record(parsed);
    if (!value) return source;
    payload = value;
  } catch {
    return source;
  }
  const index = typeof payload.index === "number" ? payload.index : -1;
  if (payload.type === "content_block_start") {
    const block = record(payload.content_block);
    if (block) {
      payload.content_block = patchToolResult(block);
      if (block.type === "thinking" && typeof block.signature === "string" && block.signature)
        states.set(index, { signature: block.signature, observedDelta: false });
    }
  } else if (payload.type === "content_block_delta") {
    const delta = record(payload.delta);
    if (delta?.type === "signature_delta") {
      const state = states.get(index);
      if (state) state.observedDelta = true;
    }
  }
  let injected = "";
  if (payload.type === "content_block_stop") {
    const state = states.get(index);
    states.delete(index);
    if (state && !state.observedDelta) {
      const synthetic = {
        type: "content_block_delta",
        index,
        delta: { type: "signature_delta", signature: state.signature },
      };
      injected = `event: content_block_delta${newline}data: ${JSON.stringify(synthetic)}${newline}${newline}`;
    }
  }
  const retained = lines.filter((line) => !line.startsWith("data:"));
  return `${injected}${[...retained, `data: ${JSON.stringify(payload)}`].join(newline)}`;
}
function patchSse(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const states = new Map<number, SignatureState>();
  let pending = "";
  const drain = (controller: TransformStreamDefaultController<Uint8Array>, final = false) => {
    for (;;) {
      const match = /\r?\n\r?\n/.exec(pending);
      if (!match) break;
      const block = pending.slice(0, match.index);
      const separator = match[0];
      pending = pending.slice(match.index + separator.length);
      const newline = separator.startsWith("\r\n") ? "\r\n" : "\n";
      controller.enqueue(encoder.encode(transformSseEvent(block, states, newline) + separator));
    }
    if (final && pending) {
      controller.enqueue(encoder.encode(transformSseEvent(pending, states, "\n")));
      pending = "";
    }
  };
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        pending += decoder.decode(chunk, { stream: true });
        drain(controller);
      },
      flush(controller) {
        pending += decoder.decode();
        drain(controller, true);
      },
    }),
  );
}
export function createAnthropicCompatFetch(baseFetch: ProviderFetch): ProviderFetch {
  return async (input, init) => {
    let next = init;
    if (typeof init?.body === "string") {
      try {
        next = { ...init, body: JSON.stringify(normalizeRequestBody(JSON.parse(init.body))) };
      } catch {
        /* provider owns malformed JSON */
      }
    }
    const response = await baseFetch(input, next);
    if (!response.ok) return response;
    const type = response.headers.get("content-type")?.toLowerCase() ?? "";
    const headers = new Headers(response.headers);
    if (type.includes("text/event-stream") && response.body) {
      headers.delete("content-length");
      return new Response(patchSse(response.body), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
    if (!type.includes("json")) return response;
    try {
      const body = patchThinking(await response.clone().json());
      headers.delete("content-length");
      return new Response(JSON.stringify(body), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      return response;
    }
  };
}
