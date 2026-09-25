import { spawn } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  errorText,
  record,
  safeDetail,
  text,
  type ExternalKernel,
} from "../../domain/kernelPolicy.js";
import { BUILTIN_KERNEL_BY_ID } from "./acpCatalog.js";
import { expandShortNames } from "../longPath.js";
import type { KernelExecutable } from "./executable.js";
import { stopOwnedTree } from "./processTransport.js";

export interface ExternalUpdatePlan {
  command: string;
  args: string[];
  cwd: string;
  method: "native" | "npm";
}

const NATIVE_UPDATES: Partial<
  Record<ExternalKernel, { name: string; args: readonly string[]; versionedTarget?: boolean }>
> = {
  "claude-code": { name: "claude", args: ["update"] },
  "grok-build": { name: "grok", args: ["update"] },
  opencode: { name: "opencode", args: ["upgrade"] },
  qoder: { name: "qoder", args: ["update"], versionedTarget: true },
  "qoder-cn": { name: "qoderclicn", args: ["update"], versionedTarget: true },
  goose: { name: "goose", args: ["update"] },
  // Hermes' documented noninteractive flag accepts migration/stash prompts.
  hermes: { name: "hermes", args: ["update", "--yes"] },
};

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export function nativeLauncherMatches(
  native: { name: string; versionedTarget?: boolean },
  candidate: string,
  actual: string,
): boolean {
  const extension = process.platform === "win32" ? ".exe" : "";
  const expectedName = native.name + extension;
  if (basename(candidate).toLowerCase() !== expectedName) return false;
  if (basename(actual).toLowerCase() === expectedName) return true;
  return Boolean(
    native.versionedTarget &&
      dirname(actual).toLowerCase() === dirname(candidate).toLowerCase() &&
      new RegExp(`^${native.name}-\\d+\\.\\d+\\.\\d+(?:-[a-z0-9.-]+)?${extension.replace(".", "\\.")}$`, "i")
        .test(basename(actual)),
  );
}

/** Only verified native launchers and npm packages within their detected prefix receive an action. */
export async function externalUpdatePlan(
  kernel: ExternalKernel,
  executable: KernelExecutable,
): Promise<ExternalUpdatePlan | undefined> {
  const native = NATIVE_UPDATES[kernel];
  if (native && executable.args.length === 0) {
    const actual = await realpath(executable.path).catch(() => undefined);
    // realpath 会把 Windows 8.3 短名展开为长名，命令路径同样只展开短名后再比较，
    // 否则长用户名机器上的原生 CLI 永远得不到更新入口。
    if (
      actual &&
      resolve(actual) === resolve(await expandShortNames(executable.command)) &&
      nativeLauncherMatches(native, executable.path, actual) &&
      (process.platform !== "win32" || extname(actual).toLowerCase() === ".exe")
    )
      return {
        command: executable.command,
        args: [...native.args],
        cwd: dirname(actual),
        method: "native",
      };
  }
  if (process.platform !== "win32") return;
  const descriptor = BUILTIN_KERNEL_BY_ID.get(kernel);
  if (!descriptor?.npmPackages?.length) return;
  if (basename(executable.path).toLowerCase() !== `${descriptor.executableName}.cmd`) return;
  if (executable.args.length !== 1) return;
  const prefix = dirname(executable.path);
  const npmCli = join(prefix, "node_modules", "npm", "bin", "npm-cli.js");
  const node = join(prefix, "node.exe");
  if (!(await isFile(node)) || !(await isFile(npmCli))) return;
  for (const packageName of descriptor.npmPackages) {
    const packageRoot = join(prefix, "node_modules", ...packageName.split("/"));
    try {
      const metadata = record(
        JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")),
      );
      if (text(metadata.name) !== packageName) continue;
      const entry =
        typeof metadata.bin === "string"
          ? metadata.bin
          : text(record(metadata.bin)[descriptor.executableName]);
      if (!entry || isAbsolute(entry)) continue;
      const packageEntry = await realpath(join(packageRoot, entry));
      const inside = relative(await realpath(packageRoot), packageEntry);
      if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside))
        continue;
      if (resolve(packageEntry) !== resolve(await realpath(executable.args[0]!))) continue;
      return {
        command: node,
        args: [npmCli, "install", "-g", "--prefix", prefix, `${packageName}@latest`],
        cwd: prefix,
        method: "npm",
      };
    } catch {
      // Try the next catalogued package; never infer an update from a shell shim alone.
    }
  }
}

/** Runs only a prevalidated argv, without shell interpolation or a model request. */
export async function runExternalUpdate(
  plan: ExternalUpdatePlan,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw new Error("CLI 更新已取消");
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  delete environment.NODE_PATH;
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(plan.command, plan.args, {
    cwd: plan.cwd,
    env: environment,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let timedOut = false;
  let aborted = false;
  const append = (chunk: Buffer) => {
    output = (output + chunk.toString("utf8")).slice(-4000);
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  const abort = () => {
    aborted = true;
    void stopOwnedTree(child);
  };
  const timer = setTimeout(() => {
    timedOut = true;
    void stopOwnedTree(child);
  }, 20 * 60_000);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    if (timedOut) throw new Error("CLI 更新超过 20 分钟；请检查原 CLI 的安装状态");
    if (aborted) throw new Error("CLI 更新已中断；请重新检测安装状态");
    if (code !== 0)
      throw new Error(
        `CLI 官方更新程序退出 (${code ?? "unknown"})：${safeDetail(output).slice(-2000)}`,
      );
  } catch (error) {
    throw new Error(errorText(error));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
