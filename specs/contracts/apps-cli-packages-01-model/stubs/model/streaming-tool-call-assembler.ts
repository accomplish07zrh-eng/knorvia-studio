// SPDX-License-Identifier: Apache-2.0
// 桩：apps-cli-packages-01-model（生成器 build-stubs.mjs，签名取自 interface.md）
export class StreamingToolCallAssembler {
  private readonly logger?: Logger;
  private readonly pending = new Map<string, Pending>();
  private readonly calls = new Map<string, ModelToolCall>();
  constructor(options: StreamingToolCallAssemblerOptions = {}) {
    throw new Error("not implemented: apps-cli-packages-01-model");
  }
  snapshotNormalizedToolCalls(): ModelToolCall[] {
    throw new Error("not implemented: apps-cli-packages-01-model");
  }
  handle(event: ModelStreamEvent): ModelStreamEvent[] {
    throw new Error("not implemented: apps-cli-packages-01-model");
  }
  flush(): ModelStreamEvent[] {
    throw new Error("not implemented: apps-cli-packages-01-model");
  }
  private commit(id: string): ModelStreamEvent[] {
    throw new Error("not implemented: apps-cli-packages-01-model");
  }
}
