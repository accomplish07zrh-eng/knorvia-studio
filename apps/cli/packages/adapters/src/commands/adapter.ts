// SPDX-License-Identifier: Apache-2.0
// 自定义命令适配器实现：按优先级扫描各根、按名去重、按需读取正文。
import { open, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  CustomCommandContent,
  CustomCommandDiagnostic,
  CustomCommandLoadOutcome,
  CustomCommandMetadata,
  CustomCommandOperationOptions,
  CustomCommandPort,
  CustomCommandRoot,
} from "@knorvia/contracts";
import { warnInvalid } from "./diagnostics.js";
import { removeFrontmatter } from "./frontmatter.js";
import { readMetadata } from "./metadata.js";
import { filesUnderRoot } from "./scan.js";
import {
  resolveDefaultCustomCommandRoots,
  type CustomCommandRootResolutionOptions,
} from "./roots.js";

export interface NodeCustomCommandAdapterOptions extends CustomCommandRootResolutionOptions {
  disabledPaths?: Iterable<string>;
}

const DEFAULT_MAX_BYTES = 100000;
const DUPLICATE_NAME = "custom_command_duplicate_name";

function assertNotCancelled(options?: CustomCommandOperationOptions): void {
  if (options?.signal?.aborted) throw new Error("Custom command operation cancelled");
}

function normalizeLookupName(value: string): string {
  return value.trim().replace(/^\/+/u, "").toLowerCase();
}

async function readPrefix(path: string, maxBytes: number): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(Math.max(0, maxBytes));
    const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export class NodeCustomCommandAdapter implements CustomCommandPort {
  private readonly rootOptions: NodeCustomCommandAdapterOptions;
  private readonly disabled: Set<string>;

  constructor(options: NodeCustomCommandAdapterOptions = {}) {
    this.rootOptions = options;
    this.disabled = new Set(Array.from(options.disabledPaths ?? [], (path) => resolve(path)));
  }

  /** 收集一个根下的命令：返回按名去重后的条目与已发现数量。 */
  private async collectRoot(
    root: CustomCommandRoot,
    diagnostics: CustomCommandDiagnostic[],
    seen: Map<string, CustomCommandMetadata>,
    options?: CustomCommandOperationOptions,
  ): Promise<number> {
    let discovered = 0;
    for (const path of await filesUnderRoot(root.path, diagnostics)) {
      assertNotCancelled(options);
      const metadata = await readMetadata(path, root, diagnostics);
      if (metadata === null || this.disabled.has(resolve(metadata.path))) continue;
      discovered += 1;
      if (seen.has(metadata.name)) {
        warnInvalid(diagnostics, {
          code: DUPLICATE_NAME,
          commandName: metadata.name,
          message: "Duplicate custom command ignored: " + metadata.name,
          path,
        });
        continue;
      }
      seen.set(metadata.name, metadata);
    }
    return discovered;
  }

  async discoverCommands(
    request: { roots?: CustomCommandRoot[]; workingDirectory: string },
    options?: CustomCommandOperationOptions,
  ): Promise<CustomCommandLoadOutcome> {
    assertNotCancelled(options);
    const cwd = resolve(request.workingDirectory);
    const roots = request.roots ?? (await resolveDefaultCustomCommandRoots(cwd, this.rootOptions));
    const diagnostics: CustomCommandDiagnostic[] = [];
    const seen = new Map<string, CustomCommandMetadata>();
    let totalDiscovered = 0;

    for (const root of roots.toSorted((left, right) => left.priority - right.priority)) {
      assertNotCancelled(options);
      totalDiscovered += await this.collectRoot(root, diagnostics, seen, options);
    }

    const outcome = {} as CustomCommandLoadOutcome;
    outcome.commands = Array.from(seen.values()).toSorted((left, right) =>
      left.name.localeCompare(right.name),
    );
    outcome.diagnostics = diagnostics;
    outcome.totalDiscovered = totalDiscovered;
    return outcome;
  }

  async loadCommand(
    request: {
      maxBytes?: number;
      name: string;
      roots?: CustomCommandRoot[];
      workingDirectory: string;
    },
    options?: CustomCommandOperationOptions,
  ): Promise<CustomCommandContent> {
    assertNotCancelled(options);
    const discovered = await this.discoverCommands(
      { roots: request.roots, workingDirectory: request.workingDirectory },
      options,
    );
    const wanted = normalizeLookupName(request.name);
    const metadata = discovered.commands.find((command) => command.name === wanted);
    if (metadata === undefined) throw new Error("Custom command not found: " + request.name);

    const maxBytes = request.maxBytes ?? DEFAULT_MAX_BYTES;
    const info = await stat(metadata.path);
    const truncated = info.size > maxBytes;
    const bytes = truncated
      ? await readPrefix(metadata.path, maxBytes)
      : await readFile(metadata.path);
    const content = { metadata } as CustomCommandContent;
    content.content = removeFrontmatter(bytes.toString("utf8")).trim();
    content.bytesRead = bytes.byteLength;
    content.sizeBytes = info.size;
    content.truncated = truncated;
    return content;
  }
}

export function createNodeCustomCommandAdapter(
  options: NodeCustomCommandAdapterOptions = {},
): NodeCustomCommandAdapter {
  return new NodeCustomCommandAdapter(options);
}
