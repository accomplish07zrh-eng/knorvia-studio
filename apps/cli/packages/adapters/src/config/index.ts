// SPDX-License-Identifier: Apache-2.0
// 配置模块公开面：配置端口的两个导出 + 各适配器/工厂的再导出；实现在 store/defaults/port。
import type { ConfigPort, RuntimeConfigPatch } from "@knorvia/contracts";
import { ConfigPortImpl } from "./port.js";

export { ConfigPortImpl };
export type { ConfigPort };

export function createConfigPort(initial?: RuntimeConfigPatch): ConfigPort {
  return new ConfigPortImpl(initial);
}

// 配置模块公开面（按用途分组，便于检索）：
// 一、ConfigPort / ConfigPortImpl —— 运行期配置的读写与订阅入口；状态所有者是 store 的槽位表。
// 二、createConfigPort —— 按初始补丁构造端口，供 bootstrap 注入，不读环境也不读文件。
// 三、file-config.adapter —— 把用户配置文件里的开关写成补丁；设置页只走这一组函数。
// 四、env-config.adapter —— 把 KNORVIA_ 前缀环境变量解析成补丁，优先级低于显式配置。
// 五、config-merger —— 作用域优先级排序与逐层合并：插件逐项合并，其余字段整体替换。
// 六、config-factory —— 把文件、环境与项目配置合成最终 RuntimeConfig，并解析工作区存储目录。
// 七、schema —— 配置文件结构校验与诊断出口；解析失败时给出可定位的路径。
// 八、getDefaultConfigPath / hasDefaultConfigFile —— 默认配置位置的解析与探测。
// 九、updateUiLocaleInFileConfig —— 语言与主题等界面偏好的持久化入口。
// 十、PluginEnabledPatchResult 等结果类型 —— 每个写入函数的返回形状，供调用方判断是否需要提示。
// 约定：本文件只做再导出与端口构造，不承载合并逻辑；新增导出请在此登记并按组归类。
export {
  loadFileConfig,
  getDefaultConfigPath,
  hasDefaultConfigFile,
  resolvePath,
  updatePluginEnabledInFileConfig,
  enablePluginsByDefaultInFileConfig,
  removePluginEnabledFromFileConfig,
  updatePluginOptionsInFileConfig,
  removePluginFromFileConfig,
  addSuppressedBuiltinInFileConfig,
  removeSuppressedBuiltinInFileConfig,
  updateUiLocaleInFileConfig,
  type PluginEnabledPatchResult,
  type PluginOptionsPatchResult,
  type PluginRemovePatchResult,
  type SuppressedBuiltinPatchResult,
  type UiLocalePatchResult,
} from "./file-config.adapter.js";
export { parseEnvConfig, getToolConcurrencyConfig } from "./env-config.adapter.js";
export { KnorviaConfigFileSchema, type KnorviaConfigFile } from "./schema.js";
export { mergeConfigs, createPrioritizedConfig, getScopePriority } from "./config-merger.js";
export {
  createConfig,
  resolveWorkspaceStorageDir,
  type ConfigFactoryOptions,
  type ConfigResult,
} from "./config-factory.js";
