// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

import path from "node:path";

export interface FsCall {
  readonly args: readonly unknown[];
  readonly operation: string;
}

interface VirtualStats {
  readonly size: number;
  isDirectory(): boolean;
  isFile(): boolean;
}

interface VirtualDirent {
  readonly name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

function normalize(input: unknown): string {
  if (input instanceof URL) return normalize(input.pathname);
  if (typeof input !== "string")
    throw new TypeError("Virtual filesystem paths must be strings or URLs");
  return path.posix.normalize(input.replaceAll("\\", "/"));
}

function bytes(value: unknown): Uint8Array {
  if (typeof value === "string") return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return value.slice();
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  throw new TypeError("Unsupported virtual file content");
}

export class VirtualFileSystem {
  readonly calls: FsCall[] = [];
  private readonly directories = new Set<string>(["/"]);
  private readonly files = new Map<string, Uint8Array>();
  private readonly logicalSizes = new Map<string, number>();
  private pending = 0;

  seed(filePath: string, content: string | Uint8Array): void {
    const normalized = normalize(filePath);
    this.ensureParents(normalized);
    this.files.set(normalized, bytes(content));
    this.logicalSizes.delete(normalized);
  }

  seedSize(filePath: string, size: number): void {
    const normalized = normalize(filePath);
    this.ensureParents(normalized);
    this.files.set(normalized, new Uint8Array());
    this.logicalSizes.set(normalized, size);
  }

  listFiles(): string[] {
    return [...this.files.keys()].sort();
  }

  text(filePath: string): string | undefined {
    const content = this.files.get(normalize(filePath));
    return content === undefined ? undefined : new TextDecoder().decode(content);
  }

  byteLength(filePath: string): number | undefined {
    const normalized = normalize(filePath);
    return this.logicalSizes.get(normalized) ?? this.files.get(normalized)?.byteLength;
  }

  appendFileSync(filePath: unknown, content: unknown, options?: unknown): void {
    this.trackSync("appendFileSync", [filePath, content, options], () => {
      const normalized = normalize(filePath);
      const parent = path.posix.dirname(normalized);
      if (!this.directories.has(parent)) throw this.fsError("ENOENT", normalized);
      if (this.directories.has(normalized)) throw this.fsError("EISDIR", normalized);
      const previous = this.files.get(normalized) ?? new Uint8Array();
      const addition = bytes(content);
      const combined = new Uint8Array(previous.byteLength + addition.byteLength);
      combined.set(previous);
      combined.set(addition, previous.byteLength);
      this.files.set(normalized, combined);
      this.logicalSizes.set(
        normalized,
        (this.logicalSizes.get(normalized) ?? previous.byteLength) + addition.byteLength,
      );
    });
  }

  existsSync(filePath: unknown): boolean {
    return this.trackSync("existsSync", [filePath], () => {
      try {
        const normalized = normalize(filePath);
        return this.files.has(normalized) || this.directories.has(normalized);
      } catch {
        return false;
      }
    });
  }

  mkdirSync(directoryPath: unknown, options?: unknown): string | undefined {
    return this.trackSync("mkdirSync", [directoryPath, options], () => {
      const normalized = normalize(directoryPath);
      const recursive = this.booleanOption(options, "recursive");
      if (this.files.has(normalized)) throw this.fsError("EEXIST", normalized);
      if (this.directories.has(normalized)) {
        if (recursive) return undefined;
        throw this.fsError("EEXIST", normalized);
      }
      const parent = path.posix.dirname(normalized);
      if (!recursive && !this.directories.has(parent)) throw this.fsError("ENOENT", normalized);
      if (recursive) this.ensureParents(`${normalized}/child`);
      this.directories.add(normalized);
      return normalized;
    });
  }

  readdirSync(directoryPath: unknown, options?: unknown): Array<string | VirtualDirent> {
    return this.trackSync("readdirSync", [directoryPath, options], () => {
      const normalized = normalize(directoryPath).replace(/\/$/u, "") || "/";
      if (this.files.has(normalized)) throw this.fsError("ENOTDIR", normalized);
      if (!this.directories.has(normalized)) throw this.fsError("ENOENT", normalized);
      const names = this.directoryEntries(normalized);
      if (!this.booleanOption(options, "withFileTypes")) return names;
      return names.map((name) => {
        const child = normalize(path.posix.join(normalized, name));
        const directory = this.directories.has(child);
        return { name, isDirectory: () => directory, isFile: () => !directory };
      });
    });
  }

