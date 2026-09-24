import { createHash } from "node:crypto";
import { open, rm } from "node:fs/promises";

export type Fetcher = typeof fetch;
function trustedUrl(value: string): URL {
  const url = new URL(value);
  const allowed =
    url.hostname === "registry.npmjs.org" ||
    (url.hostname === "downloads.claude.ai" && url.pathname.startsWith("/claude-code-releases/")) ||
    (url.hostname === "x.ai" && url.pathname.startsWith("/cli/")) ||
    (url.hostname === "storage.googleapis.com" &&
      url.pathname.startsWith("/grok-build-public-artifacts/cli/"));
  if (url.protocol !== "https:" || url.username || url.password || url.port || !allowed)
    throw new Error("拒绝非官方内核下载源");
  return url;
}
export async function officialResponse(
  url: string,
  signal: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  let target = trustedUrl(url);
  for (let redirects = 0; redirects < 5; redirects++) {
    const response = await fetcher(target, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      await response.body?.cancel();
      if (!next) throw new Error("下载重定向缺少目标");
      target = trustedUrl(new URL(next, target).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`官方下载失败 (HTTP ${response.status})`);
    }
    return response;
  }
  throw new Error("下载重定向次数过多");
}
export async function officialText(
  url: string,
  signal: AbortSignal,
  fetcher?: Fetcher,
): Promise<string> {
  const response = await officialResponse(url, signal, fetcher);
  if (Number(response.headers.get("content-length")) > 2_000_000) {
    await response.body?.cancel();
    throw new Error("下载元数据过大");
  }
  if (!response.body) throw new Error("下载元数据为空");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 2_000_000) throw new Error("下载元数据过大");
      chunks.push(part.value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function downloadVerified(options: {
  url: string;
  destination: string;
  signal: AbortSignal;
  integrity?: { algorithm: "sha256" | "sha512"; value: string; encoding: "hex" | "base64" };
  googleHash?: boolean;
  fetcher?: Fetcher;
}): Promise<string> {
  const response = await officialResponse(options.url, options.signal, options.fetcher);
  if (!response.body) throw new Error("下载内容为空");
  const md5 = response.headers.get("x-goog-hash")?.match(/(?:^|[,\s])md5=([A-Za-z0-9+/=]+)/)?.[1];
  if (!options.integrity && (!options.googleHash || !md5)) {
    await response.body.cancel();
    throw new Error("官方源未提供完整性校验值，未安装");
  }
  const size = Number(response.headers.get("content-length"));
  if (size > 800 * 1024 * 1024) {
    await response.body.cancel();
    throw new Error("安装包超过大小限制");
  }
  const hash = createHash(options.integrity?.algorithm ?? "md5");
  const sha256 = createHash("sha256");
  const file = await open(options.destination, "wx");
  const reader = response.body.getReader();
  let total = 0;
  let succeeded = false;
  try {
    while (true) {
      options.signal.throwIfAborted();
      const item = await reader.read();
      if (item.done) break;
      total += item.value.byteLength;
      if (total > 800 * 1024 * 1024) throw new Error("安装包超过大小限制");
      hash.update(item.value);
      sha256.update(item.value);
      await file.writeFile(item.value);
    }
    if (!total || (size > 0 && size !== total)) throw new Error("安装包下载不完整");
    const expected = options.integrity?.value ?? md5;
    if (hash.digest(options.integrity?.encoding ?? "base64") !== expected)
      throw new Error("安装包完整性校验失败");
    await file.sync();
    succeeded = true;
    return sha256.digest("hex");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    await file.close();
    if (!succeeded) await rm(options.destination, { force: true });
  }
}
