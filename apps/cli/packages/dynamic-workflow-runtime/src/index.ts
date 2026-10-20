// SPDX-License-Identifier: Apache-2.0
// @knorvia/dynamic-workflow-runtime：动态工作流的沙箱 harness。
//
// 对外暴露 harness 入口、线协议类型、入口文件的渲染与落盘（测试与工具据此造出与生产同形的
// 入口文件），以及子进程出口 childMain。SEA 隐藏子命令不再 import 本包：入口文件自带
// childMain，子命令只 import() 文件并调它的 start。
export { runWorkflowScript, type DriverFactory, type RunWorkflowOptions } from "./harness.js";
export { childMain, renderChildEntry } from "./child-source.js";
export type { ChildMainDeps, ChildReadlineInterface, ChildVmModule } from "./child-host-types.js";
export {
  childEntryFileName,
  fallbackWorkflowRunsDir,
  workflowRunsDir,
  writeChildEntryFile,
} from "./child-entry-file.js";
export type {
  ChildEntryFile,
  HarnessWarning,
  WriteChildEntryFileInput,
} from "./entry-file-types.js";
export type {
  ChildMessage,
  ChildPayload,
  CompleteMessage,
  CreateActorMessage,
  EventMessage,
  ParentMessage,
  RequestMessage,
  ResponseMessage,
  WireError,
} from "./protocol.js";
