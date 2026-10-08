import { validateStudioImageInputs } from "./imageInput.js";
import type { StudioCommand } from "../contract.js";
import type { StudioKernelConfig, StudioKernelId } from "../kernelTypes.js";
import { isStudioKernelId } from "./kernelIdentity.js";
import { assertKernelNotRetired } from "./kernelPolicy.js";

import { validateWorkspaceReviewCommand } from "./workspaceReviewPolicy.js";

export { STUDIO_KERNEL_IDS } from "./kernelIdentity.js";
export const activeRunStates = new Set(["queued", "running", "waiting"]);
export function validStudioId(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[\w:-]{1,180}$/.test(value) ||
    ["__proto__", "constructor", "prototype"].includes(value)
  )
    throw new Error("无效的记录标识");
}
function text(value: unknown, max: number, label: string): asserts value is string {
  if (typeof value !== "string" || value.length > max || value.includes("\0"))
    throw new Error(`${label}无效或过长`);
}
export function validWorkspace(path: unknown): asserts path is string {
  text(path, 4096, "项目路径");
  if (
    !path.trim() ||
    /[\r\n]/.test(path) ||
    /^(?:ssh|remote|https?):/i.test(path) ||
    !/^(?:[a-zA-Z]:[\\/]|\/)/.test(path)
  )
    throw new Error("请选择项目的绝对路径");
}
export function validKernel(kernel: unknown): asserts kernel is StudioKernelId {
  if (!isStudioKernelId(kernel)) throw new Error("未知内核");
}
/** 新建、配置与管理只接受仍在目录中的内核；已移除内核仅作为历史记录的身份保留。 */
export function validActiveKernel(kernel: unknown): asserts kernel is StudioKernelId {
  validKernel(kernel);
  assertKernelNotRetired(kernel);
}
export function validModel(model: unknown): asserts model is string {
  if (
    typeof model !== "string" ||
    model.length > 256 ||
    [...model].some((char) => char.charCodeAt(0) < 32)
  )
    throw new Error("无效模型标识");
}
export function validateStudioKernelManagement(params: { kernel: unknown; action: unknown }): void {
  validActiveKernel(params.kernel);
  if (
    typeof params.action !== "string" ||
    !["install", "update", "uninstall", "update-existing"].includes(params.action)
  )
    throw new Error("未知内核管理操作");
}
export function validConfig(config: StudioKernelConfig): void {
  text(config.executablePath, 4096, "程序路径");
  if (/[\r\n]/.test(config.executablePath)) throw new Error("程序路径不能包含换行");
  if (!["read-only", "ask", "full-access"].includes(config.permission))
    throw new Error("未知权限设置");
  if (config.model !== undefined) validModel(config.model);
  if (config.reasoningEffort !== undefined) text(config.reasoningEffort, 64, "思考档位");
}
function validBaseUpdatedAt(value: unknown): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value)))
    throw new Error("无效的定义版本");
}
export function validateStudioCommand(command: StudioCommand): void {
  validStudioId(command.commandId);
  switch (command.type) {
    case "attention-read":
      validStudioId(command.id);
      if (!["run", "interaction"].includes(command.object)) throw new Error("待办类别无效");
      text(command.version, 1000, "阅读版本");
      if (!command.version) throw new Error("缺少所见阅读版本");
      break;
    case "workspace-review":
      validStudioId(command.runId);
      validStudioId(command.stepId);
      if (command.draftId !== undefined) validStudioId(command.draftId);
      if (command.action === "save-comment" || command.action === "delete-comment")
        validStudioId(command.commentId);
      if (command.action === "send") validStudioId(command.previewId);
      validateWorkspaceReviewCommand(command);
      break;
    case "configure":
      validActiveKernel(command.kernel);
      validConfig(command.config);
      break;
    case "create-conversation":
      validStudioId(command.id);
      validActiveKernel(command.kernel);
      validWorkspace(command.workspacePath);
      break;
    case "save-group": {
      validBaseUpdatedAt(command.baseUpdatedAt);
      const group = command.group;
      validStudioId(group.id);
      text(group.name, 80, "群名称");
      text(group.goal, 4000, "任务目标");
      text(group.sharedSummary, 8000, "共享摘要");
      if (
        !group.name.trim() ||
        !Array.isArray(group.members) ||
        !group.members.length ||
        group.members.length > 32
      )
        throw new Error("群聊需要名称和至少一位成员");
      group.members.forEach(validKernel);
      if (
        new Set(group.members).size !== group.members.length ||
        !group.members.includes(group.host)
      )
        throw new Error("成员重复或主持人不在群内");
      if (
        !["manual", "task"].includes(group.mode) ||
        !["isolated", "shared"].includes(group.workspaceMode)
      )
        throw new Error("群聊模式无效");
      if (group.workspacePath) validWorkspace(group.workspacePath);
      break;
    }
    case "save-workflow":
      validBaseUpdatedAt(command.baseUpdatedAt);
      validStudioId(command.workflow.id);
      text(command.workflow.name, 100, "工作流名称");
      if (
        !command.workflow.name.trim() ||
        !Array.isArray(command.workflow.nodes) ||
        command.workflow.nodes.length > 200 ||
        !Array.isArray(command.workflow.edges) ||
        command.workflow.edges.length > 800
      )
        throw new Error("工作流大小或名称无效");
      if (command.workflow.workspacePath) validWorkspace(command.workflow.workspacePath);
      break;
    case "send":
      if (command.attachments !== undefined) {
        if (command.kind !== "chat") throw new Error("图片仅支持本地 Codex 单聊");
        validateStudioImageInputs(command.attachments);
      }
      if (command.imageModel !== undefined) {
        if (!command.attachments?.length) throw new Error("图片模型快照必须附带图片");
        validModel(command.imageModel);
      }
      validStudioId(command.targetId);
      text(command.text, 32000, "消息");
      if (command.selection) {
        if (command.kind !== "chat") throw new Error("模型选择只适用于对应单聊");
        if (command.selection.model !== undefined) text(command.selection.model, 256, "模型");
        if (command.selection.reasoningEffort !== undefined)
          text(command.selection.reasoningEffort, 64, "思考档位");
      }
      if (command.kernelConfig) {
        if (command.kind !== "chat") throw new Error("运行配置只适用于单聊派发");
        validConfig(command.kernelConfig);
      }
      if (
        !["chat", "group", "workflow"].includes(command.kind) ||
        (command.kind !== "workflow" && !command.text.trim() && !command.attachments?.length)
      )
        throw new Error("请输入消息");
      break;
    case "cancel":
    case "resume":
      validStudioId(command.runId);
      // RPC 类型不替代运行时校验；字符串 "false" 不能被当作明确同意重试未知副作用。
      if (command.type === "resume" && typeof command.retryUncertain !== "boolean")
        throw new Error("重试确认必须明确为是或否");
      break;
    case "steer":
      validStudioId(command.runId);
      text(command.text, 32000, "补充说明");
      if (!command.text.trim()) throw new Error("请输入补充说明");
      break;
    case "answer":
      validStudioId(command.interactionId);
      break;
    case "delete":
      validStudioId(command.id);
      if (!["conversation", "group", "workflow"].includes(command.kind))
        throw new Error("记录类别无效");
      break;
    default:
      throw new Error("不支持的 Studio 命令");
  }
}
