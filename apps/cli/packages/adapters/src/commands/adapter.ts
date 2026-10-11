// SPDX-License-Identifier: Apache-2.0
// 自定义命令适配器外壳：只做取消检查与转发，扫描/去重/读取逻辑在同目录的 catalog.ts。
import { resolve } from "node:path";
import type {
  CustomCommandContent,
  CustomCommandLoadOutcome,
  CustomCommandOperationOptions,
  CustomCommandPort,
  CustomCommandRoot,
} from "@knorvia/contracts";
import {
  assertNotCancelled,
  discoverCommandCatalog,
  loadCommandContent,
  lookupName,
} from "./catalog.js";
import type { CustomCommandRootResolutionOptions } from "./roots.js";

export interface NodeCustomCommandAdapterOptions extends CustomCommandRootResolutionOptions {
  disabledPaths?: Iterable<string>;
}

/** 请求形状：`roots` 省略时按适配器选项发现默认根。 */
export interface CommandRequest {
  roots?: CustomCommandRoot[];
  workingDirectory: string;
}

interface LoadRequest extends CommandRequest {
  maxBytes?: number;
  name: string;
}

export class NodeCustomCommandAdapter implements CustomCommandPort {
  private readonly rootOptions: NodeCustomCommandAdapterOptions;
  private readonly disabled: Set<string>;

  constructor(options: NodeCustomCommandAdapterOptions = {}) {
    this.rootOptions = options;
    this.disabled = new Set(Array.from(options.disabledPaths ?? [], (path) => resolve(path)));
  }

  async discoverCommands(
    request: CommandRequest,
    options?: CustomCommandOperationOptions,
  ): Promise<CustomCommandLoadOutcome> {
    assertNotCancelled(options);
    return await discoverCommandCatalog({
      disabled: this.disabled,
      options,
      request,
      rootOptions: this.rootOptions,
    });
  }

  async loadCommand(
    request: LoadRequest,
    options?: CustomCommandOperationOptions,
  ): Promise<CustomCommandContent> {
    assertNotCancelled(options);
    const outcome = await this.discoverCommands(
      { roots: request.roots, workingDirectory: request.workingDirectory },
      options,
    );
    const wanted = lookupName(request.name);
    const metadata = outcome.commands.find((command) => command.name === wanted);
    return await loadCommandContent(metadata as never, request.name, request.maxBytes);
  }
}

export function createNodeCustomCommandAdapter(
  options: NodeCustomCommandAdapterOptions = {},
): NodeCustomCommandAdapter {
  return new NodeCustomCommandAdapter(options);
}
