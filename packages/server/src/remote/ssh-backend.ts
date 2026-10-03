/* eslint-disable max-lines -- This class owns the complete SSH connection and transfer lifecycle. */
import { createReadStream } from "node:fs";
import { posix } from "node:path";
import { Client as SSHClient, type ConnectConfig } from "ssh2";
import { Emitter } from "@knorvia/rpc";
import { resolveKnorviaRuntimeEnv } from "@knorvia/shared";
import type {
  IRemoteBackend,
  RemoteDisconnectEvent,
  RemoteDisconnectReason,
  RemoteEnvironment,
  RemoteUploadOptions,
  StdioStream,
} from "@knorvia/server/remote/backend.js";
import {
  normalizeRemoteArch,
  normalizeRemotePlatform,
  resolveRemotePlatform,
} from "@knorvia/server/remote/detectEnv.js";
import { createCloseEventController } from "@knorvia/server/remote/closeEvent.js";
import {
  buildPosixShellExecCommand,
  quotePosixShellArg,
  resolvePosixHomePath,
} from "@knorvia/server/remote/posixShell.js";
import {
  buildSSHConnectConfig,
  createKeyboardInteractiveResponder,
  normalizeSSHConnectError,
} from "@knorvia/server/remote/sshAuth.js";
import {
  createSSHUploadProgressReporter,
  formatSSHUploadError,
  formatSSHUploadLabel,
  readLocalFileSize,
} from "@knorvia/server/remote/sshUploadProgress.js";

export interface SSHBackendOptions {
  host: string;
  port?: number;
  username: string;
  privateKeyPath?: string;
  privateKey?: string | Buffer;
  privateKeyPassphrase?: string;
  password?: string;
  agent?: string;
}

type UploadFailureKind = "sftp-session" | "sftp-write" | "local-read" | "aborted";
type UploadError = Error & { uploadFailureKind?: UploadFailureKind };
type DestroyableWritable = NodeJS.WritableStream & { destroy?: (error?: Error) => void };

function normalizeError(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" && error.length > 0 ? error : fallback);
}

function markUploadFailure(error: unknown, kind: UploadFailureKind, fallback: string): UploadError {
  const marked = normalizeError(error, fallback) as UploadError;
  marked.uploadFailureKind = kind;
  return marked;
}

function createUploadAbortError(): Error {
  const error = new Error("Remote upload canceled");
  error.name = "AbortError";
  return error;
}

function throwIfUploadAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createUploadAbortError();
}

export class SSHBackend implements IRemoteBackend {
  private readonly client: SSHClient;
  private readonly config: ConnectConfig;
  private connected = false;
  private homeDirPromise: Promise<string> | null = null;
  private execUploadOnly = false;
  private disposed = false;
  private hasEverConnected = false;
  private disconnectReported = false;
  private readonly disconnectEmitter = new Emitter<RemoteDisconnectEvent>();
  readonly onDidDisconnect = this.disconnectEmitter.event;

  private readonly onClientError = (error: unknown): void => {
    if (this.disposed) return;
    const normalized = normalizeSSHConnectError(error);
    console.error("[ssh] client error:", normalized);
    this.reportDisconnect("error", normalized);
  };

  private readonly onClientClose = (): void => {
    this.reportDisconnect("close");
  };

  private readonly onClientEnd = (): void => {
    this.reportDisconnect("end");
  };

  constructor(options: SSHBackendOptions) {
    this.client = new SSHClient();
    this.client.on("error", this.onClientError);
    this.client.on("close", this.onClientClose);
    this.client.on("end", this.onClientEnd);
    this.config = buildSSHConnectConfig({
      host: options.host,
      port: options.port,
      username: options.username,
      privateKey: options.privateKey,
      passphrase: options.privateKeyPassphrase,
      password: options.password,
      agent: options.agent,
    });
    if (resolveKnorviaRuntimeEnv(process.env) === "development") {
      this.config.debug = (message: string): void => {
        if (/\bCHANNEL_(?:DATA|EXTENDED_DATA|WINDOW_ADJUST)\b/u.test(message)) return;
        console.debug(`[ssh2] ${message}`);
      };
    }
    if (typeof options.password === "string" && options.password.length > 0) {
      const listener = createKeyboardInteractiveResponder(options.password);
      const keyboardClient = this.client as unknown as {
        on(event: "keyboard-interactive", handler: typeof listener): void;
      };
      keyboardClient.on("keyboard-interactive", listener);
    }
  }

