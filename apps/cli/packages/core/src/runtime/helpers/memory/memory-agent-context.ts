// SPDX-License-Identifier: Apache-2.0
// 项目记忆的代理上下文（B45）。一次快照定型：遥测因果、记忆根、当前运行时条目的拷贝、
// 中途系统提醒配置、带请求元数据（querySource/skipTranscript、会话类型 other、每次尝试前
// 刷新运行时 header）的模型、读取文件状态拷贝、工具合同拷贝、工作目录与工作区根。请求消息
// = 快照条目 + 追加的 prompt 用户条目（开启缓存控制）。工具执行器固定 yolo 模式 + 拒绝型
// 权限 broker + 默认权限配置 + main 作用域，事件回写为空操作。同步快照，不抛异常。
import type { Model, ModelInputMessage, ModelToolContract, TraceContext } from "../../deps.js";
import type { AgentTelemetryCausation, ModelApiOperation } from "@knorvia/contracts";
import {
  PermissionService,
  createDenyPermissionBroker,
  createToolExecutor,
  defaultPermissionConfig,
  traceContextToLogContext,
} from "../../deps.js";
import type { RuntimeMessageEntry } from "../../../agent/message-history.js";
import type { ReadFileStateMap } from "../../../tool/types.js";
import type { AgentRuntimeInternal } from "../../internal.js";
import { getSessionShellSelectionFromConfig } from "../../methods/session-shell-environment.js";
import { buildRuntimeProviderRequestMessages } from "../provider/request-message-pipeline.js";
import { createRefreshRuntimeHeadersBeforeModelAttempt } from "../../methods/model-runtime-headers.js";
import { createRuntimeModel, withModelInvocationContext } from "../../methods/runtime-model.js";

// 记忆抽取任务的代理上下文快照（条目与状态均为拷贝）。
export /* 记忆抽取的代理上下文快照 */ interface ProjectMemoryAgentContext {
  causation?: AgentTelemetryCausation; // 遥测因果（如有）
  memoryRoot: string; // 记忆根目录
  providerEntries: readonly RuntimeMessageEntry[]; // 运行时条目拷贝
  midConversationSystem: AgentRuntimeInternal["config"]["midConversationSystem"]; // 中途系统提醒配置
  model: Model; // 带请求元数据的模型
  operation: ModelApiOperation; // 模型操作名
  readFileState: ReadFileStateMap; // 读取文件状态拷贝
  tools: readonly ModelToolContract[]; // 工具合同拷贝
  traceContext: TraceContext; // 链路追踪上下文
  workingDirectory: string; // 工作目录
  workspaceRoot: string; // 工作区根
}

// 捕获快照的输入。
export interface MemoryAgentCaptureInput {
  memoryRoot: string; // 记忆根目录
  model?: Model; // 可选的现成模型
  operation: ModelApiOperation; // 模型操作名
  traceContext: TraceContext; // 链路追踪上下文
}

// 给模型包裹记忆抽取的请求元数据（每次尝试前刷新运行时 header）。
const withExtractionRequestContext = (
  agentRuntime: AgentRuntimeInternal,
  baseModel: Model,
  captureInput: MemoryAgentCaptureInput,
): Model => {
  // 刷新器收到的是包装后的模型自身（与旧实现同口径），请求到来时才解引用。
  const traceInfo = traceContextToLogContext(captureInput.traceContext);
  const requestMetadata = {
    ...traceInfo,
    querySource: captureInput.operation,
    skipTranscript: true, // 抽取过程不落对话转写
  };
  let wrapped: Model;
  wrapped = withModelInvocationContext(baseModel, (attempt) => ({
    metadata: requestMetadata,
    modelRequestSessionType: "other", // 记忆抽取不计入常规会话类型
    modelCall: { operation: captureInput.operation }, // 模型调用元数据
    refreshRuntimeHeadersBeforeAttempt: createRefreshRuntimeHeadersBeforeModelAttempt(
      agentRuntime,
      {
        abortSignal: attempt.abortSignal,
        model: wrapped,
        traceContext: captureInput.traceContext,
      },
    ),
    traceContext: captureInput.traceContext,
  }));
  return wrapped;
};

