import { ApiError, type ApiClient, type ApiRequestInit } from "@knorvia/shared";

function diagnosticHeaders(response: Response): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const name of ["x-request-id", "x-trace-id", "x-span-id"]) {
    const value = response.headers.get(name)?.trim();
    if (value) result[name] = value;
  }
  return Object.keys(result).length ? result : undefined;
}

async function failureMessage(response: Response): Promise<string> {
  const fallback = `HTTP ${response.status}`;
  try {
    const body = (await response.text()).trim();
    if (!body) return fallback;
    try {
      const parsed = JSON.parse(body);
      for (const key of ["error", "message", "msg", "detail"]) {
        if (typeof parsed[key] === "string") return parsed[key].trim() || fallback;
      }
      return fallback;
    } catch {
      return body;
    }
  } catch {
    return fallback;
  }
}

export async function readApiJson<T>(
  apiClient: ApiClient,
  input: string | URL,
  init?: ApiRequestInit,
): Promise<T> {
  const url = typeof input === "string" ? input : input.toString();
  const method = (init?.method ?? "GET").toUpperCase();
  const response = await apiClient.request(input, init);
  if (!response.ok) {
    const message = await failureMessage(response);
    throw new ApiError({
      message,
      url,
      method,
      status: response.status,
      responseHeaders: diagnosticHeaders(response),
    });
  }
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ApiError({
      message: error instanceof Error ? error.message : "Invalid JSON response",
      url,
      method,
      status: response.status,
      responseHeaders: diagnosticHeaders(response),
      cause: error,
    });
  }
}
