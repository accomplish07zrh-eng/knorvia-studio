import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, dirname } from "node:path";
import { createWindowsComputerUseRuntime, type WindowsComputerRuntime } from "@knorvia/cua/windows";
import type { ComputerUseRuntimeContext } from "@knorvia/cua";
import { WINDOWS_CUA_ARTIFACT } from "@knorvia/cua/windows-artifact";

/** Plugin presence and a verified packaged driver are required; listing tools starts no process. */
export async function captureWindowsComputerRuntime(
  env: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
  arch: string = process.arch,
): Promise<WindowsComputerRuntime | undefined> {
  if (platform !== "win32" || arch !== "x64" || env.KNORVIA_WINDOWS_COMPUTER_USE !== "1")
    return undefined;
  const root = env.KNORVIA_CUA_PLUGIN_ROOT?.trim();
  if (!root || !isAbsolute(root)) return undefined;
  try {
    const plugin = JSON.parse(await readFile(join(root, ".knorvia-plugin/plugin.json"), "utf8"));
    if (plugin.name !== "computer-use" || plugin.version !== "0.7.0") return undefined;
    const directory = await realpath(join(root, "dist/windows"));
    const manifest = JSON.parse(await readFile(join(directory, "driver.json"), "utf8"));
    if (
      manifest.schemaVersion !== 2 ||
      manifest.platform !== "win32" ||
      manifest.arch !== "x64" ||
      manifest.backend !== "cua-driver" ||
      manifest.version !== WINDOWS_CUA_ARTIFACT.version ||
      manifest.archiveSha256 !== WINDOWS_CUA_ARTIFACT.sha256 ||
      manifest.filename !== "cua-driver.exe"
    )
      return undefined;
    for (const [filename, expectedHash] of Object.entries(WINDOWS_CUA_ARTIFACT.files)) {
      const binaryPath = await realpath(join(directory, filename));
      if (dirname(binaryPath) !== directory || manifest.files?.[filename] !== expectedHash)
        return undefined;
      const hash = createHash("sha256")
        .update(await readFile(binaryPath))
        .digest("hex");
      if (hash !== expectedHash) return undefined;
    }
    const driverPath = join(directory, manifest.filename);
    return createWindowsComputerUseRuntime({ driverPath });
  } catch {
    // No fallback to a globally installed executable or a development checkout.
    return undefined;
  }
}

export function windowsComputerContext(meta: unknown): ComputerUseRuntimeContext {
  const value = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  const text = (key: string) => (typeof value[key] === "string" ? (value[key] as string) : "");
  return {
    sessionId: text("session_id"),
    turnId: text("turn_id"),
    workspaceKey: text("workspace_key"),
    workspacePath: text("workspace_path"),
    // Missing or malformed runtime identity is never upgraded to main/desktop access.
    runtimeScope: value.runtime_scope === "main" ? "main" : "subagent",
    clientMode:
      value.client_mode === "desktop-continuous" ? "desktop-continuous" : "web-remote-replayable",
    deliveryKind:
      value.delivery_kind === "desktop-continuous" ? "desktop-continuous" : "web-remote-replayable",
    ...(text("remote_session_id") ? { remoteSessionId: text("remote_session_id") } : {}),
  };
}
