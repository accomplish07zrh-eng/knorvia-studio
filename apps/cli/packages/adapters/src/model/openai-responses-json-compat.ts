// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
type ProviderFetch = typeof globalThis.fetch;
function patch(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(patch);
  if (typeof value !== "object" || value === null) return value;
  const record = Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, patch(entry)]),
  );
  if (record.type === "message" && typeof record.id !== "string")
    record.id = `msg_${crypto.randomUUID()}`;
  if (record.type === "output_text" && !Array.isArray(record.annotations)) record.annotations = [];
  return record;
}
export function createOpenAIResponsesJsonCompatFetch(baseFetch: ProviderFetch): ProviderFetch {
  return async (input, init) => {
    const response = await baseFetch(input, init);
    const type = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!response.ok || type.includes("text/event-stream") || !type.includes("json"))
      return response;
    let body: unknown;
    try {
      body = patch(await response.clone().json());
    } catch {
      return response;
    }
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(JSON.stringify(body), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
