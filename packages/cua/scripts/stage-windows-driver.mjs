import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { unzipSync } from "fflate";
import { WINDOWS_CUA_ARTIFACT as artifact } from "../windows-artifact.js";

const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../apps/cli/packages/cua-plugin",
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

export function verifyWindowsCuaArchive(bytes, pinned = artifact) {
  if (bytes.length > MAX_ARCHIVE_BYTES || digest(bytes) !== pinned.sha256)
    throw new Error("Cua official archive SHA-256 mismatch");
  // 云端的两种 PowerShell 解压命令均卡住；在 Node 内解压固定清单，消除子进程依赖。
  // 先验整包、后验每个文件，未校验通过前不写入插件目录，也不提取归档提供的任意路径。
  const files = unzipSync(bytes, {
    filter: ({ name, originalSize }) => {
      if (!Object.hasOwn(pinned.files, name)) return false;
      if (originalSize > MAX_ARCHIVE_BYTES) throw new Error(`Cua binary is too large: ${name}`);
      return true;
    },
  });
  for (const [filename, sha256] of Object.entries(pinned.files)) {
    if (!Object.hasOwn(files, filename))
      throw new Error(`Required Cua binary is missing: ${filename}`);
    if (digest(files[filename]) !== sha256)
      throw new Error(`Cua binary SHA-256 mismatch: ${filename}`);
  }
  return files;
}

export async function stageWindowsCuaDriver({
  outDir = join(packageRoot, "dist/windows"),
  archivePath = process.env.KNORVIA_CUA_DRIVER_ARCHIVE,
} = {}) {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error("Cua desktop packaging currently supports Windows x64 only.");
  let bytes;
  if (archivePath) bytes = await readFile(resolve(archivePath));
  else {
    const response = await fetch(artifact.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Cua artifact download failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  const files = verifyWindowsCuaArchive(bytes);
  await mkdir(outDir, { recursive: true });
  for (const filename of Object.keys(artifact.files))
    await writeFile(join(outDir, filename), files[filename]);
  // 只移除本轮原型的确切产物，禁止把旧原型混进正式插件。
  await rm(join(outDir, "knorvia-computer-driver.exe"), { force: true });
  const manifest = {
    schemaVersion: 2,
    platform: "win32",
    arch: "x64",
    backend: "cua-driver",
    version: artifact.version,
    filename: "cua-driver.exe",
    source: artifact.url,
    archiveSha256: artifact.sha256,
    files: artifact.files,
  };
  await writeFile(join(outDir, "driver.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.platform !== "win32") console.log("Windows Cua driver skipped on this build host.");
  else {
    await stageWindowsCuaDriver();
    console.log(`Staged official Cua driver ${artifact.version}; SHA-256 verified.`);
  }
}
