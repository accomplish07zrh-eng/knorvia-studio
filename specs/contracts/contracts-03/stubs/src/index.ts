// SPDX-License-Identifier: Apache-2.0
// contracts-03 桩：保留 interface.md 列出的导出名与种类；函数体抛 Error，运行时值在首次使用时抛错。
// 精确签名见 interface.md（替换 PR 会用按签名生成的实现替换这些文件并删除旧实现）。

const notImplemented = (): never => {
  throw new Error("not implemented: contracts-03");
};

const _unimplementedValue = (): never => notImplemented();
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
export * from "./events/session.events.js";
export * from "./events/stream-recovery.events.js";
export * from "./events/event-reducer.js";
export * from "./events/session-event-retention.js";
export * from "./events/in-memory-session-event-store.js";
export * from "./compact/index.js";
export * from "./rewind/index.js";
export * from "./model/index.js";
export * from "./model/image-media.js";
export * from "./model/media-policy.js";
export * from "./telemetry/index.js";
export * from "./errors/index.js";
export * from "./config/index.js";
export * from "./hooks/index.js";
export * from "./skills/index.js";
export * from "./commands/index.js";
export * from "./plugins/index.js";
export * from "./workflow/index.js";
export * from "./logging/logger.js";
export * from "./tracing/tracer.js";
export * from "./time/local-date.js";
export * from "./path/index.js";
export * from "./network/public-egress-ip.js";
export * from "./tools/index.js";
export * from "./tools/websearch.js";
export const MEDIA_BUDGET_CURRENT_ATTACHMENT_TOO_LARGE_ERROR_CODE = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const MEDIA_BUDGET_CURRENT_IMAGE_TOO_LARGE_ERROR_CODE = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const MEDIA_BUDGET_CURRENT_VIDEO_TOO_LARGE_ERROR_CODE = new Proxy({} as never, {
  get: _unimplementedValue,
});
export const VIDEO_INPUT_MAX_BYTES = new Proxy({} as never, { get: _unimplementedValue });
export * from "./tracing/local-turn-preparation.js";
export const LocalTtftDetail = new Proxy({} as never, { get: _unimplementedValue });
export * from "./interfaces/permission-full-access.js";
