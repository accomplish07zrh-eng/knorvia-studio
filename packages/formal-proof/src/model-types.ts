export type RunPhase = "idle" | "running" | "completed" | "compacting" | "goalVerifying";
export type QueueState = "empty" | "text" | "goal" | "compact" | "mixed";
export type CompactMemory = "never" | "compactable" | "justCompacted" | "notNeeded";
export type GoalState = "none" | "active" | "verifying" | "verified" | "failed";
export type TurnTarget = "latest" | "old" | "none";
export type CandidateKind = "user" | "system";
// held 状态输入不静默入队，
// 由用户选择「清空 queue 后发送 / 保留 queue 立即发送」。
export type DecisionKind = "allow" | "reject" | "enqueue" | "choice" | "system" | "undefined";
export type NodeKind = "state" | "candidate" | "guard" | "effect" | "case" | "summary";

export interface ProductContext {
  readonly runPhase: RunPhase;
  readonly queue: QueueState;
  readonly compactMemory: CompactMemory;
  readonly canCompactAgain: boolean;
  readonly goal: GoalState;
  readonly selectedTurn: TurnTarget;
  readonly forked: boolean;
}

export interface Candidate {
  readonly id: string;
  readonly kind: CandidateKind;
  readonly label: string;
  readonly target: TurnTarget;
  readonly surface: string;
}

export interface Decision {
  readonly kind: DecisionKind;
  readonly ruleId: string;
  readonly title: string;
  readonly reason: string;
  readonly next?: ProductContext;
  readonly assertion: string;
}

export interface TraceNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly title: string;
  readonly subtitle: string;
  readonly detail: string;
  readonly context: ProductContext;
  readonly candidate?: Candidate;
  readonly decision?: Decision;
  readonly caseId?: string;
  readonly e2e?: string;
  readonly children: TraceNode[];
}

export interface TraceStats {
  readonly nodes: number;
  readonly cases: number;
  readonly rejects: number;
  readonly undefined: number;
  readonly enqueued: number;
  readonly allowed: number;
  readonly choices: number;
  readonly system: number;
}

export interface ModelProfile {
  readonly id: string;
  readonly label: string;
  readonly context: ProductContext;
}