  private reportDisconnect(reason: RemoteDisconnectReason, error?: Error): void {
    const shouldReport =
      !this.disposed && !this.disconnectReported && (this.connected || this.hasEverConnected);
    this.connected = false;
    this.homeDirPromise = null;
    if (!shouldReport) return;
    this.disconnectReported = true;
    this.disconnectEmitter.fire(error ? { reason, error } : { reason });
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error("SSH backend 已释放，无法重新建立连接");
  }

  private async ensureConnected(): Promise<void> {
    this.assertNotDisposed();
    if (this.connected) return;
    return new Promise<void>((resolve, reject) => {
      const onReady = (): void => {
        this.client.off("error", onError);
        if (this.disposed) {
          this.client.end();
          reject(new Error("SSH backend 已释放，无法重新建立连接"));
          return;
        }
        this.connected = true;
        this.hasEverConnected = true;
        this.disconnectReported = false;
        resolve();
      };
      const onError = (error: unknown): void => {
        this.client.off("ready", onReady);
        reject(normalizeSSHConnectError(error));
      };
      this.client.once("ready", onReady);
      this.client.once("error", onError);
      this.client.connect(this.config);
    });
  }

  async exec(command: string): Promise<StdioStream> {
    await this.ensureConnected();
    this.assertNotDisposed();
    return new Promise<StdioStream>((resolve, reject) => {
      this.client.exec(buildPosixShellExecCommand(command), (error, channel) => {
        if (error) {
          reject(error);
          return;
        }
        const close = createCloseEventController();
        let fired = false;
        const fireOnce = (code: number): void => {
          if (fired) return;
          fired = true;
          if (code !== 0) console.warn(`[ssh] exec channel failed: code=${code}`);
          close.fire(code ?? 0);
        };
        channel.on("exit", (code: number | null | undefined) => fireOnce(code ?? 0));
        channel.on("close", () => fireOnce(0));
        resolve({
          stdin: channel.stdin,
          stdout: channel,
          stderr: channel.stderr,
          onClose: close.event,
        });
      });
    });
  }

  private execSimple(command: string): Promise<string> {
    this.assertNotDisposed();
    return new Promise<string>((resolve, reject) => {
      this.client.exec(buildPosixShellExecCommand(command), (error, channel) => {
        if (error) {
          reject(error);
          return;
        }
        let stdout = "";
        let stderr = "";
        let done = false;
        let exitCode: number | null = null;
        const finish = (code: number): void => {
          if (done) return;
          done = true;
          if (code !== 0) {
            reject(new Error(`Command failed (code ${code}): ${stderr || stdout}`));
          } else {
            resolve(stdout);
          }
        };
        channel.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        channel.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        channel.on("exit", (code: number | null | undefined) => {
          exitCode = code ?? 0;
        });
        channel.on("close", (code: number | null | undefined) => {
          finish(exitCode ?? code ?? 0);
        });
      });
    });
  }

  private async resolveHomeDir(): Promise<string> {
    if (this.homeDirPromise) return this.homeDirPromise;
    this.homeDirPromise = this.execSimple('printf %s "$HOME"').then((text) => text.trim());
    return this.homeDirPromise;
  }

  private async resolveRemotePath(remotePath: string): Promise<string> {
    const home = await this.resolveHomeDir();
    return resolvePosixHomePath(remotePath, home);
  }

  async exists(remotePath: string): Promise<boolean> {
    try {
      const resolved = await this.resolveRemotePath(remotePath);
      const result = await this.execSimple(`test -f ${quotePosixShellArg(resolved)} && printf OK`);
      return result.trim() === "OK";
    } catch {
      return false;
    }
  }

