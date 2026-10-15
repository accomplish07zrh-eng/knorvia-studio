// SPDX-License-Identifier: Apache-2.0
// Anthropic Messages 兼容：请求体归一（system 形态、thinking 签名补位）、响应侧 SSE 逐帧修补
// （缺签名补发合成 signature_delta）与 JSON 体补签名。归一规则与文案是兼容面（B44/B45 锁定）。

type WireFetch = typeof globalThis.fetch;
type Bag = Record<string, unknown>;
type SignatureState = { signature: string; observedDelta: boolean };
type SignatureStates = Map<number, SignatureState>;

function plainObject(node: unknown): Bag | undefined {
  return typeof node === "object" && node !== null && !Array.isArray(node)
    ? (node as Bag)
    : undefined;
}

// ---------- 请求侧：形状修正按序叠加 ----------

function fillThinkingSignatures(value: unknown): unknown {
  if (Array.isArray(value)) {
    const list: unknown[] = [];
    for (const entry of value) list.push(fillThinkingSignatures(entry));
    return list;
  }
  const source = plainObject(value);
  if (source === undefined) return value;
  const next: Bag = {};
  for (const [key, entry] of Object.entries(source)) next[key] = fillThinkingSignatures(entry);
  const thinkingish = next.type === "thinking" && typeof next.signature !== "string";
  if (thinkingish) next.signature = ""; // thinking 块必须带签名（空串占位）
  return next; // 逐键修补后的副本
}

function singleTextPayload(part: unknown): string | undefined {
  const item = plainObject(part);
  const isText = item?.type === "text" && typeof item.text === "string";
  if (!isText) return undefined;
  return item.text as string;
}

function shapeSystemField(body: Bag): void {
  if (typeof body.system === "string") body.system = [{ type: "text", text: body.system }];
}

function shapeSystemMessages(body: Bag): void {
  if (!Array.isArray(body.messages)) return;
  const reshaped: unknown[] = [];
  for (const message of body.messages) {
    const item = plainObject(message);
    const solo =
      item && item.role === "system" && Array.isArray(item.content) && item.content.length === 1
        ? singleTextPayload(item.content[0])
        : undefined;
    reshaped.push(solo === undefined ? message : { ...item, content: solo });
  }
  body.messages = reshaped;
}

type ShapeStep = (body: Bag) => void;
const REQUEST_SHAPES: ShapeStep[] = [shapeSystemField, shapeSystemMessages];

function normalizeRequestBody(body: unknown): unknown {
  const source = plainObject(body);
  if (source === undefined) return body;
  const next = fillThinkingSignatures(source) as Bag;
  for (const step of REQUEST_SHAPES) step(next);
  return next; // 三段形状修正叠加后的请求体
}

// ---------- 响应侧：tool_result 转形与 thinking 签名记忆 ----------

function patchToolResult(block: Bag): Bag {
  if (block.type !== "tool_result") return block; // 非 tool_result 块原样
  if (typeof block.name === "string") {
    const fallback = `tool_${crypto.randomUUID()}`;
    return {
      ...block,
      type: "tool_use", // 带名 tool_result 回放为 tool_use
      id: String(block.id ?? block.tool_use_id ?? fallback),
      input: block.input ?? {}, // 无入参按空对象
    };
  }
  const content = block.content; // 无名块降级为文本
  const text = typeof content === "string" ? content : JSON.stringify(content ?? "");
  return { type: "text", text };
}

function rememberThinkingSignature(block: Bag, index: number, states: SignatureStates): void {
  const carried = typeof block.signature === "string" && block.signature !== "";
  if (block.type === "thinking" && carried) {
    states.set(index, { signature: block.signature as string, observedDelta: false }); // 记住起始签名
  }
}

function markSignatureDelta(payload: Bag, states: SignatureStates): void {
  const delta = plainObject(payload.delta);
  const state =
    delta?.type === "signature_delta" ? states.get(Number(payload.index ?? -1)) : undefined;
  if (state) state.observedDelta = true; // 已有增量则不再补发
}

function syntheticSignatureFrame(signature: string, index: number, newline: string): string {
  const synthetic = {
    type: "content_block_delta", // 合成帧（协议面）
    index,
    delta: { type: "signature_delta", signature },
  };
  return `event: content_block_delta${newline}data: ${JSON.stringify(synthetic)}${newline}${newline}`;
}

// ---------- SSE 帧级修补 ----------

