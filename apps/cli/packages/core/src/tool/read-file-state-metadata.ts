// SPDX-License-Identifier: Apache-2.0
// 读取状态快照编解码的兼容面：实现与类型见 ./internal/read-state-codec.js。
// 模块路径、导出名与字段形状保持不变；可选字段语义见实现文件头部。
import * as codec from "./internal/read-state-codec.js";

export type PersistedReadFileStateTool = codec.PersistedReadFileStateTool;
export type PersistedReadFileStateMetadata = codec.PersistedReadFileStateMetadata & {
  // 字段声明与上面的工具名别名绑定：codec 侧一旦改动这个字段，本行会立刻编译失败。
  tool: PersistedReadFileStateTool;
};
export const READ_FILE_STATE_METADATA_SCHEMA_VERSION =
  codec.READ_FILE_STATE_METADATA_SCHEMA_VERSION;
export const parseReadFileStateMetadata = codec.parseReadFileStateMetadata;
export const createReadFileStateMetadataFromEntry = codec.createReadFileStateMetadataFromEntry;
export const createReadFileStateMetadata = codec.createReadFileStateMetadata;
