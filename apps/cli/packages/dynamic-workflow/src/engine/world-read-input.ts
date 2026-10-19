// SPDX-License-Identifier: Apache-2.0
// Knorvia 动态工作流世界读取/运行操作审计载荷规约。

import { WORLD_READ_INPUT_MAX_BYTES, type WorldReadInput } from "./types.js";

const PREVIEW_ARG_LIMIT = 8;
const PREVIEW_CHAR_CEILING = 400;
const ELLIPSIS_SUFFIX = "…";

class WorldReadInputProjector {
  private readonly encoder = new TextEncoder();

  project(operation: string, argumentsList: readonly unknown[]): WorldReadInput {
    const rawResult: WorldReadInput = {
      op: operation,
      args: argumentsList.slice(),
    };

    if (this.withinByteBudget(rawResult)) {
      return rawResult;
    }

    return {
      op: operation,
      args: this.buildSummaries(argumentsList),
      truncated: true,
    };
  }

  private withinByteBudget(candidate: WorldReadInput): boolean {
    let json: string | undefined;
    try {
      json = JSON.stringify(candidate);
    } catch {
      return false;
    }

    if (typeof json !== "string") {
      return false;
    }

    return this.encoder.encode(json).length <= WORLD_READ_INPUT_MAX_BYTES;
  }

  private buildSummaries(argumentsList: readonly unknown[]): string[] {
    const capped = argumentsList.slice(0, PREVIEW_ARG_LIMIT);
    const previews: string[] = [];
    for (let i = 0; i < capped.length; i++) {
      previews.push(this.stringifySingleArgument(capped[i]));
    }
    return previews;
  }

  private stringifySingleArgument(val: unknown): string {
    let textRepr: string;
    if (typeof val === "string") {
      textRepr = val;
    } else {
      let stringified: string | undefined;
      try {
        stringified = JSON.stringify(val);
      } catch {
        // 捕获不可序列化对象
      }
      textRepr = typeof stringified === "string" ? stringified : String(val);
    }

    if (textRepr.length > PREVIEW_CHAR_CEILING) {
      return textRepr.slice(0, PREVIEW_CHAR_CEILING) + ELLIPSIS_SUFFIX;
    }
    return textRepr;
  }
}

const defaultProjector = new WorldReadInputProjector();

export function boundWorldReadInput(op: string, args: readonly unknown[]): WorldReadInput {
  return defaultProjector.project(op, args);
}