  async readFile(remotePath: string): Promise<string> {
    const resolved = await this.resolveRemotePath(remotePath);
    return this.execSimple(`cat ${quotePosixShellArg(resolved)}`);
  }

  private async readKernelOstype(): Promise<string> {
    try {
      const value = await this.execSimple(
        "if [ -r /proc/sys/kernel/ostype ]; then cat /proc/sys/kernel/ostype; fi",
      );
      return value.trim();
    } catch {
      return "";
    }
  }

  async detect(): Promise<RemoteEnvironment> {
    await this.ensureConnected();
    const reportedPlatform = normalizeRemotePlatform(await this.execSimple("uname -s"));
    const arch = normalizeRemoteArch(await this.execSimple("uname -m"));
    const kernelOstype = await this.readKernelOstype();
    const platform = resolveRemotePlatform(reportedPlatform, kernelOstype);
    if (platform !== reportedPlatform) {
      console.warn(
        `[ssh] detect: uname reported ${reportedPlatform}, but kernel ostype is ${kernelOstype}; fallback to ${platform}`,
      );
    }
    return { platform, arch };
  }

  async upload(
    localPath: string,
    remotePath: string,
    options?: RemoteUploadOptions,
  ): Promise<void> {
    throwIfUploadAborted(options?.signal);
    await this.ensureConnected();
    this.assertNotDisposed();
    const resolved = await this.resolveRemotePath(remotePath);
    throwIfUploadAborted(options?.signal);
    this.assertNotDisposed();
    const label = formatSSHUploadLabel(resolved);
    console.log(`[ssh] upload: resolved ${label} to ${resolved}`);
    await this.execSimple(`mkdir -p ${quotePosixShellArg(posix.dirname(resolved))}`);
    if (this.execUploadOnly) {
      await this.uploadViaExec(localPath, resolved, options);
      return;
    }
    try {
      await this.uploadViaSftp(localPath, resolved, options);
    } catch (error) {
      const kind = (error as UploadError | null | undefined)?.uploadFailureKind;
      if (kind !== "sftp-session" && kind !== "sftp-write") throw error;
      this.execUploadOnly = true;
      const descriptionKind = (error as UploadError | null | undefined)?.uploadFailureKind;
      const formatted = formatSSHUploadError(error);
      const description = descriptionKind ? `${descriptionKind} failure (${formatted})` : formatted;
      console.warn(`[ssh] upload: switching ${label} from sftp to exec pipe after ${description}`);
      await this.uploadViaExec(localPath, resolved, options);
    }
  }