  rmSync(filePath: unknown, options?: unknown): void {
    this.trackSync("rmSync", [filePath, options], () => {
      const normalized = normalize(filePath);
      const force = this.booleanOption(options, "force");
      const recursive = this.booleanOption(options, "recursive");
      if (this.files.delete(normalized)) {
        this.logicalSizes.delete(normalized);
        return;
      }
      if (!this.directories.has(normalized)) {
        if (force) return;
        throw this.fsError("ENOENT", normalized);
      }
      if (!recursive) throw this.fsError("EISDIR", normalized);
      for (const file of this.files.keys()) {
        if (file.startsWith(`${normalized}/`)) {
          this.files.delete(file);
          this.logicalSizes.delete(file);
        }
      }
      for (const directory of this.directories) {
        if (directory === normalized || directory.startsWith(`${normalized}/`)) {
          this.directories.delete(directory);
        }
      }
    });
  }

  statSync(filePath: unknown): VirtualStats {
    return this.trackSync("statSync", [filePath], () => {
      const normalized = normalize(filePath);
      const content = this.files.get(normalized);
      if (content !== undefined) {
        return this.stats(this.logicalSizes.get(normalized) ?? content.byteLength, false);
      }
      if (this.directories.has(normalized)) return this.stats(0, true);
      throw this.fsError("ENOENT", normalized);
    });
  }

  writeFileSync(filePath: unknown, content: unknown, options?: unknown): void {
    this.trackSync("writeFileSync", [filePath, content, options], () => {
      this.assertUtf8Encoding(options);
      const normalized = normalize(filePath);
      const parent = path.posix.dirname(normalized);
      if (!this.directories.has(parent)) throw this.fsError("ENOENT", normalized);
      if (this.directories.has(normalized)) throw this.fsError("EISDIR", normalized);
      this.files.set(normalized, bytes(content));
      this.logicalSizes.delete(normalized);
    });
  }

  async mkdir(filePath: unknown, options?: unknown): Promise<string | undefined> {
    return this.track("mkdir", [filePath, options], () => {
      const normalized = normalize(filePath);
      this.ensureParents(`${normalized}/child`);
      this.directories.add(normalized);
      return normalized;
    });
  }

  async writeFile(filePath: unknown, content: unknown, options?: unknown): Promise<void> {
    return this.track("writeFile", [filePath, content, options], () => {
      const normalized = normalize(filePath);
      this.ensureParents(normalized);
      this.files.set(normalized, bytes(content));
      this.logicalSizes.delete(normalized);
    });
  }

  async appendFile(filePath: unknown, content: unknown, options?: unknown): Promise<void> {
    return this.track("appendFile", [filePath, content, options], () => {
      const normalized = normalize(filePath);
      const previous = this.files.get(normalized) ?? new Uint8Array();
      const addition = bytes(content);
      const combined = new Uint8Array(previous.byteLength + addition.byteLength);
      combined.set(previous);
      combined.set(addition, previous.byteLength);
      this.ensureParents(normalized);
      this.files.set(normalized, combined);
      this.logicalSizes.set(
        normalized,
        (this.logicalSizes.get(normalized) ?? previous.byteLength) + addition.byteLength,
      );
    });
  }

  async readFile(filePath: unknown, options?: unknown): Promise<string | Uint8Array> {
    return this.track("readFile", [filePath, options], () => {
      const normalized = normalize(filePath);
      const content = this.files.get(normalized);
      if (content === undefined) throw this.fsError("ENOENT", normalized);
      return typeof options === "string" || this.encoding(options) !== undefined
        ? new TextDecoder().decode(content)
        : content.slice();
    });
  }

  async readdir(directoryPath: unknown, options?: unknown): Promise<string[]> {
    return this.track("readdir", [directoryPath, options], () => {
      const normalized = normalize(directoryPath).replace(/\/$/u, "");
      const prefix = `${normalized}/`;
      const names = new Set<string>();
      for (const file of [...this.files.keys(), ...this.directories]) {
        if (file.startsWith(prefix)) {
          const name = file.slice(prefix.length).split("/")[0];
          if (name !== undefined && name !== "") names.add(name);
        }
      }
      return [...names].sort();
    });
  }

