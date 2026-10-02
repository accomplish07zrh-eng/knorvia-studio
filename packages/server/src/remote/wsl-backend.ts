/* eslint-disable max-lines -- WSL identity, owned children and disposal share one lifecycle owner. */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { dirname, posix } from "node:path";
import type { WSLConnectOptions } from "@knorvia/shared";
import type {
  IRemoteBackend,
  RemoteEnvironment,
  RemoteUploadOptions,
  StdioStream,
} from "@knorvia/server/remote/backend.js";
import { createCloseEventController } from "@knorvia/server/remote/closeEvent.js";
import {
  normalizeRemoteArch,
  normalizeRemotePlatform,
  resolveRemotePlatform,
} from "@knorvia/server/remote/detectEnv.js";
import {
  isWSLAvailable,
  listWSLDistros,
  type WSLDistro,
} from "@knorvia/server/remote/wsl-detect.js";
import {
  buildWslHostGatewayCommand,
  buildWslProxyPortProbeCommand,
  isLoopbackProxyHostname,
  normalizeWslProxyUrl,
  parseWslHostGatewayOutput,
  parseWslProxyPortProbeOutput,
  replaceProxyHostname,
} from "@knorvia/server/remote/wslProxy.js";

export function buildWslArgs(
  commandArgs: string[],
  distroName?: string | null,
  userName?: string | null,
): string[] {
  const args: string[] = [];
  if (distroName) args.push("-d", distroName);
  if (userName) args.push("-u", userName);
  return [...args, "--", ...commandArgs];
}

export interface ResolvedWSLIdentity {
  distro: string;
  user: string;
}

interface WSLInfo {
  distroName: string | null;
  userName: string | null;
  version: 1 | 2 | null;
  homeDir: string;
}

interface OwnedChild {
  closed: Promise<void>;
  resolveClosed: () => void;
}

function quoteShell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function normalizeWslOutput(value: string): string {
  return value
    .replaceAll("\u0000", "")
    .replace(/^\uFEFF/, "")
    .replace(/\r/g, "");
}

function decodeWslBuffer(buffer: Buffer): string {
  if (buffer.length === 0) return "";
  return buffer.toString(buffer.includes(0) ? "utf16le" : "utf8");
}

function uncCandidates(distro: string, linuxPath: string): string[] {
  const segments = linuxPath.replaceAll("\\", "/").split("/").filter(Boolean).join("\\");
  const suffix = segments ? `\\${segments}` : "";
  return [`\\\\wsl.localhost\\${distro}${suffix}`, `\\\\wsl$\\${distro}${suffix}`];
}

async function accessAnyPath(paths: string[]): Promise<string | null> {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      // Each UNC spelling is attempted independently.
    }
  }
  return null;
}

async function copyFileToAnyPath(source: string, paths: string[]): Promise<boolean> {
  for (const target of paths) {
    try {
      await mkdir(dirname(target), { recursive: true });
      await copyFile(source, target);
      return true;
    } catch {
      // A failed spelling leaves the next candidate eligible.
    }
  }
  return false;
}

function uploadCanceled(): Error {
  const error = new Error("Remote upload canceled");
  error.name = "AbortError";
  return error;
}

export class WSLBackend implements IRemoteBackend {
  readonly kind = "wsl";
  private readonly options: WSLConnectOptions;
  private infoPromise: Promise<WSLInfo> | null = null;
  private readonly ownedChildren = new Map<ChildProcess, OwnedChild>();
  private disposed = false;
  private disposeInFlight: Promise<void> | null = null;

  constructor(options: WSLConnectOptions) {
    this.options = options;
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error("WSL backend 已释放，无法启动新命令");
  }

  private trackOwnedChild(child: ChildProcess): void {
    let resolveClosed!: () => void;
    const closed = new Promise<void>((resolve) => {
      resolveClosed = resolve;
    });
    this.ownedChildren.set(child, { closed, resolveClosed });
    const finish = () => {
      const state = this.ownedChildren.get(child);
      if (!state) return;
      this.ownedChildren.delete(child);
      state.resolveClosed();
    };
    child.once("error", finish);
    child.once("exit", finish);
    child.once("close", finish);
  }

