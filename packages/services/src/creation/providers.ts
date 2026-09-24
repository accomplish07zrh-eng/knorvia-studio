import type { CreationApiMapping, CreationKind, CreationModel } from "./contract.js";

export interface CreationProviderInput {
  model: CreationModel;
  apiKey: string | null;
  prompt: string;
  signal: AbortSignal;
  onSubmissionStarted?(): void;
  onProviderTaskId(taskId: string): Promise<void>;
  reference?: { bytes: Uint8Array; name: string; mimeType: string };
  firstFrame?: { bytes: Uint8Array; name: string; mimeType: string };
  lastFrame?: { bytes: Uint8Array; name: string; mimeType: string };
}

export interface CreationProviderOutput {
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
}

const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

export function creationOutputFormat(
  bytes: Uint8Array,
  kind: CreationKind,
): {
  mimeType: string;
  extension: string;
} {
  const matches = (magic: number[]) => magic.every((byte, index) => bytes[index] === byte);
  if (kind === "image") {
    if (matches([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      return { mimeType: "image/png", extension: "png" };
    if (matches([0xff, 0xd8, 0xff])) return { mimeType: "image/jpeg", extension: "jpg" };
    if (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    )
      return { mimeType: "image/webp", extension: "webp" };
  } else {
    if (String.fromCharCode(...bytes.slice(4, 8)) === "ftyp")
      return { mimeType: "video/mp4", extension: "mp4" };
    if (matches([0x1a, 0x45, 0xdf, 0xa3])) return { mimeType: "video/webm", extension: "webm" };
  }
  throw new Error("生成服务返回的文件格式与任务类型不符");
}

async function readLimited(response: Response, limit = MAX_OUTPUT_BYTES): Promise<Uint8Array> {
  if (!response.ok) throw new Error(`生成服务返回 ${response.status}`);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit)
    throw new Error("生成服务响应超过大小限制");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("生成服务没有返回文件内容");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("生成服务响应超过大小限制");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readJson(response: Response): Promise<Record<string, any>> {
  if (!response.ok) throw new Error(`生成服务返回 ${response.status}`);
  const bytes = await readLimited(response, 16 * 1024 * 1024);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, any>;
  } catch {
    throw new Error("生成服务返回了无效 JSON");
  }
}

function apiUrl(baseUrl: string, path: string): string {
  const base = new URL(baseUrl);
  const basePath = base.pathname.replace(/\/+$/, "");
  const suffix = path.replace(/^\/+/, "");
  // 兼容用户填写服务根地址和已含 /v1 的 OpenAI 兼容地址。
  base.pathname = `${basePath}/${suffix.startsWith("v1/") && basePath.endsWith("/v1") ? suffix.slice(3) : suffix}`;
  return base.toString();
}

function output(bytes: Uint8Array, kind: CreationKind): CreationProviderOutput {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_OUTPUT_BYTES)
    throw new Error("生成文件为空或超过 256 MB 限制");
  return { bytes, ...creationOutputFormat(bytes, kind) };
}

async function openAiImage(input: CreationProviderInput, fetchImpl: typeof fetch) {
  if (!input.apiKey) throw new Error("此图片模型尚未配置 API 密钥");
  let response: Response;
  if (input.reference) {
    const form = new FormData();
    form.append("model", input.model.model);
    form.append("prompt", input.prompt);
    form.append(
      "image",
      new Blob([new Uint8Array(input.reference.bytes)], {
        type: input.reference.mimeType,
      }),
      input.reference.name,
    );
    input.onSubmissionStarted?.();
    response = await fetchImpl(apiUrl(input.model.baseUrl, "/v1/images/edits"), {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}` },
      body: form,
      signal: input.signal,
    });
  } else {
    input.onSubmissionStarted?.();
    response = await fetchImpl(apiUrl(input.model.baseUrl, "/v1/images/generations"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: input.model.model, prompt: input.prompt, n: 1 }),
      signal: input.signal,
    });
  }
  const data = await readJson(response);
  const first = Array.isArray(data.data) ? data.data[0] : null;
  if (typeof first?.b64_json === "string" && first.b64_json)
    return output(Buffer.from(first.b64_json, "base64"), "image");
  if (typeof first?.url === "string" && /^https?:\/\//i.test(first.url)) {
    const downloaded = await fetchImpl(first.url, { signal: input.signal });
    return output(await readLimited(downloaded), "image");
  }
  throw new Error("图片服务没有返回可用图片");
}

function substituteWorkflow(value: unknown, values: Record<string, string>): unknown {
  if (typeof value === "string")
    return value.replace(
      /\{\{(prompt|model|image|imageBase64|imageDataUrl|firstFrame|lastFrame|firstFrameBase64|lastFrameBase64|firstFrameDataUrl|lastFrameDataUrl)\}\}/g,
      (_match, key: string) => values[key] ?? "",
    );
  if (Array.isArray(value)) return value.map((item) => substituteWorkflow(item, values));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, substituteWorkflow(item, values)]),
    );
  return value;
}

async function wait(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function comfyUi(
  input: CreationProviderInput,
  fetchImpl: typeof fetch,
  pollIntervalMs: number,
  deadlineMs: number,
): Promise<CreationProviderOutput> {
  let graph: unknown;
  try {
    graph = JSON.parse(input.model.workflowJson ?? "");
  } catch {
    throw new Error("ComfyUI 工作流 JSON 无效");
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (input.apiKey) headers.Authorization = `Bearer ${input.apiKey}`;
  const uploadReference = async (reference: NonNullable<CreationProviderInput["reference"]>) => {
    const form = new FormData();
    form.append(
      "image",
      new Blob([new Uint8Array(reference.bytes)], {
        type: reference.mimeType,
      }),
      reference.name,
    );
    form.append("type", "input");
    const upload = await readJson(
      await fetchImpl(apiUrl(input.model.baseUrl, "/upload/image"), {
        method: "POST",
        headers: input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : undefined,
        body: form,
        signal: input.signal,
      }),
    );
    const name = String(upload.name ?? "").trim();
    if (!name) throw new Error("ComfyUI 未接收参考图");
    return name;
  };
  const uploadedImage = input.reference ? await uploadReference(input.reference) : "";
  const uploadedFirstFrame = input.firstFrame ? await uploadReference(input.firstFrame) : "";
  const uploadedLastFrame = input.lastFrame ? await uploadReference(input.lastFrame) : "";
  input.onSubmissionStarted?.();
  const submitted = await readJson(
    await fetchImpl(apiUrl(input.model.baseUrl, "/prompt"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: substituteWorkflow(graph, {
          prompt: input.prompt,
          model: input.model.model,
          image: uploadedImage,
          firstFrame: uploadedFirstFrame,
          lastFrame: uploadedLastFrame,
        }),
        client_id: "knorvia-studio",
      }),
      signal: input.signal,
    }),
  );
  const taskId = String(submitted.prompt_id ?? "").trim();
  if (!taskId) throw new Error("ComfyUI 未返回任务编号");
  await input.onProviderTaskId(taskId);

  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    input.signal.throwIfAborted();
    const history = await readJson(
      await fetchImpl(apiUrl(input.model.baseUrl, `/history/${encodeURIComponent(taskId)}`), {
        headers: input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : undefined,
        signal: input.signal,
      }),
    );
    const entry = history[taskId];
    if (entry?.status?.status_str === "error") throw new Error("ComfyUI 工作流执行失败");
    const outputKey = input.model.kind === "image" ? "images" : "videos";
    for (const node of Object.values(entry?.outputs ?? {}) as Array<Record<string, any>>) {
      const candidates = Array.isArray(node?.[outputKey]) ? node[outputKey] : [];
      for (const candidate of candidates) {
        if (typeof candidate?.filename !== "string") continue;
        const url = new URL(apiUrl(input.model.baseUrl, "/view"));
        url.searchParams.set("filename", candidate.filename);
        url.searchParams.set("subfolder", String(candidate.subfolder ?? ""));
        url.searchParams.set("type", String(candidate.type ?? "output"));
        const response = await fetchImpl(url, {
          headers: input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : undefined,
          signal: input.signal,
        });
        return output(await readLimited(response), input.model.kind);
      }
    }
    if (entry?.status?.completed === true)
      throw new Error(
        `ComfyUI 已结束，但没有返回${input.model.kind === "image" ? "图片" : "视频"}`,
      );
    await wait(pollIntervalMs, input.signal);
  }
  throw new Error("等待 ComfyUI 生成超时");
}

function pickPath(value: unknown, path: string): unknown {
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((current, part) => {
      if (current === null || typeof current !== "object") return undefined;
      return (current as Record<string, unknown>)[part];
    }, value);
}

async function jsonOutput(
  data: Record<string, any>,
  mapping: CreationApiMapping,
  input: CreationProviderInput,
  fetchImpl: typeof fetch,
): Promise<CreationProviderOutput> {
  const value = pickPath(data, mapping.outputPath);
  if (typeof value !== "string" || !value.trim()) throw new Error("API 响应缺少生成文件字段");
  if (/^https?:\/\//i.test(value))
    return output(
      await readLimited(await fetchImpl(value, { signal: input.signal })),
      input.model.kind,
    );
  const dataUri = /^data:[^;,]+;base64,(.*)$/s.exec(value);
  const encoded = dataUri?.[1] ?? value;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(encoded)) throw new Error("API 文件字段不是 URL 或 base64");
  return output(Buffer.from(encoded.replace(/\s/g, ""), "base64"), input.model.kind);
}

async function jsonApi(
  input: CreationProviderInput,
  fetchImpl: typeof fetch,
  pollIntervalMs: number,
  deadlineMs: number,
): Promise<CreationProviderOutput> {
  const mapping = input.model.apiMapping;
  if (!mapping) throw new Error("API 映射未配置");
  const base64 = input.reference ? Buffer.from(input.reference.bytes).toString("base64") : "";
  const firstFrameBase64 = input.firstFrame ? Buffer.from(input.firstFrame.bytes).toString("base64") : "";
  const lastFrameBase64 = input.lastFrame ? Buffer.from(input.lastFrame.bytes).toString("base64") : "";
  const requestBody = substituteWorkflow(JSON.parse(mapping.requestTemplate), {
    prompt: input.prompt,
    model: input.model.model,
    imageBase64: base64,
    imageDataUrl: input.reference ? `data:${input.reference.mimeType};base64,${base64}` : "",
    firstFrameBase64,
    lastFrameBase64,
    firstFrameDataUrl: input.firstFrame ? `data:${input.firstFrame.mimeType};base64,${firstFrameBase64}` : "",
    lastFrameDataUrl: input.lastFrame ? `data:${input.lastFrame.mimeType};base64,${lastFrameBase64}` : "",
  });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (input.apiKey) headers.Authorization = `Bearer ${input.apiKey}`;
  input.onSubmissionStarted?.();
  const created = await readJson(
    await fetchImpl(apiUrl(input.model.baseUrl, mapping.requestPath), {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: input.signal,
    }),
  );
  const taskId = mapping.taskIdPath
    ? String(pickPath(created, mapping.taskIdPath) ?? "").trim()
    : "";
  if (!taskId) return jsonOutput(created, mapping, input, fetchImpl);
  if (!mapping.pollPath || !mapping.statusPath)
    throw new Error("异步 API 映射缺少查询路径或状态字段");
  await input.onProviderTaskId(taskId);
  const succeeded = (
    mapping.successValues?.length
      ? mapping.successValues
      : ["succeeded", "success", "completed", "done"]
  ).map((value) => value.toLowerCase());
  const failed = (
    mapping.failureValues?.length ? mapping.failureValues : ["failed", "error", "cancelled"]
  ).map((value) => value.toLowerCase());
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    input.signal.throwIfAborted();
    const pollPath = mapping.pollPath.replaceAll("{{taskId}}", encodeURIComponent(taskId));
    const state = await readJson(
      await fetchImpl(apiUrl(input.model.baseUrl, pollPath), {
        headers: input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : undefined,
        signal: input.signal,
      }),
    );
    const status = String(pickPath(state, mapping.statusPath) ?? "").toLowerCase();
    if (succeeded.includes(status)) return jsonOutput(state, mapping, input, fetchImpl);
    if (failed.includes(status)) throw new Error(`生成服务报告失败：${status}`);
    await wait(pollIntervalMs, input.signal);
  }
  throw new Error("等待生成服务超时");
}

export async function runCreationProvider(
  input: CreationProviderInput,
  options: { fetchImpl?: typeof fetch; pollIntervalMs?: number; deadlineMs?: number } = {},
): Promise<CreationProviderOutput> {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (input.model.protocol === "openai-images") return openAiImage(input, fetchImpl);
  if (input.model.protocol === "comfyui")
    return comfyUi(input, fetchImpl, options.pollIntervalMs ?? 1500, options.deadlineMs ?? 15 * 60 * 1000);
  return jsonApi(input, fetchImpl, options.pollIntervalMs ?? 1500, options.deadlineMs ?? 15 * 60 * 1000);
}