  async stat(filePath: unknown): Promise<VirtualStats> {
    return this.track("stat", [filePath], () => {
      const normalized = normalize(filePath);
      const content = this.files.get(normalized);
      if (content !== undefined)
        return this.stats(this.logicalSizes.get(normalized) ?? content.byteLength, false);
      if (this.directories.has(normalized)) return this.stats(0, true);
      throw this.fsError("ENOENT", normalized);
    });
  }

  async rename(from: unknown, to: unknown): Promise<void> {
    return this.track("rename", [from, to], () => {
      const source = normalize(from);
      const destination = normalize(to);
      const content = this.files.get(source);
      if (content === undefined) throw this.fsError("ENOENT", source);
      this.ensureParents(destination);
      this.files.set(destination, content);
      const logicalSize = this.logicalSizes.get(source);
      if (logicalSize === undefined) this.logicalSizes.delete(destination);
      else this.logicalSizes.set(destination, logicalSize);
      this.files.delete(source);
      this.logicalSizes.delete(source);
    });
  }

  async unlink(filePath: unknown): Promise<void> {
    return this.track("unlink", [filePath], () => {
      const normalized = normalize(filePath);
      if (!this.files.delete(normalized)) throw this.fsError("ENOENT", normalized);
      this.logicalSizes.delete(normalized);
    });
  }

  async rm(filePath: unknown, _options?: unknown): Promise<void> {
    return this.track("rm", [filePath, _options], () => {
      const normalized = normalize(filePath);
      this.files.delete(normalized);
      this.logicalSizes.delete(normalized);
      for (const file of this.files.keys()) {
        if (file.startsWith(`${normalized}/`)) {
          this.files.delete(file);
          this.logicalSizes.delete(file);
        }
      }
    });
  }

  async access(filePath: unknown): Promise<void> {
    return this.track("access", [filePath], () => {
      const normalized = normalize(filePath);
      if (!this.files.has(normalized) && !this.directories.has(normalized)) {
        throw this.fsError("ENOENT", normalized);
      }
    });
  }

  async drain(): Promise<void> {
    for (let turn = 0; turn < 20 && this.pending > 0; turn += 1) await Promise.resolve();
    if (this.pending > 0) throw new Error("Virtual filesystem operations did not drain");
  }

  resetCalls(): void {
    this.calls.length = 0;
  }

  private async track<T>(operation: string, args: readonly unknown[], action: () => T): Promise<T> {
    this.calls.push({ args, operation });
    this.pending += 1;
    try {
      return action();
    } finally {
      this.pending -= 1;
    }
  }

  private trackSync<T>(operation: string, args: readonly unknown[], action: () => T): T {
    this.calls.push({ args, operation });
    return action();
  }

  private booleanOption(options: unknown, name: string): boolean {
    return typeof options === "object" && options !== null && Reflect.get(options, name) === true;
  }

  private assertUtf8Encoding(options: unknown): void {
    const encoding =
      typeof options === "string"
        ? options
        : typeof options === "object" && options !== null
          ? Reflect.get(options, "encoding")
          : undefined;
    if (
      encoding !== undefined &&
      encoding !== null &&
      encoding !== "utf8" &&
      encoding !== "utf-8"
    ) {
      throw Object.assign(new TypeError(`Unsupported virtual encoding: ${String(encoding)}`), {
        code: "ERR_INVALID_ARG_VALUE",
      });
    }
  }

  private directoryEntries(directoryPath: string): string[] {
    const prefix = directoryPath === "/" ? "/" : `${directoryPath}/`;
    const names = new Set<string>();
    for (const candidate of [...this.files.keys(), ...this.directories]) {
      if (!candidate.startsWith(prefix)) continue;
      const name = candidate.slice(prefix.length).split("/")[0];
      if (name !== undefined && name !== "") names.add(name);
    }
    return [...names].sort();
  }

  private ensureParents(filePath: string): void {
    const segments = filePath.split("/");
    segments.pop();
    while (segments.length > 0) {
      this.directories.add(segments.join("/") || "/");
      segments.pop();
    }
  }

  private encoding(options: unknown): string | undefined {
    if (typeof options !== "object" || options === null) return undefined;
    const value = Reflect.get(options, "encoding");
    return typeof value === "string" ? value : undefined;
  }

  private stats(size: number, directory: boolean): VirtualStats {
    return { size, isDirectory: () => directory, isFile: () => !directory };
  }

  private fsError(code: string, filePath: string): Error {
    return Object.assign(new Error(`${code}: ${filePath}`), { code });
  }
}
