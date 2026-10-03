import { posix, win32 } from "node:path";
import type { McpServerConfig } from "@knorvia/shared";
import { currentHomeDirectory } from "./mcpConfig.js";

const windowsDrive = /^[A-Za-z]:[\\/]/;

function comparablePath(raw: string): { path: string; windows: boolean } | null {
  const value = raw.trim();
  const windows = windowsDrive.test(value) || value.startsWith("\\\\");
  if (!windows && !value.startsWith("/")) return null;
  return { path: value.replace(/\\/g, "/").replace(/\/+$/, "") || "/", windows };
}

function relativeContainedPath(candidate: string, base: string | undefined): string | null {
  if (!base?.trim()) return null;
  const parent = comparablePath(base);
  const child = comparablePath(candidate);
  if (!parent || !child) return null;
  const basePath = parent.windows ? parent.path.toLowerCase() : parent.path;
  const childPath = parent.windows ? child.path.toLowerCase() : child.path;
  if (basePath === childPath) return "";
  const prefix = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return childPath.startsWith(prefix) ? child.path.slice(prefix.length) : null;
}

function joinRemotePath(base: string, relative: string): string {
  if (!relative) return base;
  const segments = relative.split(/[\\/]+/).filter(Boolean);
  const value = base.trim();
  if (value.startsWith("/")) return posix.join(value.replace(/\\/g, "/"), ...segments);
  if (windowsDrive.test(value) || value.startsWith("\\\\")) return win32.join(value, ...segments);
  return posix.join(value.replace(/\\/g, "/"), ...segments);
}

function isFilesystemServer(name: string, config: McpServerConfig): boolean {
  const type = typeof config.type === "string" ? config.type.trim().toLowerCase() : "";
  const command = typeof config.command === "string" ? config.command : "";
  if (type !== "stdio" && (type || !command.trim())) return false;
  if (["filesystem", "file-system", "fs"].includes(name.trim().toLowerCase())) return true;
  const invocation = [
    command,
    ...(Array.isArray(config.args) ? config.args.filter((arg) => typeof arg === "string") : []),
  ]
    .join(" ")
    .toLowerCase();
  return (
    invocation.includes("@modelcontextprotocol/server-filesystem") ||
    invocation.includes("mcp-server-filesystem")
  );
}

export function rewriteFilesystemArguments(
  name: string,
  config: McpServerConfig,
  paths: { localHomeDir: string; localWorkspacePath?: string; remoteWorkspacePath?: string },
): McpServerConfig {
  if (!isFilesystemServer(name, config) || !Array.isArray(config.args)) return config;
  const remoteHomeDir = currentHomeDirectory();
  const args = config.args.map((arg) => {
    const workspaceRelative = relativeContainedPath(arg, paths.localWorkspacePath);
    if (workspaceRelative !== null && paths.remoteWorkspacePath?.trim()) {
      return joinRemotePath(paths.remoteWorkspacePath, workspaceRelative);
    }
    const homeRelative = relativeContainedPath(arg, paths.localHomeDir);
    return homeRelative === null ? arg : joinRemotePath(remoteHomeDir, homeRelative);
  });
  return { ...config, args };
}
