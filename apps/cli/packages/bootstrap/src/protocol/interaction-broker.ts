import { prepareClientRequestWithV4Interaction } from "./interaction-response-race.js";
import {
  activatePermissionRequest,
  awaitPermissionPreparation,
  mapPreparedPermission,
  PermissionPreparation,
} from "@knorvia/core";
import {
  ASK_USER_QUESTION_TOOL_NAME,
  AskUserQuestionInputSchema,
  EXIT_PLAN_MODE_TOOL_NAME,
  type PermissionBrokerPort,
  type PermissionBrokerRequest,
  type PermissionBrokerRequestOptions,
  type PreparedPermissionRequest,
} from "@knorvia/contracts";
import {
  knorviaPermissionResponseSchema,
  knorviaProtocolMethods,
  knorviaUserInputResponseSchema,
} from "@knorvia/shared";
import { ProtocolRequestError, type KnorviaProtocolAgentServerContext } from "./server-types.js";
import {
  buildProtocolPermissionOptions,
  toLegacyPermissionOptionsPolicy,
  PERMISSION_DENIED_BY_USER_CONTENT,
} from "./permission-options.js";
import {
  createInteractionRegistrationOptions,
  readPersistedAutoResolution,
} from "./interaction-auto-resolution.js";
import { v4AnswerToPermissionResponse } from "./interaction-permission-response.js";
import {
  v4AnswerToUserInputResponse,
  v4AnswerToPlanApprovalResponse,
  createExitPlanModeApprovalQuestion,
  mapAskUserQuestion,
  userInputResponseToBrokerResult,
  planApprovalResponseToBrokerResult,
} from "./interaction-question-response.js";
const INTERACTION_REQUEST_REANNOUNCE_INTERVAL_MS = 1_000;
export function createProtocolInteractionBroker(
  context: KnorviaProtocolAgentServerContext,
): PermissionBrokerPort {
  const broker: PermissionBrokerPort = {
    async preparePermission(request, options) {
      if (request.toolName === ASK_USER_QUESTION_TOOL_NAME) {
        return requestUserInput(context, request, options);
      }
      if (request.toolName === EXIT_PLAN_MODE_TOOL_NAME) {
        return requestExitPlanModeApproval(context, request, options);
      }
      return requestPermission(context, request, options);
    },
    requestPermission(request, options) {
      return activatePermissionRequest(broker.preparePermission(request, options));
    },
  };
  return broker;
}

async function requestPermission(
  context: KnorviaProtocolAgentServerContext,
  request: PermissionBrokerRequest,
  options?: PermissionBrokerRequestOptions,
): Promise<PreparedPermissionRequest> {
  const permissionOptions = buildProtocolPermissionOptions(request);
  // v3 反向 RPC 的选项列表：会话免确认只在 v4 投放（旧桌面回传 response 原文，认不出会话语义）。
  const legacyPermissionOptions = buildProtocolPermissionOptions({
    ...request,
    optionsPolicy: toLegacyPermissionOptionsPolicy(request.optionsPolicy),
  });
  const prepared = prepareClientRequestWithV4Interaction(
    context,
    request.requestId,
    options?.signal,
    (signal) =>
      context.requestClient(
        knorviaProtocolMethods.interactionRequestPermission,
        {
          input: request.input,
          reason: request.reason,
          requestId: request.requestId,
          riskLevel: request.riskLevel,
          sessionId: request.sessionId,
          ...(request.origin ? { origin: request.origin } : {}),
          options: legacyPermissionOptions,
          toolCallId: request.toolCallId,
          toolName: request.toolName,
          turnId: request.turnId,
        },
        knorviaPermissionResponseSchema,
        withInteractionRequestRecovery(options, signal),
      ),
    // v4 answer → KnorviaPermissionResponse：optionId 语义来自 v4 reducer 合成的
    // allowOnce/allowAlways/deny（见 product-projection onPermissionRequested）。
    (answer) => {
      const response = v4AnswerToPermissionResponse(answer, permissionOptions, request.toolName);
      return response.decision === "deny" && answer.freeText?.trim()
        ? { ...response, preserveReasonFormatting: true }
        : response;
    },
    {
      ...createInteractionRegistrationOptions(request, "other"),
      ...(!request.origin &&
      !request.optionsPolicy &&
      options?.claimResponse &&
      context.deps?.sessionStore?.commitPermissionFullAccess
        ? {
            fullAccess: async () => {
              if (!options.claimResponse!()) throw new Error("Permission response already settled");
              options.signal?.throwIfAborted();
              const record = context.sessions.get(String(request.sessionId));
              if (!record) throw new Error("Permission session unavailable");
              const eventId = await record.app.runtime.grantPermissionFullAccess(
                request.requestId,
                options.signal,
              );
              await context.v4Gateway?.waitForPermissionGrantCommit(
                String(request.sessionId),
                eventId,
              );
            },
          }
        : {}),
    },
    knorviaProtocolMethods.interactionRequestPermission,
  );
  return mapPreparedPermission(prepared, (response) => ({
    ...response,
    // 兼容原因：legacy 客户端允许省略 reason；普通用户拒绝仍需向模型明确工具未执行，
    // 否则 core 会回退为通用的 `Permission denied for <tool>`，无法阻止绕过式尝试。
    ...(response.decision === "deny" && !response.reason?.trim()
      ? { reason: PERMISSION_DENIED_BY_USER_CONTENT }
      : {}),
    resolvedAt: new Date(),
  }));
}

