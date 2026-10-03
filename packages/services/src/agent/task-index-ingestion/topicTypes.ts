import type {
  TopicWireFrameAssembler,
  SessionsIndexTopicWireCandidate,
  WorkspaceConfigTopicWireCandidate,
  V4SessionsIndexSubscribeResult,
  V4ConversationResyncResult,
} from "@knorvia/shared/protocol-v4";
import type { KnorviaAgentWorkspaceTarget } from "../agent.js";
import type { createServiceLogger } from "#src/logger/serviceLogger.js";

export type IngestLogger = ReturnType<typeof createServiceLogger>;
export type Delivery = "initial" | "online" | "recovery";
export type TopicKind = "sessions-index" | "workspace-config";
export type TopicWire = SessionsIndexTopicWireCandidate | WorkspaceConfigTopicWireCandidate;
export type SubscriptionReason =
  | "initial"
  | "runtime-restart"
  | "snapshot-recovery-gap"
  | "recovery-frame-timeout"
  | "resync-ack-mismatch"
  | "resync-failed"
  | "force-recovery-gap"
  | "pre-ack-overflow"
  | "provider-not-ready-wait"
  | "retry";

export interface LogicalTopicFrame {
  topic: string;
  subscriptionId: string;
  fromSeq: number;
  toSeq: number;
  payload:
    | { kind: "snapshot"; snapshot: { logEpoch: string } }
    | { kind: "deltas"; deltas: unknown[] };
}

export interface RecoveryFlight {
  subscription: string;
  forceSnapshot: boolean;
  acknowledged: boolean;
  applied: boolean;
  upgrade: boolean;
  followup: boolean;
  deadline: ReturnType<typeof setTimeout> | null;
}

export interface TopicOwnership {
  generation: number;
  subscription: string | null;
  epoch: string | null;
  sequence: number;
  hasBase: boolean;
  flight: RecoveryFlight | null;
}

export interface TopicPorts<F extends LogicalTopicFrame> {
  kind: TopicKind;
  target: KnorviaAgentWorkspaceTarget;
  topic(): string;
  live(): boolean;
  logger: IngestLogger;
  assembler: TopicWireFrameAssembler<F>;
  subscribe(): Promise<V4SessionsIndexSubscribeResult>;
  unsubscribe(subscriptionId: string): Promise<void>;
  resync(input: {
    subscriptionId: string;
    base: { logEpoch: string; seq: number } | null;
    forceSnapshot?: boolean;
  }): Promise<V4ConversationResyncResult>;
  becameUnavailable(): void;
  apply(frame: F): void;
  commitDeltaBeforeProjection: boolean;
  expiryChanged(): void;
}

export interface TopicIngest {
  readonly generation: number;
  readonly nextExpiryAt: number | null;
  receive(wire: TopicWire): void;
  expire(now: number): void;
  subscribe(reason: SubscriptionReason, unsubscribeActive: boolean): Promise<void>;
  reset(unsubscribeActive: boolean): void;
}
