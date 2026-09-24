import { lstat, readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, parse } from "node:path";
import { kernelCapabilities, record, text } from "../../domain/kernelPolicy.js";
import type { StudioKernelStatus } from "../../kernelTypes.js";
import type { KernelDescriptor } from "./acpCatalog.js";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const MAX_MANIFESTS = 64;

export interface AcpManifestCatalog {
  entries: KernelDescriptor[];
  rejected: StudioKernelStatus[];
}

/** Manifests are opt-in files under Studio's own data directory, not arbitrary PATH discovery. */
export async function inspectAcpManifests(dataDir: string): Promise<AcpManifestCatalog> {
  const directory = join(dataDir, "kernels", "acp");
  let names: string[];
  try {
    if ((await lstat(join(dataDir, "kernels"))).isSymbolicLink())
      throw new Error("ACP 清单父目录不能是符号链接");
    if ((await lstat(directory)).isSymbolicLink()) throw new Error("ACP 清单目录不能是符号链接");
    names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { entries: [], rejected: [] };
    names = [];
    return {
      entries: [],
      rejected: [
        rejectedStatus("acp:manifest-directory", "ACP 清单目录", "ACP 清单目录无法读取或被重定向"),
      ],
    };
  }
  if (names.length > MAX_MANIFESTS)
    return {
      entries: [],
      rejected: [rejectedStatus("acp:manifest-limit", "ACP 清单", "ACP 清单数量超过上限")],
    };
  const result: KernelDescriptor[] = [];
  const rejected: StudioKernelStatus[] = [];
  for (const name of names) {
    const slug = name.slice(0, -5);
    const id: `acp:${string}` = SLUG.test(slug)
      ? `acp:${slug}`
      : `acp:invalid-manifest-${rejected.length + 1}`;
    const fail = (reason: string) => rejected.push(rejectedStatus(id, name, `${name}：${reason}`));
    if (!SLUG.test(slug)) {
      fail("文件名须使用 1–64 位小写字母、数字或连字符");
      continue;
    }
    const path = join(directory, name);
    const file = await lstat(path).catch(() => undefined);
    if (!file) {
      fail("清单文件无法读取");
      continue;
    }
    if (!file.isFile() || file.size > 8192) {
      fail("清单不是普通文件或超过 8 KiB");
      continue;
    }
    let value: Record<string, unknown>;
    try {
      value = record(JSON.parse(await readFile(path, "utf8")));
    } catch {
      fail("JSON 无效或无法读取");
      continue;
    }
    const command = text(value.command).trim();
    const displayName = text(value.displayName).trim();
    const args = value.args;
    if (
      !isAbsolute(command) ||
      command.includes("\0") ||
      !displayName ||
      displayName.length > 80 ||
      /[\r\n]/.test(displayName) ||
      !Array.isArray(args) ||
      args.length > 32 ||
      !args.every((arg) => typeof arg === "string" && arg.length <= 1024 && !arg.includes("\0"))
    ) {
      fail("显示名、绝对程序路径或参数格式无效");
      continue;
    }
    // A custom entry may point at a native binary or a Node/Python entrypoint, never a shell script.
    if (/\.(cmd|bat|ps1|sh|bash)$/i.test(command)) {
      fail("不允许以 shell 启动脚本作为清单程序");
      continue;
    }
    result.push({
      id: `acp:${slug}`,
      displayName,
      executableName: parse(command).name,
      customPath: command,
      args,
      protocol: "acp",
      management: "external",
    });
  }
  return { entries: result, rejected };
}

export async function loadAcpManifests(dataDir: string): Promise<KernelDescriptor[]> {
  return (await inspectAcpManifests(dataDir)).entries;
}

function rejectedStatus(
  id: `acp:${string}`,
  displayName: string,
  error: string,
): StudioKernelStatus {
  return {
    id,
    displayName,
    management: "external",
    installed: false,
    origin: "missing",
    error,
    capabilities: kernelCapabilities(id),
  };
}
