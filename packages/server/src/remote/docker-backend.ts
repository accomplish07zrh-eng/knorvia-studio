import { execFile, spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { DockerConnectOptions } from "@knorvia/shared";
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
  isDockerAvailable,
  listDockerContainers,
  resolveDockerCommand,
} from "@knorvia/server/remote/docker-detect.js";

function quoteShell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function normalizeDockerOutput(value: string): string {
  return value.replace(/\r/g, "");
}

function linuxDirectory(path: string): string {
  const collapsed = path.replace(/\/+/g, "/");
  const index = collapsed.lastIndexOf("/");
  return index <= 0 ? "/" : collapsed.slice(0, index);
}

function uploadCanceled(): Error {
  const error = new Error("Remote upload canceled");
  error.name = "AbortError";
  return error;
}

export class DockerBackend implements IRemoteBackend {
  private readonly dockerCommand = resolveDockerCommand();
  private readonly options: DockerConnectOptions;
  private infoPromise: Promise<{ containerName: string; homeDir: string }> | null = null;

  constructor(options: DockerConnectOptions) {
    this.options = options;
  }

  private async ensureAvailable(): Promise<void> {
    if (!(await isDockerAvailable())) {
      throw new Error("当前系统未检测到可用的 Docker 环境");
    }
  }

  private async resolveContainer() {
    const containers = await listDockerContainers({ all: true });
    const container = containers.find(
      (candidate) =>
        candidate.name === this.options.container ||
        candidate.id === this.options.container ||
        candidate.id.startsWith(this.options.container),
    );
    if (!container) {
      throw new Error(`未找到名为 ${this.options.container} 的 Docker 容器`);
    }
    if (container.state.toLowerCase() !== "running") {
      throw new Error(
        `Docker 容器 ${container.name} 当前未运行（state=${container.state || "unknown"}）`,
      );
    }
    return container;
  }

  private async execDirect(commandArgs: string[]): Promise<string> {
    const container = await this.resolveContainer();
    return new Promise((resolve, reject) => {
      execFile(
        this.dockerCommand,
        ["exec", "-i", container.name, ...commandArgs],
        { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(normalizeDockerOutput(stderr).trim() || error.message));
          } else {
            resolve(normalizeDockerOutput(stdout));
          }
        },
      );
    });
  }

  private async execSimple(command: string): Promise<string> {
    return this.execDirect(["sh", "-lc", command]);
  }

  private async readKernelOstype(): Promise<string> {
    try {
      return normalizeDockerOutput(
        await this.execSimple(
          "if [ -r /proc/sys/kernel/ostype ]; then cat /proc/sys/kernel/ostype; fi",
        ),
      ).trim();
    } catch {
      return "";
    }
  }

  private async resolveInfo(): Promise<{ containerName: string; homeDir: string }> {
    if (this.infoPromise) return this.infoPromise;
    this.infoPromise = (async () => {
      const container = await this.resolveContainer();
      const homeDir = normalizeDockerOutput(
        await this.execDirect(["sh", "-lc", "printf %s ~"]),
      ).trim();
      return { containerName: container.name, homeDir };
    })();
    return this.infoPromise;
  }

  private resolveLinuxPath(path: string, homeDir: string): string {
    if (path === "~") return homeDir;
    if (path.startsWith("~/")) return `${homeDir.replace(/\/$/, "")}/${path.slice(2)}`;
    return path;
  }

  async detect(): Promise<RemoteEnvironment> {
    await this.ensureAvailable();
    const reported = normalizeRemotePlatform(
      normalizeDockerOutput(await this.execSimple("uname -s")),
    );
    const arch = normalizeRemoteArch(normalizeDockerOutput(await this.execSimple("uname -m")));
    const kernel = await this.readKernelOstype();
    const platform = resolveRemotePlatform(reported, kernel);
    if (platform !== reported) {
      console.warn(
        `[docker] detect: uname reported ${reported}, but kernel ostype is ${kernel}; fallback to ${platform}`,
      );
    }
    return { platform, arch };
  }

  async exec(command: string): Promise<StdioStream> {
    await this.ensureAvailable();
    const info = await this.resolveInfo();
    return new Promise((resolve, reject) => {
      const child = spawn(
        this.dockerCommand,
        ["exec", "-i", info.containerName, "sh", "-lc", command],
        { stdio: "pipe", windowsHide: true },
      );
      child.once("error", reject);
      child.once("spawn", () => {
        const stdin = child.stdin;
        const stdout = child.stdout;
        const stderr = child.stderr;
        if (!stdin || !stdout || !stderr) {
          reject(new Error("Docker exec stdio is not available"));
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

  async exists(path: string): Promise<boolean> {
    try {
      const info = await this.resolveInfo();
      const resolved = this.resolveLinuxPath(path, info.homeDir);
      await this.execSimple(`test -f ${quoteShell(resolved)} && printf OK`);
      return true;
    } catch {
      return false;
    }
  }

  async readFile(path: string): Promise<string> {
    const info = await this.resolveInfo();
    const resolved = this.resolveLinuxPath(path, info.homeDir);
    return normalizeDockerOutput(await this.execSimple(`cat ${quoteShell(resolved)}`));
  }

  async upload(local: string, remote: string, options?: RemoteUploadOptions): Promise<void> {
    await this.ensureAvailable();
    const info = await this.resolveInfo();
    const resolved = this.resolveLinuxPath(remote, info.homeDir);
    await this.execSimple(`mkdir -p ${quoteShell(linuxDirectory(resolved))}`);
    await this.uploadStream(local, resolved, options ?? {});
  }

  private async uploadStream(
    local: string,
    remote: string,
    options: RemoteUploadOptions,
  ): Promise<void> {
    const totalBytes = await stat(local).then((entry) => entry.size);
    if (options.signal?.aborted) throw uploadCanceled();
    const stream = await this.exec(`cat > ${quoteShell(remote)}`);
    await new Promise<void>((resolve, reject) => {
      const readStream = createReadStream(local);
      const stdin = stream.stdin as NodeJS.WritableStream & { destroy?: (error?: Error) => void };
      let stderrText = "";
      let uploadedBytes = 0;
      let settled = false;
      const collectStderr = (chunk: Buffer) => {
        stderrText = (stderrText + chunk.toString()).slice(-2048);
      };
      stream.stderr.on("data", collectStderr);
      const finishError = (error: Error) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener("abort", abort);
        stream.stderr.removeListener("data", collectStderr);
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
        stream.stderr.removeListener("data", collectStderr);
        if (code !== 0) {
          const summary = normalizeDockerOutput(stderrText).trim();
          reject(
            new Error(
              summary
                ? `Docker upload failed with exit code ${code}: ${summary}`
                : `Docker upload failed with exit code ${code}`,
            ),
          );
        } else {
          options.onProgress?.({ uploadedBytes: totalBytes, totalBytes });
          resolve();
        }
      });
      readStream.pipe(stdin);
    });
  }

  dispose(): void {}
}
