// SPDX-License-Identifier: MIT
// Knorvia independent replacement; per-file review pending.
import type {
  CompiledModelOptionMaps,
  JsonObject,
  ModelOptionValues,
} from "@knorvia/model-option-map";
type ProviderFetch = typeof globalThis.fetch;
export interface RawRequestBodyCapture {
  body?: JsonObject;
}
export function createModelOptionMapFetch(input: {
  readonly capture?: RawRequestBodyCapture;
  readonly fetch: ProviderFetch;
  readonly maps: CompiledModelOptionMaps;
  readonly values: ModelOptionValues;
}): ProviderFetch {
  return async (resource, init) => {
    if (init?.body === undefined) return input.fetch(resource, init);
    if (typeof init.body !== "string")
      throw new TypeError("Model option maps require a JSON object request body");
    let parsed: unknown;
    try {
      parsed = JSON.parse(init.body);
    } catch (error) {
      throw new TypeError("Model option maps require valid JSON", { cause: error });
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      throw new TypeError("Model option maps require a JSON object request body");
    const body = input.maps.apply(parsed as JsonObject, input.values);
    if (input.capture) input.capture.body = body;
    return input.fetch(resource, { ...init, body: JSON.stringify(body) });
  };
}
