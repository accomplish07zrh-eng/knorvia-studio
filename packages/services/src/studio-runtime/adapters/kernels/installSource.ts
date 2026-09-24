import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, copyFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { record, text, validVersion, type ExternalKernel } from "../../domain/kernelPolicy.js";
import { downloadVerified, officialText, type Fetcher } from "./download.js";
import { nativeBinaryRelative } from "./executable.js";
import { extractOfficialPackage } from "./tarExtract.js";

export async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
export async function installOfficialKernel(
  kernel: ExternalKernel,
  stage: string,
  signal: AbortSignal,
  fetcher?: Fetcher,
): Promise<{ version: string; executable: string; sha256: string }> {
  if (
    !["win32", "darwin", "linux"].includes(process.platform) ||
    !["x64", "arm64"].includes(process.arch)
  )
    throw new Error("当前系统架构没有受支持的官方内核安装包");
  if (kernel === "codex") {
    const metadata = record(
      JSON.parse(
        await officialText("https://registry.npmjs.org/@openai%2Fcodex/latest", signal, fetcher),
      ),
    );
    const version = validVersion(metadata.version);
    const target = `${process.platform}-${process.arch}`;
    const dependency = text(record(metadata.optionalDependencies)[`@openai/codex-${target}`]);
    const suffix = dependency.match(/^npm:@openai\/codex@(\d+\.\d+\.\d+(?:-[\w.-]+)?)$/)?.[1];
    const packageUrl = suffix
      ? `https://registry.npmjs.org/@openai%2Fcodex/${validVersion(suffix)}`
      : `https://registry.npmjs.org/@openai%2Fcodex-${target}/${version}`;
    const platform = record(JSON.parse(await officialText(packageUrl, signal, fetcher)));
    const dist = record(platform.dist);
    const integrity = text(dist.integrity).match(/^sha512-([A-Za-z0-9+/=]+)$/)?.[1];
    if (!integrity) throw new Error("Codex 官方包缺少 SHA-512 完整性元数据");
    const archive = join(stage, "codex.tgz");
    await downloadVerified({
      url: text(dist.tarball),
      destination: archive,
      signal,
      integrity: { algorithm: "sha512", value: integrity, encoding: "base64" },
      fetcher,
    });
    await extractOfficialPackage(archive, stage, signal);
    await rm(archive);
    const executable = nativeBinaryRelative(process.platform, process.arch);
    return { version, executable, sha256: await hashFile(join(stage, executable)) };
  }
  if (kernel === "claude-code") {
    const base = "https://downloads.claude.ai/claude-code-releases";
    const version = validVersion(await officialText(`${base}/latest`, signal, fetcher));
    const manifest = record(
      JSON.parse(await officialText(`${base}/${version}/manifest.json`, signal, fetcher)),
    );
    const platform = `${process.platform}-${process.arch}`;
    const checksum = text(record(record(manifest.platforms)[platform]).checksum);
    if (!/^[a-f0-9]{64}$/i.test(checksum)) throw new Error("Claude 官方清单缺少该平台的 SHA-256");
    const executable = process.platform === "win32" ? "claude.exe" : "claude";
    const sha256 = await downloadVerified({
      url: `${base}/${version}/${platform}/${executable}`,
      destination: join(stage, executable),
      signal,
      integrity: { algorithm: "sha256", value: checksum.toLowerCase(), encoding: "hex" },
      fetcher,
    });
    await chmod(join(stage, executable), 0o755);
    return { version, executable, sha256 };
  }
  const base = "https://storage.googleapis.com/grok-build-public-artifacts/cli";
  const version = validVersion(await officialText(`${base}/stable`, signal, fetcher));
  const platform = `${process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux"}-${process.arch === "arm64" ? "aarch64" : "x86_64"}`;
  const suffix = process.platform === "win32" ? ".exe" : "";
  const executable = "grok" + suffix;
  // 官方 GCS 对象提供 x-goog-hash；校验下载后另存 SHA-256，避免冒充不存在的签名验证。
  const sha256 = await downloadVerified({
    url: `${base}/grok-${version}-${platform}${suffix}`,
    destination: join(stage, executable),
    signal,
    googleHash: true,
    fetcher,
  });
  await chmod(join(stage, executable), 0o755);
  await copyFile(join(stage, executable), join(stage, "agent" + suffix));
  return { version, executable, sha256 };
}
