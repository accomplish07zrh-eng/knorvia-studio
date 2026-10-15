// SPDX-License-Identifier: Apache-2.0
// 跨端 platform contract 兼容面桶：实现按域拆在 internal-s02/platform-*（B39/B51）。
// 本模块路径与导出名是兼容面；内部怎么拆属于实现细节。
export * from "./internal-s02/platform-browser-view.js"; // browser 视图与截图表面
export * from "./internal-s02/platform-desktop.js"; // 桌面窗口与远程会话事件
export * from "./internal-s02/platform-editor.js"; // 编辑器打开与媒体预览
export * from "./internal-s02/platform-service.js"; // 平台操作接口
export type {
  PostUpdateReleaseNotesPayload, // 更新后版本说明载荷
  UpdateCheckResultPayload, // 手动检查更新结果
  UpdateStatePayload, // 自动更新状态
} from "./update.js";