// 一次性快照运行时状态；条目、读取状态与工具合同全部拷贝。
export const captureProjectMemoryAgentContext = (
  agentRuntime: AgentRuntimeInternal,
  captureInput: MemoryAgentCaptureInput,
): ProjectMemoryAgentContext => {
  const baseModel =
    captureInput.model ??
    createRuntimeModel(agentRuntime, {
      selection: agentRuntime.getSessionModelSelection(),
    });
  const agentModel = withExtractionRequestContext(agentRuntime, baseModel, captureInput);

  const entryCopies = [...agentRuntime.messageHistory.borrowReadOnlyRuntimeEntries()];
  const readStateCopy = new Map(agentRuntime.readFileState);
  const toolCopies = agentRuntime.getTools(agentModel).map((tool) => ({ ...tool }));
  const workspaceInfo = {
    workingDirectory: agentRuntime.workingDirectory,
    workspaceRoot: agentRuntime.workspaceRoot,
  };
  const snapshot: ProjectMemoryAgentContext = {
    causation: agentRuntime.agentTelemetry.captureCausation(),
    memoryRoot: captureInput.memoryRoot,
    providerEntries: entryCopies,
    midConversationSystem: agentRuntime.config.midConversationSystem,
    model: agentModel,
    operation: captureInput.operation,
    readFileState: readStateCopy,
    tools: toolCopies,
    traceContext: captureInput.traceContext,
    ...workspaceInfo,
  };
  return snapshot;
};

// 请求消息 = 快照条目 + 追加的 prompt 用户条目（开启缓存控制）。
export const buildProjectMemoryAgentProviderMessages = (
  agentRuntime: AgentRuntimeInternal,
  snapshot: ProjectMemoryAgentContext,
  promptText: string,
): ModelInputMessage[] => {
  const promptEntry: RuntimeMessageEntry = { message: { content: promptText, role: "user" } };
  const entries: RuntimeMessageEntry[] = [...snapshot.providerEntries, promptEntry];
  const projection = buildRuntimeProviderRequestMessages(
    { config: { midConversationSystem: snapshot.midConversationSystem } },
    { applyCacheControl: true, entries, model: snapshot.model },
  );
  return projection.messages;
};

// 工具执行器装配：yolo 模式、拒绝型权限 broker、默认权限配置、main 作用域、事件空操作。
export const createProjectMemoryAgentToolExecutor = (
  agentRuntime: AgentRuntimeInternal,
  snapshot: ProjectMemoryAgentContext,
): ReturnType<typeof createToolExecutor> => {
  const portBindings = {
    artifactStore: agentRuntime.artifactStore,
    executionPort: agentRuntime.executionPort,
    fileSystemPort: agentRuntime.fileSystemPort,
    imageProcessorPort: agentRuntime.imageProcessorPort,
    pdfDocumentPort: agentRuntime.pdfDocumentPort,
    sessionStore: agentRuntime.sessionStore,
    skillPort: agentRuntime.skillPort,
  };
  const sessionPolicy = {
    getMode: () => "yolo" as const, // 记忆抽取固定宽松执行模式
    maxConcurrency: agentRuntime.config.toolConcurrency?.maxConcurrency,
    permissionBroker: createDenyPermissionBroker(), // 拒绝型 broker：抽取任务不申请权限
    permissionService: new PermissionService(defaultPermissionConfig),
    registry: agentRuntime.registry,
    runtimeScope: "main" as const,
    sessionId: agentRuntime.sessionId,
  };
  const snapshotBindings = {
    emitEvent: async () => {}, // 事件回写是空操作
    getBashShellSelection: () => getSessionShellSelectionFromConfig(agentRuntime.config),
    getMemoryRoot: () => snapshot.memoryRoot,
    getWorkingDirectory: () => snapshot.workingDirectory,
    getWorkspaceRoot: () => snapshot.workspaceRoot,
    model: snapshot.model,
    readFileState: new Map(snapshot.readFileState),
    traceContext: snapshot.traceContext,
  };
  return createToolExecutor({
    ...portBindings,
    ...sessionPolicy,
    ...snapshotBindings,
  });
};
