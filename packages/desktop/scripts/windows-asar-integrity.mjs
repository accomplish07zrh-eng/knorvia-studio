import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { getRawHeader } from "@electron/asar";

const require = createRequire(import.meta.url);
// 使用 electron-builder 自己的资源编辑器版本，保持与它的 Windows 打包逻辑一致。
const builderRequire = createRequire(require.resolve("electron-builder/package.json"));
const appBuilderRequire = createRequire(builderRequire.resolve("app-builder-lib/package.json"));
const { NtExecutable, NtExecutableResource } = appBuilderRequire("resedit");

export async function refreshWindowsAsarIntegrity(executablePath, asarPath) {
  const hash = createHash("sha256").update(getRawHeader(asarPath).headerString).digest("hex");
  const executable = NtExecutable.from(await readFile(executablePath), { ignoreCert: true });
  const resources = NtExecutableResource.from(executable);
  const isAppIntegrity = (entry) =>
    String(entry.type).toUpperCase() === "INTEGRITY" &&
    String(entry.id).toUpperCase() === "ELECTRONASAR";
  const previous = resources.entries.find(isAppIntegrity);
  if (!previous) throw new Error("Windows package is missing its Electron ASAR integrity resource");
  // afterPack 会重写 archive，旧 hash 不再匹配。更新同一资源，避免重复条目；随后由 builder 签名。
  resources.entries = resources.entries.filter((entry) => !isAppIntegrity(entry));
  resources.entries.push({
    ...previous,
    bin: Buffer.from(JSON.stringify([{ file: "resources\\app.asar", alg: "SHA256", value: hash }])),
  });
  resources.outputResource(executable);
  await writeFile(executablePath, Buffer.from(executable.generate()));
  return hash;
}
