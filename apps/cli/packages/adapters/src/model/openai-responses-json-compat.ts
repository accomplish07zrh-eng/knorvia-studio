// SPDX-License-Identifier: Apache-2.0
// OpenAI Responses JSON 兼容：非 SSE 的 2xx JSON 响应补两处形状——message 缺 id 补 msg_ 前缀、
// output_text 补 annotations 空表；替换体时去掉 content-length。id 前缀是协议面，逐字保持。

type WireFetch = typeof globalThis.fetch;

function patchShape(node: unknown): unknown {
  if (Array.isArray(node)) {
    const list: unknown[] = [];
    for (const entry of node) list.push(patchShape(entry));
    return list;
  }
  const plainObject = typeof node === "object" && node !== null;
  if (!plainObject) return node;
  const bag: Record<string, unknown> = {};
  for (const key of Object.keys(node)) {
    bag[key] = patchShape((node as Record<string, unknown>)[key]);
  }
  const kind = bag.type;
  if (kind === "message" && typeof bag.id !== "string") {
    bag.id = `msg_${crypto.randomUUID()}`;
  }
  if (kind === "output_text" && !Array.isArray(bag.annotations)) {
    bag.annotations = [];
  }
  return bag;
}

function shouldPatch(incoming: Response, mediaType: string): boolean {
  if (!incoming.ok) return false;
  if (mediaType.includes("text/event-stream")) return false;
  return mediaType.includes("json");
}

function rebuildOptions(source: Response, headers: Headers): ResponseInit {
  return { status: source.status, statusText: source.statusText, headers };
}

export function createOpenAIResponsesJsonCompatFetch(baseFetch: WireFetch): WireFetch {
  return async (target, init) => {
    const incoming = await baseFetch(target, init);
    const mediaType = incoming.headers.get("content-type")?.toLowerCase() ?? "";
    if (!shouldPatch(incoming, mediaType)) return incoming;
    let patched: unknown;
    try {
      patched = patchShape(await incoming.clone().json());
    } catch {
      return incoming;
    }
    const headers = new Headers(incoming.headers);
    headers.delete("content-length");
    return new Response(JSON.stringify(patched), rebuildOptions(incoming, headers));
  };
}
