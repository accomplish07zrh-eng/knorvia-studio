import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { WINDOWS_CUA_ARTIFACT as artifact } from "../windows-artifact.js";

const execute = promisify(execFile);
const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../apps/cli/packages/cua-plugin",
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function stageWindowsCuaDriver({
  outDir = join(packageRoot, "dist/windows"),
  archivePath = process.env.KNORVIA_CUA_DRIVER_ARCHIVE,
} = {}) {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error("Cua desktop packaging currently supports Windows x64 only.");
  const scratch = await mkdtemp(join(tmpdir(), "knorvia-cua-stage-"));
  try {
    let archive = archivePath ? resolve(archivePath) : join(scratch, "driver.zip");
    if (!archivePath) {
      const response = await fetch(artifact.url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`Cua artifact download failed: HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 64 * 1024 * 1024 || digest(bytes) !== artifact.sha256)
        throw new Error("Cua official archive SHA-256 mismatch");
      await writeFile(archive, bytes);
    }
    if (digest(await readFile(archive)) !== artifact.sha256)
      throw new Error("Cua official archive SHA-256 mismatch");
    const extracted = join(scratch, "extracted");
    // 环境变量传入路径，避免把本地路径拼入 PowerShell 代码。
    await execute(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Expand-Archive -LiteralPath $env:KNORVIA_CUA_STAGE_ARCHIVE -DestinationPath $env:KNORVIA_CUA_STAGE_DESTINATION",
      ],
      {
        windowsHide: true,
        timeout: 60_000,
        env: {
          ...process.env,
          KNORVIA_CUA_STAGE_ARCHIVE: archive,
          KNORVIA_CUA_STAGE_DESTINATION: extracted,
        },
      },
    );
    for (const [filename, sha256] of Object.entries(artifact.files)) {
      if (digest(await readFile(join(extracted, filename))) !== sha256)
        throw new Error(`Cua binary SHA-256 mismatch: ${filename}`);
    }
    await mkdir(outDir, { recursive: true });
    for (const filename of Object.keys(artifact.files))
      await copyFile(join(extracted, filename), join(outDir, filename));
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
  } finally {
    // scratch 是本函数刚创建的临时目录，不接受调用者指定的清理目标。
    await rm(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.platform !== "win32") console.log("Windows Cua driver skipped on this build host.");
  else {
    await stageWindowsCuaDriver();
    console.log(`Staged official Cua driver ${artifact.version}; SHA-256 verified.`);
  }
}