  private async uploadViaSftp(
    localPath: string,
    resolvedRemotePath: string,
    options?: RemoteUploadOptions,
  ): Promise<void> {
    throwIfUploadAborted(options?.signal);
    this.assertNotDisposed();
    const label = formatSSHUploadLabel(resolvedRemotePath);
    const total = await readLocalFileSize(localPath);
    const reporter = createSSHUploadProgressReporter("sftp", label, total);
    const report = (bytes: number, force: boolean): void => {
      reporter(bytes, force);
      options?.onProgress?.({ uploadedBytes: bytes, totalBytes: total ?? 0 });
    };
    return new Promise<void>((resolve, reject) => {
      this.client.sftp((error, sftp) => {
        if (error) {
          reject(markUploadFailure(error, "sftp-session", "Failed to open SFTP session"));
          return;
        }
        console.log(
          `[ssh] upload: started via sftp for ${label} (${localPath} -> ${resolvedRemotePath})`,
        );
        const read = createReadStream(localPath);
        const write = sftp.createWriteStream(resolvedRemotePath);
        let transferred = 0;
        let settled = false;
        let suppressFollowup = false;
        const removeAbort = (): void => options?.signal?.removeEventListener("abort", onAbort);
        const resolveOnce = (): void => {
          if (settled) return;
          settled = true;
          removeAbort();
          report(transferred, true);
          console.log(`[ssh] upload: completed via sftp for ${label}`);
          sftp.end();
          resolve();
        };
        const rejectOnce = (failure: unknown, kind: UploadFailureKind, fallback: string): void => {
          if (settled) return;
          settled = true;
          removeAbort();
          suppressFollowup = true;
          read.unpipe(write);
          read.destroy();
          if (typeof write.destroy === "function") write.destroy();
          sftp.end();
          reject(markUploadFailure(failure, kind, fallback));
        };
        const onAbort = (): void => {
          rejectOnce(createUploadAbortError(), "aborted", "Remote upload canceled");
        };
        if (options?.signal?.aborted) {
          onAbort();
          return;
        }
        options?.signal?.addEventListener("abort", onAbort, { once: true });
        read.on("data", (chunk: Buffer) => {
          if (settled) return;
          transferred += chunk.length;
          report(transferred, false);
        });
        write.on("close", resolveOnce);
        write.on("error", (failure: Error) => {
          if (settled || suppressFollowup) return;
          rejectOnce(failure, "sftp-write", `Failed to write ${resolvedRemotePath} over SFTP`);
        });
        read.on("error", (failure: Error) => {
          if (settled || suppressFollowup) return;
          console.error(
            `[ssh] upload: local read failed for ${label}: ${formatSSHUploadError(failure)}`,
          );
          rejectOnce(failure, "local-read", `Failed to read local file ${localPath}`);
        });
        read.pipe(write);
      });
    });
  }

  private async uploadViaExec(
    localPath: string,
    resolvedRemotePath: string,
    options?: RemoteUploadOptions,
  ): Promise<void> {
    const label = formatSSHUploadLabel(resolvedRemotePath);
    const total = await readLocalFileSize(localPath);
    const reporter = createSSHUploadProgressReporter("exec", label, total);
    const report = (bytes: number, force: boolean): void => {
      reporter(bytes, force);
      options?.onProgress?.({ uploadedBytes: bytes, totalBytes: total ?? 0 });
    };
    throwIfUploadAborted(options?.signal);
    const parent = posix.dirname(resolvedRemotePath);
    const command = `mkdir -p ${quotePosixShellArg(parent)} && cat > ${quotePosixShellArg(resolvedRemotePath)}`;
    console.log(
      `[ssh] upload: started via exec pipe for ${label} (${localPath} -> ${resolvedRemotePath})`,
    );
    const stream = await this.exec(command);
    await new Promise<void>((resolve, reject) => {
      const read = createReadStream(localPath);
      const stdin = stream.stdin as DestroyableWritable;
      let transferred = 0;
      let settled = false;
      const removeAbort = (): void => options?.signal?.removeEventListener("abort", onAbort);
      const finishError = (error: Error): void => {
        if (settled) return;
        settled = true;
        removeAbort();
        read.destroy();
        if (typeof stdin.destroy === "function") stdin.destroy(error);
        else stdin.end();
        reject(error);
      };
      const onAbort = (): void => finishError(createUploadAbortError());
      if (options?.signal?.aborted) {
        onAbort();
        return;
      }
      options?.signal?.addEventListener("abort", onAbort, { once: true });
      read.on("error", finishError);
      read.on("data", (chunk: Buffer) => {
        transferred += chunk.length;
        report(transferred, false);
      });
      stdin.on("error", finishError);
      read.pipe(stdin);
      stream.onClose((code) => {
        if (settled) return;
        settled = true;
        removeAbort();
        report(transferred, true);
        if (code !== 0) {
          console.error(`[ssh] upload: exec pipe failed for ${label}: exit code ${code}`);
          reject(new Error(`SSH exec upload failed with exit code ${code}`));
        } else {
          console.log(`[ssh] upload: completed via exec pipe for ${label}`);
          resolve();
        }
      });
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.client.off("close", this.onClientClose);
    this.client.off("end", this.onClientEnd);
    this.client.end();
    this.connected = false;
    this.disconnectEmitter.dispose();
  }
}
