// SPDX-License-Identifier: Apache-2.0
// Retained generated public declaration snapshot; not a new Knorvia implementation.
// Source and original digest: licensing/evidence/plugin-storage-runtime.md

import type {
  PluginComponentGroup,
  PluginComponentItem,
  PluginComponentKind,
  PluginDiagnostic,
  PluginManifest,
} from "@knorvia/contracts";
import type { LoadedPlugin } from "./types.js";
export type { PluginComponentGroup, PluginComponentItem, PluginComponentKind };
/**
 * 在已解析的插件根目录上枚举各类组件的名称与描述。纯文件读取，跨平台只用 node:path/fs。
 * manifest 由调用方读取后传入（可为 null）；缺失目录或无 frontmatter 时跳过或省略描述，
 * 不因单个组件异常阻断整体枚举。
 */
export declare function enumeratePluginComponents(
  rootPath: string,
  manifest: PluginManifest | null,
  options?: {
    diagnostics?: PluginDiagnostic[];
    loaded?: LoadedPlugin;
  },
): PluginComponentGroup[];
//# sourceMappingURL=plugin-components.d.ts.map
