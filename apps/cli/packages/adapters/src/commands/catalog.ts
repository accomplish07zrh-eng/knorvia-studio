// SPDX-License-Identifier: Apache-2.0
// 命令目录：按优先级扫描各根、按名去重，并按预算读取命令正文。
import { open, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  CustomCommandContent,
  CustomCommandDiagnostic,
  CustomCommandLoadOutcome,
  CustomCommandMetadata,
  CustomCommandOperationOptions,
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

export interface DiscoveryRequest {
  roots?: CustomCommandRoot[];
  workingDirectory: string;
}

export interface CatalogInput {
  disabled: ReadonlySet<string>;
  options?: CustomCommandOperationOptions;
  request: DiscoveryRequest;
  rootOptions: CustomCommandRootResolutionOptions;
}

const DEFAULT_MAX_BYTES = 100000;
const DUPLICATE_NAME = "custom_command_duplicate_name";
const CANCELLED_MESSAGE = "Custom command operation cancelled";

interface CatalogState {
  diagnostics: CustomCommandDiagnostic[];
  selected: Map<string, CustomCommandMetadata>;
  totalDiscovered: number;
}

export function assertNotCancelled(options?: CustomCommandOperationOptions): void {
  if (options?.signal?.aborted) throw new Error(CANCELLED_MESSAGE);
}

export function lookupName(value: string): string {
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

/** 单条目的准入：元数据可解析、未被禁用、名字未被占用。 */
function admit(
  state: CatalogState,
  metadata: CustomCommandMetadata | null,
  path: string,
  disabled: ReadonlySet<string>,
): void {
  if (metadata === null || disabled.has(resolve(metadata.path))) return;
  state.totalDiscovered += 1;
  if (state.selected.has(metadata.name)) {
    warnInvalid(state.diagnostics, {
      code: DUPLICATE_NAME,
      commandName: metadata.name,
      message: "Duplicate custom command ignored: " + metadata.name,
      path,
    });
    return;
  }
  state.selected.set(metadata.name, metadata);
}

export async function discoverCommandCatalog(
  input: CatalogInput,
): Promise<CustomCommandLoadOutcome> {
  assertNotCancelled(input.options);
  const cwd = resolve(input.request.workingDirectory);
  const roots =
    input.request.roots ?? (await resolveDefaultCustomCommandRoots(cwd, input.rootOptions));
  const state: CatalogState = { diagnostics: [], selected: new Map(), totalDiscovered: 0 };
  for (const root of roots.toSorted((byPriority) => byPriority.priority)) {
    assertNotCancelled(input.options);
    for (const path of await filesUnderRoot(root.path, state.diagnostics)) {
      assertNotCancelled(input.options);
      admit(state, await readMetadata(path, root, state.diagnostics), path, input.disabled);
    }
  }
  const outcome = {} as CustomCommandLoadOutcome;
  outcome.commands = Array.from(state.selected.values()).toSorted((left, right) =>
    left.name.localeCompare(right.name),
  );
  outcome.diagnostics = state.diagnostics;
  outcome.totalDiscovered = state.totalDiscovered;
  return outcome;
}

export async function loadCommandContent(
  metadata: CustomCommandMetadata,
  requestedName: string,
  maxBytes: number | undefined,
): Promise<CustomCommandContent> {
  if (metadata === undefined) throw new Error("Custom command not found: " + requestedName);
  const limit = maxBytes ?? DEFAULT_MAX_BYTES;
  const info = await stat(metadata.path);
  const truncated = info.size > limit;
  const bytes = truncated ? await readPrefix(metadata.path, limit) : await readFile(metadata.path);
  const content = { metadata, truncated } as CustomCommandContent;
  content.content = removeFrontmatter(bytes.toString("utf8")).trim();
  content.bytesRead = bytes.byteLength;
  content.sizeBytes = info.size;
  return content;
}