  private async execWslForBuffer(args: string[]): Promise<Buffer> {
    this.assertNotDisposed();
    return new Promise((resolve, reject) => {
      const child = execFile(
        "wsl.exe",
        args,
        { encoding: "buffer", maxBuffer: 8 * 1024 * 1024, windowsHide: true },
        (error, stdout, stderr) => {
          const stdoutBuffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? "");
          const stderrBuffer = Buffer.isBuffer(stderr) ? stderr : Buffer.from(stderr ?? "");
          const stderrText = normalizeWslOutput(decodeWslBuffer(stderrBuffer)).trim();
          if (error) reject(new Error(stderrText || error.message));
          else resolve(stdoutBuffer);
        },
      );
      this.trackOwnedChild(child);
    });
  }

  private async execDirect(
    commandArgs: string[],
    distroName?: string | null,
    userName?: string | null,
  ): Promise<string> {
    const buffer = await this.execWslForBuffer(buildWslArgs(commandArgs, distroName, userName));
    return normalizeWslOutput(decodeWslBuffer(buffer));
  }

  private async ensureAvailable(): Promise<void> {
    if (process.platform !== "win32") throw new Error("WSL 连接仅支持在 Windows 上使用");
    if (!(await isWSLAvailable((args) => this.execWslForBuffer(args)))) {
      throw new Error("当前系统未检测到可用的 WSL 环境");
    }
  }

  private async safeListDistros(): Promise<WSLDistro[]> {
    try {
      return await listWSLDistros((args) => this.execWslForBuffer(args));
    } catch {
      return [];
    }
  }

  private pickDistro(distros: WSLDistro[]): WSLDistro | null {
    const requested = this.options.distro?.trim();
    if (requested) {
      if (distros.length === 0) return null;
      const selected = distros.find(
        (distro) => distro.name.localeCompare(requested, undefined, { sensitivity: "base" }) === 0,
      );
      if (!selected) throw new Error(`未找到名为 ${this.options.distro} 的 WSL distro`);
      return selected;
    }
    return distros.find((distro) => distro.isDefault) ?? distros[0] ?? null;
  }

  private async resolveInfo(): Promise<WSLInfo> {
    if (this.infoPromise) return this.infoPromise;
    this.infoPromise = (async () => {
      const distros = await this.safeListDistros();
      const selected = this.pickDistro(distros);
      const launchDistro = selected?.name ?? this.options.distro?.trim() ?? null;
      const requestedUser = this.options.user?.trim() || null;
      const identity = normalizeWslOutput(
        await this.execDirect(
          ["bash", "-lc", `printf '%s\\n' "$WSL_DISTRO_NAME"; id -un; printf %s "$HOME"`],
          launchDistro,
          requestedUser,
        ),
      );
      const [reportedDistro = "", actualUser = "", ...homeLines] = identity.split("\n");
      const distroName = reportedDistro.trim() || launchDistro;
      const userName = actualUser.trim() || requestedUser;
      const homeDir = homeLines.join("\n").trim();
      if (!homeDir) throw new Error("无法解析 WSL 用户 HOME");
      return { distroName, userName, version: selected?.version ?? null, homeDir };
    })();
    return this.infoPromise;
  }

  async resolveIdentity(): Promise<ResolvedWSLIdentity> {
    await this.ensureAvailable();
    const info = await this.resolveInfo();
    if (!info.distroName || !info.userName) throw new Error("无法解析 WSL 实际 distro/user 身份");
    return { distro: info.distroName, user: info.userName };
  }

  private async resolveLinuxPath(path: string, info: WSLInfo): Promise<string> {
    if (path === "~") return info.homeDir;
    if (path.startsWith("~/")) return posix.join(info.homeDir, path.slice(2));
    return path;
  }

  private async execSimple(command: string): Promise<string> {
    const info = await this.resolveInfo();
    return this.execDirect(["bash", "-lc", command], info.distroName, info.userName);
  }

  private async readKernelOstype(): Promise<string> {
    try {
      return normalizeWslOutput(
        await this.execSimple(
          "if [ -r /proc/sys/kernel/ostype ]; then cat /proc/sys/kernel/ostype; fi",
        ),
      ).trim();
    } catch {
      return "";
    }
  }

  async detect(): Promise<RemoteEnvironment> {
    await this.ensureAvailable();
    const reported = normalizeRemotePlatform(normalizeWslOutput(await this.execSimple("uname -s")));
    const arch = normalizeRemoteArch(normalizeWslOutput(await this.execSimple("uname -m")));
    const kernel = await this.readKernelOstype();
    const platform = resolveRemotePlatform(reported, kernel);
    return { platform, arch };
  }

  async exec(command: string): Promise<StdioStream> {
    this.assertNotDisposed();
    await this.ensureAvailable();
    const info = await this.resolveInfo();
    this.assertNotDisposed();
    return new Promise((resolve, reject) => {
      const child = spawn(
        "wsl.exe",
        buildWslArgs(["bash", "-lc", command], info.distroName, info.userName),
        { stdio: "pipe", windowsHide: true },
      );
      this.trackOwnedChild(child);
      child.once("error", reject);
      child.once("spawn", () => {
        const stdin = child.stdin;
        const stdout = child.stdout;
        const stderr = child.stderr;
        if (!stdin || !stdout || !stderr) {
          reject(new Error("WSL process stdio is not available"));
          return;
        }
        const close = createCloseEventController();
        let fired = false;
        const fire = (code: number | null) => {
          if (fired) return;
          fired = true;
          close.fire(code ?? 0);
        };
        child.on("exit", fire);
        child.on("close", fire);
        resolve({ stdin, stdout, stderr, onClose: close.event });
      });
    });
  }

  dispose(): void {
    void this.disposeAndWait();
  }

  disposeAndWait(options?: { graceTimeoutMs?: number; killWaitTimeoutMs?: number }): Promise<void> {
    if (this.disposeInFlight) return this.disposeInFlight;
    this.disposed = true;
    const graceTimeoutMs = Math.max(options?.graceTimeoutMs ?? 300, 0);
    const killWaitTimeoutMs = Math.max(options?.killWaitTimeoutMs ?? 250, 0);
    const children = [...this.ownedChildren.entries()];
    for (const [child] of children) this.endOwnedStdin(child);
    this.disposeInFlight = Promise.all(
      children.map(async ([child, state]) => {
        if (await this.waitForOwnedClose(state.closed, graceTimeoutMs)) return;
        if (this.ownedChildren.has(child)) child.kill();
        await this.waitForOwnedClose(state.closed, killWaitTimeoutMs);
      }),
    ).then(() => undefined);
    return this.disposeInFlight;
  }

  private endOwnedStdin(child: ChildProcess): void {
    if (!child.stdin || child.stdin.writableEnded) return;
    try {
      child.stdin.end();
    } catch {
      // Disposal still waits for the owned child when stdin has already failed.
    }
  }

  private async waitForOwnedClose(closed: Promise<void>, timeoutMs: number): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = await Promise.race([
      closed.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
    if (timer) clearTimeout(timer);
    return result;
  }

  async upload(local: string, remote: string, options?: RemoteUploadOptions): Promise<void> {
    await this.ensureAvailable();
    const info = await this.resolveInfo();
    const resolved = await this.resolveLinuxPath(remote, info);
    if (options?.onProgress || options?.signal) {
      await this.uploadViaExec(local, resolved, options);
      return;
    }
    if (
      info.distroName &&
      (await copyFileToAnyPath(local, uncCandidates(info.distroName, resolved)))
    ) {
      return;
    }
    const parent = posix.dirname(resolved);
    const stream = await this.exec(
      `mkdir -p ${quoteShell(parent)} && cat > ${quoteShell(resolved)}`,
    );
    await new Promise<void>((resolve, reject) => {
      const readStream = createReadStream(local);
      const stdin = stream.stdin as NodeJS.WritableStream & { destroy?: (error?: Error) => void };
      let settled = false;
      const finishWithError = (error: Error) => {
        if (settled) return;
        settled = true;
        readStream.destroy();
        if (typeof stdin.destroy === "function") stdin.destroy(error);
        else stdin.end();
        reject(error);
      };
      readStream.on("error", (error) => finishWithError(error));
      stdin.on("error", (error: Error) => finishWithError(error));
      readStream.pipe(stdin);
      stream.onClose((code) => {
        if (settled) return;
        settled = true;
        if (code !== 0) reject(new Error(`WSL upload failed with exit code ${code}`));
        else resolve();
      });
    });
  }

  private async uploadViaExec(
    local: string,
    remote: string,
    options: RemoteUploadOptions,
  ): Promise<void> {
    const totalBytes = await stat(local).then((entry) => entry.size);
    if (options.signal?.aborted) throw uploadCanceled();
    const parent = posix.dirname(remote);
    const stream = await this.exec(`mkdir -p ${quoteShell(parent)} && cat > ${quoteShell(remote)}`);
    await new Promise<void>((resolve, reject) => {
      const readStream = createReadStream(local);
      const stdin = stream.stdin as NodeJS.WritableStream & { destroy?: (error?: Error) => void };
      let uploadedBytes = 0;
      let settled = false;
      const finishError = (error: Error) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener("abort", abort);
        readStream.destroy();
        stdin.destroy?.(error);
        reject(error);
      };
      const abort = () => finishError(uploadCanceled());
      options.signal?.addEventListener("abort", abort, { once: true });
      readStream.on("data", (chunk: Buffer) => {
        uploadedBytes += chunk.length;
        options.onProgress?.({ uploadedBytes, totalBytes });
      });
      readStream.on("error", finishError);
      stdin.on("error", finishError);
      stream.onClose((code) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener("abort", abort);
        if (code !== 0) reject(new Error(`WSL upload failed with exit code ${code}`));
        else {
          options.onProgress?.({ uploadedBytes: totalBytes, totalBytes });
          resolve();
        }
      });
      readStream.pipe(stdin);
    });
  }

  async exists(path: string): Promise<boolean> {
    await this.ensureAvailable();
    const info = await this.resolveInfo();
    const resolved = await this.resolveLinuxPath(path, info);
    if (info.distroName && (await accessAnyPath(uncCandidates(info.distroName, resolved))))
      return true;
    try {
      await this.execSimple(`test -f ${quoteShell(resolved)} && printf OK`);
      return true;
    } catch {
      return false;
    }
  }

  async readFile(path: string): Promise<string> {
    await this.ensureAvailable();
    const info = await this.resolveInfo();
    const resolved = await this.resolveLinuxPath(path, info);
    if (info.distroName) {
      const accessible = await accessAnyPath(uncCandidates(info.distroName, resolved));
      if (accessible) return readFile(accessible, "utf8");
    }
    return normalizeWslOutput(await this.execSimple(`cat ${quoteShell(resolved)}`));
  }

  async resolveRuntimeProxy(proxyUrl: string): Promise<string> {
    const normalized = normalizeWslProxyUrl(proxyUrl);
    if (!normalized) return proxyUrl;
    const url = new URL(normalized);
    if (!isLoopbackProxyHostname(url.hostname)) return proxyUrl;
    await this.ensureAvailable();
    if ((await this.probeRuntimeProxy(normalized)) === true) return normalized;
    try {
      const gateway = parseWslHostGatewayOutput(
        await this.execSimple(buildWslHostGatewayCommand()),
      );
      if (!gateway) return normalized;
      const replacement = replaceProxyHostname(normalized, gateway);
      return (await this.probeRuntimeProxy(replacement)) === true ? replacement : normalized;
    } catch {
      return normalized;
    }
  }

  private async probeRuntimeProxy(proxyUrl: string): Promise<boolean | undefined> {
    const command = buildWslProxyPortProbeCommand(proxyUrl);
    if (command === null) return undefined;
    try {
      return parseWslProxyPortProbeOutput(await this.execSimple(command));
    } catch {
      return undefined;
    }
  }
}