async function requestUserInput(
  context: KnorviaProtocolAgentServerContext,
  request: PermissionBrokerRequest,
  options?: PermissionBrokerRequestOptions,
): Promise<PreparedPermissionRequest> {
  const parsed = AskUserQuestionInputSchema.safeParse(request.input);
  if (!parsed.success) {
    return new PermissionPreparation({
      signal: options?.signal,
      cancelled: () =>
        new ProtocolRequestError(
          -32021,
          `Client request cancelled: ${knorviaProtocolMethods.interactionRequestUserInput}`,
        ),
      activate: (owner) =>
        owner.resolve({
          decision: "deny",
          reason: `Invalid AskUserQuestion input: ${
            parsed.error.issues[0]?.message ?? "schema validation failed"
          }`,
          resolvedAt: new Date(),
        }),
    });
  }

  const initialAutoResolution = await awaitPermissionPreparation(
    () => readPersistedAutoResolution(context, request),
    options?.signal,
    () =>
      new ProtocolRequestError(
        -32021,
        `Client request cancelled: ${knorviaProtocolMethods.interactionRequestUserInput}`,
      ),
  );

  const prepared = prepareClientRequestWithV4Interaction(
    context,
    request.requestId,
    options?.signal,
    (signal) =>
      context.requestClient(
        knorviaProtocolMethods.interactionRequestUserInput,
        {
          input: request.input,
          prompt: request.reason,
          questions: parsed.data.questions.map(mapAskUserQuestion),
          requestId: request.requestId,
          schema: { toolName: request.toolName },
          sessionId: request.sessionId,
          ...(request.origin ? { origin: request.origin } : {}),
          toolCallId: request.toolCallId,
          toolName: request.toolName,
          turnId: request.turnId,
        },
        knorviaUserInputResponseSchema,
        withInteractionRequestRecovery(options, signal),
      ),
    // v4 答 AskUserQuestion：freeText/optionId 落到单题 answer 槽位
    // （normalizeAskUserQuestionResponseContent 的 content.answer 兼容路径）；
    // deny 落 decline。多题场景等 v4 投影建模 userInput kind 后再精确映射。
    (answer) => v4AnswerToUserInputResponse(answer),
    createInteractionRegistrationOptions(
      request,
      "askUserQuestion",
      context,
      initialAutoResolution,
    ),
    knorviaProtocolMethods.interactionRequestUserInput,
  );

  return mapPreparedPermission(prepared, (response) =>
    userInputResponseToBrokerResult(request, response),
  );
}

async function requestExitPlanModeApproval(
  context: KnorviaProtocolAgentServerContext,
  request: PermissionBrokerRequest,
  options?: PermissionBrokerRequestOptions,
): Promise<PreparedPermissionRequest> {
  const prepared = prepareClientRequestWithV4Interaction(
    context,
    request.requestId,
    options?.signal,
    (signal) =>
      context.requestClient(
        knorviaProtocolMethods.interactionRequestUserInput,
        {
          input: request.input,
          prompt: request.reason,
          questions: [createExitPlanModeApprovalQuestion()],
          requestId: request.requestId,
          schema: { interaction: "plan_approval", toolName: request.toolName },
          sessionId: request.sessionId,
          ...(request.origin ? { origin: request.origin } : {}),
          toolCallId: request.toolCallId,
          toolName: request.toolName,
          turnId: request.turnId,
        },
        knorviaUserInputResponseSchema,
        withInteractionRequestRecovery(options, signal),
      ),
    // v4 答 plan approval：allow 类 optionId = 批准；freeText = 计划反馈
    // （planApprovalResponseToBrokerResult 走 plan_approval_feedback deny）；否则 decline。
    (answer) => v4AnswerToPlanApprovalResponse(answer),
    createInteractionRegistrationOptions(request, "other"),
    knorviaProtocolMethods.interactionRequestUserInput,
  );

  return mapPreparedPermission(prepared, planApprovalResponseToBrokerResult);
}

function withInteractionRequestRecovery(
  options: PermissionBrokerRequestOptions | undefined,
  signal: AbortSignal,
): PermissionBrokerRequestOptions & { reannounceIntervalMs: number } {
  return {
    ...options,
    // v4 竞速：内部 signal 已级联外层 options.signal（见 raceClientRequestWithV4Interaction），
    // v4 应答命中时经它取消悬空的反向 RPC。
    signal,
    // 桌面/恢复链路里 UI 可能只从 snapshot 恢复出 pending 交互，
    // 但 host 里原 protocol id 对应的内存登记已丢失。等待用户响应期间按同一业务
    // requestId 重发现有协议请求，让 host 重新登记可响应的 protocolRequestId。
    reannounceIntervalMs: INTERACTION_REQUEST_REANNOUNCE_INTERVAL_MS,
  };
}
