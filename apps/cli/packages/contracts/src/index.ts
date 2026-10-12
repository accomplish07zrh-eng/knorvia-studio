// SPDX-License-Identifier: Apache-2.0
// 包根入口：只做再导出，不承载任何实现。下面的模块路径就是本包的公开兼容面——
// 相似度工具在声明模式下按 interface.md 列出的路径名剔除这些行。
// 调用方一律从 `@knorvia/contracts` 取类型与常量，不要绕过这里直接引内部文件。

// 端口与共享类型
export * from "./interfaces/shared.js";
export * from "./interfaces/execution.port.js";
export * from "./interfaces/browser-control.port.js";
export * from "./interfaces/file-system.port.js";
export * from "./interfaces/context-source.port.js";
export * from "./interfaces/http-client.port.js";
export * from "./interfaces/image-processor.port.js";
export * from "./interfaces/pdf-document.port.js";
export * from "./interfaces/permission.port.js";
export * from "./interfaces/project-permission-update.port.js";
export * from "./interfaces/session.port.js";
export * from "./interfaces/session-mailbox.port.js";
export * from "./interfaces/session-store.port.js";
export * from "./interfaces/input-history.port.js";
export * from "./interfaces/tool-artifact-store.port.js";
export * from "./interfaces/subagent.port.js";
export * from "./interfaces/coordinator-response.port.js";
export * from "./interfaces/workflow.port.js";
export * from "./interfaces/workflow-submit.port.js";
export * from "./interfaces/workflow-escalate.port.js";
export * from "./interfaces/dynamic-workflow-run.port.js";
export * from "./interfaces/dynamic-workflow-snippet.port.js";
export * from "./interfaces/model-catalog.port.js";
export * from "./interfaces/automation.port.js";
export * from "./interfaces/off-peak.port.js";
export * from "./interfaces/mcp.port.js";
export * from "./interfaces/runtime-input-presentation.js";
export * from "./interfaces/permission-full-access.js";

// 会话事件与投影
export * from "./events/session.events.js";
export * from "./events/stream-recovery.events.js";
export * from "./events/event-reducer.js";
export * from "./events/session-event-retention.js";
export * from "./events/in-memory-session-event-store.js";

// 上下文压缩与回退
export * from "./compact/index.js";
export * from "./rewind/index.js";

// 模型、媒体与遥测
export * from "./model/index.js";
export * from "./model/image-media.js";
export * from "./model/media-policy.js";
export * from "./telemetry/index.js";

// 错误、配置与钩子
export * from "./errors/index.js";
export * from "./config/index.js";
export * from "./hooks/index.js";

// 技能、命令与插件
export * from "./skills/index.js";
export * from "./commands/index.js";
export * from "./plugins/index.js";

// 工作流、日志与追踪
export * from "./workflow/index.js";
export * from "./logging/logger.js";
export * from "./tracing/tracer.js";
export * from "./tracing/local-turn-preparation.js";

// 时间、路径与网络
export * from "./time/local-date.js";
export * from "./path/index.js";
export * from "./network/public-egress-ip.js";

// 工具
export * from "./tools/index.js";
export * from "./tools/websearch.js";

// 媒体预算上限由 App/Agent 共用策略定义；这里逐个转出，避免 Core 各处跨层取值。
export { MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE_ERROR_CODE } from "@knorvia/shared";
export { MEDIA_BUDGET_CURRENT_IMAGE_TOO_LARGE_ERROR_CODE } from "@knorvia/shared";
export { MEDIA_BUDGET_CURRENT_VIDEO_TOO_LARGE_ERROR_CODE } from "@knorvia/shared";
export { VIDEO_INPUT_MAX_BYTES } from "@knorvia/shared";
export type { LocalTtftDetail } from "@knorvia/shared";
