import { access, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, extname, isAbsolute, join, relative, sep } from "node:path";
import type { ExternalKernel } from "../../domain/kernelPolicy.js";
import { record, text } from "../../domain/kernelPolicy.js";
import { BUILTIN_KERNEL_BY_ID, type KernelDescriptor } from "./acpCatalog.js";

export interface KernelExecutable {
  command: string;
  args: string[];
  path: string;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
export async function nodeExecutable(): Promise<string> {
  if (!process.versions.electron) return process.execPath;
  for (const dir of (process.env.PATH ?? process.env.Path ?? "").split(delimiter)) {
    const path = join(dir, process.platform === "win32" ? "node.exe" : "node");
    if (await isFile(path)) return path;
  }
  throw new Error("此 CLI 的 Node 启动器需要已安装的 Node.js，请指定原生可执行文件");
}

async function packageEntrypoint(
  root: string,
  descriptor: KernelDescriptor,
): Promise<string | undefined> {
  try {
    const pkg = record(JSON.parse(await readFile(join(root, "package.json"), "utf8")));
    if (!(descriptor.npmPackages ?? []).includes(text(pkg.name))) return;
    const entry =
      typeof pkg.bin === "string" ? pkg.bin : text(record(pkg.bin)[descriptor.executableName]);
    if (!entry || entry.includes("..") || isAbsolute(entry)) return;
    const actualRoot = await realpath(root);
    const actualEntry = await realpath(join(root, entry));
    const inside = relative(actualRoot, actualEntry);
    if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) return;
    if (await isFile(actualEntry)) return actualEntry;
  } catch {
    /* Only known package metadata is inspected; never execute a shell shim. */
  }
}

async function npmEntrypoint(
  path: string,
  descriptor: KernelDescriptor,
): Promise<string | undefined> {
  for (const packageName of descriptor.npmPackages ?? []) {
    const entry = await packageEntrypoint(
      join(dirname(path), "node_modules", packageName),
      descriptor,
    );
    if (entry) return entry;
  }
}

export async function resolveExecutable(
  kernel: ExternalKernel,
  supplied?: string,
  descriptor = BUILTIN_KERNEL_BY_ID.get(kernel),
): Promise<KernelExecutable> {
  if (!descriptor) throw new Error("未登记的 CLI 内核");
  const name = descriptor.executableName;
  const candidates: string[] = [];
  if (supplied?.trim()) {
    const candidate = supplied.trim();
    if (!isAbsolute(candidate) || candidate.includes("\0"))
      throw new Error("CLI 路径必须是绝对文件路径");
    candidates.push(candidate);
  } else {
    const suffixes = process.platform === "win32" ? [".exe", ".cmd", ".ps1", ""] : [""];
    for (const dir of (process.env.PATH ?? process.env.Path ?? "")
      .split(delimiter)
      .filter(Boolean)) {
      for (const suffix of suffixes)
        candidates.push(join(dir.replace(/^"|"$/g, ""), name + suffix));
    }
    // Bounded well-known per-user locations. Never recurse through application data or launch IDE internals.
    const userBins = [
      join(homedir(), ".local", "bin"),
      join(homedir(), ".bun", "bin"),
      join(homedir(), ".cargo", "bin"),
      ...(process.env.APPDATA
        ? [join(process.env.APPDATA, "npm"), join(process.env.APPDATA, "Python", "Scripts")]
        : []),
      ...(process.env.LOCALAPPDATA
        ? [
            join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Links"),
            join(process.env.LOCALAPPDATA, "uv", "bin"),
          ]
        : []),
    ];
    for (const dir of userBins)
      for (const suffix of suffixes) candidates.push(join(dir, name + suffix));
    if (kernel === "grok-build")
      candidates.push(
        join(homedir(), ".grok", "bin", "grok" + (process.platform === "win32" ? ".exe" : "")),
      );
    if (kernel === "opencode")
      candidates.push(
        join(homedir(), ".opencode", "bin", name + (process.platform === "win32" ? ".exe" : "")),
      );
    if (kernel === "qoder")
      candidates.push(
        join(homedir(), ".qoder", "bin", name + (process.platform === "win32" ? ".exe" : "")),
      );
    if (kernel === "qoder-cn")
      candidates.push(
        join(
          homedir(),
          ".qoder-cn",
          "bin",
          "qoderclicn",
          name + (process.platform === "win32" ? ".exe" : ""),
        ),
      );
    if (kernel === "qwen-code" && process.env.LOCALAPPDATA)
      candidates.push(join(process.env.LOCALAPPDATA, "qwen-code", "bin", "qwen.exe"));
    if (kernel === "antigravity" && process.env.LOCALAPPDATA)
      candidates.push(
        join(
          process.env.LOCALAPPDATA,
          "agy",
          "bin",
          process.platform === "win32" ? "agy.exe" : "agy",
        ),
      );
  }
  for (const candidate of new Set(candidates)) {
    if (!(await isFile(candidate))) continue;
    const actual = await realpath(candidate);
    const extension = extname(actual).toLowerCase();
    if ([".js", ".mjs", ".cjs"].includes(extension))
      return { command: await nodeExecutable(), args: [actual], path: candidate };
    if ([".cmd", ".bat", ".ps1"].includes(extension)) {
      const entry = await npmEntrypoint(candidate, descriptor);
      if (entry) return { command: await nodeExecutable(), args: [entry], path: candidate };
      if (supplied) throw new Error("无法安全解析此 Shell 启动器，请选择原生 exe 或 Node CLI 入口");
      continue;
    }
    if (process.platform !== "win32" || [".exe", ".com"].includes(extension)) {
      await access(actual);
      return { command: actual, args: [], path: candidate };
    }
    const entry = await npmEntrypoint(candidate, descriptor);
    if (entry) return { command: await nodeExecutable(), args: [entry], path: candidate };
  }
  if (!supplied && kernel === "deepseek-harness") {
    // DSH invoked through npx keeps its installed package under this existing profile link,
    // even when `dsh` is absent from PATH. We inspect only that exact package; no npx/network.
    const entry = await packageEntrypoint(
      join(homedir(), ".dsh", "profiles", "node_modules", "@deepseek-ai", "dsh"),
      descriptor,
    );
    if (entry) return { command: await nodeExecutable(), args: [entry], path: entry };
  }
  throw new Error(`${name} 未安装或指定路径无效`);
}

export function nativeBinaryRelative(platform: NodeJS.Platform, arch: string): string {
  const triple =
    platform === "win32"
      ? `${arch === "arm64" ? "aarch64" : "x86_64"}-pc-windows-msvc`
      : platform === "darwin"
        ? `${arch === "arm64" ? "aarch64" : "x86_64"}-apple-darwin`
        : `${arch === "arm64" ? "aarch64" : "x86_64"}-unknown-linux-musl`;
  return join("package", "vendor", triple, "bin", platform === "win32" ? "codex.exe" : "codex");
}
