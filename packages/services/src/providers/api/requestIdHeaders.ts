import { createUuid } from "@knorvia/shared";

export const REQUEST_ID_HEADER_NAME = "x-request-id";

export function withRequestIdHeader(headers: RequestInit["headers"] | undefined): Headers {
  const result = new Headers(headers);
  if (!result.has(REQUEST_ID_HEADER_NAME)) result.set(REQUEST_ID_HEADER_NAME, createUuid());
  return result;
}

export function withRequestIdHeaderRecord(
  headers: RequestInit["headers"] | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value;
    });
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) result[key] = value;
  } else if (headers) {
    for (const [key, value] of Object.entries(headers)) result[key] = String(value);
  }
  if (!Object.keys(result).some((key) => key.toLowerCase() === REQUEST_ID_HEADER_NAME)) {
    result[REQUEST_ID_HEADER_NAME] = createUuid();
  }
  return result;
}