function dataOf(lines: string[]): string {
  const chunks: string[] = [];
  for (const line of lines) {
    if (line.startsWith("data:")) chunks.push(line.slice(5).trimStart());
  }
  return chunks.join("\n");
}

function decorateStart(payload: Bag, states: SignatureStates, index: number): void {
  const block = plainObject(payload.content_block);
  if (!block) return;
  payload.content_block = patchToolResult(block);
  rememberThinkingSignature(block, index, states);
}

function decorateStop(
  payload: Bag,
  states: SignatureStates,
  index: number,
  newline: string,
): string {
  const state = states.get(index);
  states.delete(index); // 状态只在块生命周期内有效
  const needsSynthetic = state !== undefined && !state.observedDelta;
  return needsSynthetic ? syntheticSignatureFrame(state.signature, index, newline) : "";
}

function rewriteFrame(frame: string, states: SignatureStates, newline: string): string {
  const lines = frame.split(/\r?\n/);
  const data = dataOf(lines);
  if (!data || data === "[DONE]") return frame;
  let payload: Bag | undefined; // 解析失败或非对象一律原样透传
  try {
    payload = plainObject(JSON.parse(data));
  } catch {
    payload = undefined;
  }
  if (payload === undefined) return frame;
  const index = typeof payload.index === "number" ? payload.index : -1;
  let injected = "";
  if (payload.type === "content_block_start") decorateStart(payload, states, index);
  else if (payload.type === "content_block_delta") markSignatureDelta(payload, states);
  else if (payload.type === "content_block_stop")
    injected = decorateStop(payload, states, index, newline);
  const carried = lines.filter((line) => !line.startsWith("data:"));
  return `${injected}${[...carried, `data: ${JSON.stringify(payload)}`].join(newline)}`;
}

const FRAME_BREAK = /\r?\n\r?\n/u;

function drainFrames(pending: string, states: SignatureStates): { emitted: string; rest: string } {
  let emitted = "";
  let rest = pending;
  for (;;) {
    const matched = FRAME_BREAK.exec(rest);
    if (!matched) break;
    const frame = rest.slice(0, matched.index);
    const separator = matched[0];
    rest = rest.slice(matched.index + separator.length);
    const newline = separator.startsWith("\r\n") ? "\r\n" : "\n"; // 保持原换行风格
    emitted += rewriteFrame(frame, states, newline) + separator;
  }
  return { emitted, rest };
}

function patchSse(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = body.getReader(); // pull 式逐块重组（旧实现为 TransformStream 双钩子）
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const states: SignatureStates = new Map();
  let pending = "";
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const step = await reader.read();
      if (step.done) {
        if (pending) controller.enqueue(encoder.encode(rewriteFrame(pending, states, "\n")));
        controller.close();
        return;
      }
      pending += decoder.decode(step.value, { stream: true });
      const drained = drainFrames(pending, states);
      pending = drained.rest;
      if (drained.emitted) controller.enqueue(encoder.encode(drained.emitted));
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

// ---------- fetch 包装 ----------

function rewriteRequestBody(init: RequestInit | undefined): RequestInit | undefined {
  if (typeof init?.body !== "string") return init;
  try {
    return { ...init, body: JSON.stringify(normalizeRequestBody(JSON.parse(init.body))) };
  } catch {
    return init; // provider owns malformed JSON
  }
}

function rebuildResponse(
  source: Response,
  body: ReadableStream<Uint8Array> | string,
  headers: Headers,
): Response {
  return new Response(body as never, {
    status: source.status,
    statusText: source.statusText,
    headers,
  });
}

export function createAnthropicCompatFetch(baseFetch: WireFetch): WireFetch {
  return async (target, init) => {
    const response = await baseFetch(target, rewriteRequestBody(init));
    if (!response.ok) return response;
    const mediaType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const headers = new Headers(response.headers);
    const isEventStream = mediaType.includes("text/event-stream") && response.body !== null;
    if (isEventStream) {
      headers.delete("content-length"); // 流长度必然变化
      return rebuildResponse(
        response,
        patchSse(response.body as ReadableStream<Uint8Array>),
        headers,
      );
    }
    if (!mediaType.includes("json")) return response;
    try {
      const patched = fillThinkingSignatures(await response.clone().json());
      headers.delete("content-length"); // JSON 体重新序列化
      return rebuildResponse(response, JSON.stringify(patched), headers);
    } catch {
      return response;
    }
  };
}
