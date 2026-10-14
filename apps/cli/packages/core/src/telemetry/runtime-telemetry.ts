// SPDX-License-Identifier: Apache-2.0
// 运行时遥测门面：把会话/回合/步骤/压缩/分离操作的埋点收敛到一个入口；
// 无端口时回落到空实现（runtime-telemetry-noop.ts），归类规则见 runtime-telemetry-classify.ts。
import type {
  AgentExecutionTelemetryPort,
  AgentStepSpanWriter,
  AgentTelemetryActorKind,
  AgentTelemetryCausation,
  AgentTelemetryLaunchSurface,
  AgentTurnSpanWriter,
  CompactionTraceStart,
  ContextCompactionSpanWriter,
  DetachedOperationSpanWriter,
  DetachedOperationTraceStart,
  MessageId,
  SessionId,
  SessionTaskType,
  SyntheticUserMessageSource,
  TraceContext,
} from "@knorvia/contracts";
import { actorKindFromTaskType, normalizeInputSource } from "./runtime-telemetry-classify.js";
import type {
  CompactionRequest,
  DetachedRequest,
  FacadeIdentity,
  RuntimeTelemetryFacadeOptions,
  StepRequest,
  TurnRequest,
} from "./runtime-telemetry-port.js";
import { NOOP_AGENT_EXECUTION_TELEMETRY } from "./runtime-telemetry-port.js";

export type { RuntimeTelemetryFacadeOptions } from "./runtime-telemetry-port.js";

/** 执行上下文：把门面身份与调用方的 trace 上下文合并。 */
const executionContextOf = (identity: FacadeIdentity, trace: TraceContext) => {
  const [actorKind, agentName, launchSurface, parentSessionId, parentTurnId, sessionId] = identity;
  return {
    actorKind,
    agentName,
    launchSurface,
    parentSessionId,
    parentTurnId,
    queryId: trace.queryId,
    sessionId: trace.sessionId ?? sessionId,
    turnId: trace.turnId,
  };
};

export class RuntimeTelemetryFacade {
  declare readonly port: AgentExecutionTelemetryPort;
  declare readonly actorKind: AgentTelemetryActorKind;
  declare private readonly agentName?: string;
  declare private readonly causation?: AgentTelemetryCausation;
  declare private readonly causationMode?: "child" | "linked_root";
  declare private readonly launchSurface: AgentTelemetryLaunchSurface;
  declare private readonly parentSessionId?: string;
  declare private readonly parentTurnId?: string;
  declare private readonly sessionId: SessionId;

  constructor(options: RuntimeTelemetryFacadeOptions) {
    const {
      agentName,
      causation,
      causationMode,
      launchSurface,
      parentSessionId,
      port,
      sessionId,
      taskType,
    } = options;
    this.port = port ?? NOOP_AGENT_EXECUTION_TELEMETRY;
    this.actorKind = actorKindFromTaskType(taskType);
    this.agentName = agentName;
    this.causation = causation;
    this.causationMode = causationMode;
    this.launchSurface = launchSurface ?? "standalone_cli";
    this.parentSessionId = parentSessionId ?? causation?.sessionId;
    this.parentTurnId = causation?.turnId;
    this.sessionId = sessionId;
  }

  /** 门面身份快照：供上下文合并使用（顺序与 FacadeIdentity 一致）。 */
  private identity(): FacadeIdentity {
    return [
      this.actorKind,
      this.agentName,
      this.launchSurface,
      this.parentSessionId,
      this.parentTurnId,
      this.sessionId,
    ];
  }

  captureCausation(): AgentTelemetryCausation | undefined {
    return this.port.captureCausation();
  }

  turn(request: TurnRequest): AgentTurnSpanWriter {
    return this.port.startTurn({
      causation: this.causation,
      causationMode: this.causationMode,
      context: executionContextOf(this.identity(), request.traceContext),
      inputSource: normalizeInputSource(request.inputSource),
      turnNumber: request.turnNumber,
    });
  }

  step(request: StepRequest): AgentStepSpanWriter {
    return this.port.startStep({ stepId: request.stepId, stepIndex: request.stepIndex });
  }

  compaction(request: CompactionRequest): ContextCompactionSpanWriter {
    return this.port.startCompaction(request);
  }

  detached(request: DetachedRequest): DetachedOperationSpanWriter {
    return this.port.startDetachedOperation({
      ...request,
      causation: request.causation ?? this.captureCausation(),
      context: executionContextOf(this.identity(), request.traceContext),
    });
  }
}
