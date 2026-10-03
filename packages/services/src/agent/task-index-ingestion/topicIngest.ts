import { KNORVIA_AGENT_PROVIDER_NOT_READY_CODE, resolveWorkspaceKey } from "@knorvia/shared";
import type { TopicWireAssemblyEvent } from "@knorvia/shared/protocol-v4";
import { KNORVIA_AGENT_RUNTIME_UNAVAILABLE_CODE } from "../agent.js";
import { createTopicRecovery } from "./topicRecovery.js";
import type {
  Delivery,
  LogicalTopicFrame,
  SubscriptionReason,
  TopicIngest,
  TopicOwnership,
  TopicPorts,
  TopicWire,
} from "./topicTypes.js";

interface AdmissionBuffer {
  generation: number;
  wires: TopicWire[];
  bytes: number;
  overflow: boolean;
}

function delivery(value: unknown): Delivery | undefined {
  return value === "initial" || value === "online" || value === "recovery" ? value : undefined;
}

function codeOf(error: unknown): unknown {
  return typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
}

/** One instance is the sole subscription/cursor owner for one workspace topic. */
export function createTopicIngest<F extends LogicalTopicFrame>(ports: TopicPorts<F>): TopicIngest {
  const owner: TopicOwnership = {
    generation: 0,
    subscription: null,
    epoch: null,
    sequence: 0,
    hasBase: false,
    flight: null,
  };
  let buffer: AdmissionBuffer | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;
  let warnedAt: number | null = null;
  const recovery = createTopicRecovery(owner, ports, (reason) => { void subscribe(reason, true); });

  function empty(pending: AdmissionBuffer | null): void {
    if (!pending) return;
    pending.wires.length = 0;
    pending.bytes = 0;
  }

  function clearInput(): void {
    empty(buffer);
    buffer = null;
    ports.assembler.clear();
  }

  function stopRetry(): void {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  }

  async function unsubscribe(id: string): Promise<void> {
    try {
      await ports.unsubscribe(id);
    } catch (error) {
      ports.logger.warn(
        undefined,
        `清理 task index ${ports.kind} 订阅失败 workspace=${ports.target.workspacePath}`,
        error,
      );
    }
  }

  function stage(wire: TopicWire): void {
    const pending = buffer;
    if (!pending || pending.overflow) return;
    const bytes = new TextEncoder().encode(JSON.stringify(wire)).byteLength;
    if (
      bytes > 32 * 1024 * 1024 || pending.wires.length >= 1_024 ||
      pending.bytes + bytes > 32 * 1024 * 1024
    ) {
      empty(pending);
      pending.overflow = true;
      ports.logger.warn(
        undefined,
        `task index ${ports.kind} ACK staging overflow; recovery-needed workspace=${resolveWorkspaceKey(ports.target)}`,
      );
      return;
    }
    pending.wires.push(wire);
    pending.bytes += bytes;
  }

  function apply(frame: F, kind: Delivery): void {
    if (!ports.live()) return;
    const flight = owner.flight;
    if (kind === "online" && flight && frame.payload.kind === "deltas") {
      if (flight.applied && frame.toSeq > owner.sequence) flight.followup = true;
      return;
    }
    if (frame.payload.kind === "snapshot") {
      if (kind === "online" && owner.hasBase && frame.toSeq <= owner.sequence) return;
      owner.epoch = frame.payload.snapshot.logEpoch;
      owner.sequence = frame.toSeq;
      owner.hasBase = true;
      ports.apply(frame);
      recovery.applied(kind);
      return;
    }
    if (!owner.hasBase) {
      recovery.gap(kind === "recovery" ? "recovery" : "online");
      return;
    }
    if (frame.toSeq <= owner.sequence) {
      if (kind === "recovery") recovery.applied(kind);
      return;
    }
    if (frame.fromSeq !== owner.sequence) {
      recovery.gap(kind);
      return;
    }
    if (ports.commitDeltaBeforeProjection) owner.sequence = frame.toSeq;
    ports.apply(frame);
    owner.sequence = frame.toSeq;
    owner.hasBase = true;
    recovery.applied(kind);
  }

  function fault(event: Extract<TopicWireAssemblyEvent<F>, { kind: "fault" }>): void {
    ports.logger.warn(
      undefined,
      `task index ${ports.kind} physical assembly failed reason=${event.fault.reasonCode} workspace=${resolveWorkspaceKey(ports.target)}`,
    );
    recovery.fault(delivery(event.fault.deliveryKind));
  }

  function receive(wire: TopicWire): void {
    if (!ports.live() || wire.topic !== ports.topic()) return;
    if (owner.subscription === null) {
      stage(wire);
      return;
    }
    if (wire.subscriptionId !== owner.subscription) return;
    const events = ports.assembler.accept(wire);
    const failed = events.find((event) => event.kind === "fault");
    if (failed?.kind === "fault") {
      ports.assembler.abort(wire.topic, wire.subscriptionId);
      fault(failed);
    } else {
      for (const event of events) {
        if (event.kind === "complete") apply(event.frame, delivery(event.deliveryKind) ?? "online");
      }
    }
    ports.expiryChanged();
  }

  function retry(providerPending: boolean): void {
    if (!ports.live() || retryTimer) return;
    const delay = providerPending ? 5_000 : Math.min(1_000, 25 * 2 ** Math.min(attempts, 5));
    attempts++;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (ports.live()) void subscribe(providerPending ? "provider-not-ready-wait" : "retry", false);
    }, delay);
    retryTimer.unref?.();
  }

  function reportFailure(reason: SubscriptionReason, error: unknown, providerPending: boolean): void {
    const message = `task index ${ports.kind} 订阅失败 reason=${reason} workspace=${ports.target.workspacePath}`;
    if (providerPending) {
      ports.logger.debug(undefined, message, error);
      return;
    }
    const now = Date.now();
    if (warnedAt === null || now - warnedAt >= 60_000) {
      warnedAt = now;
      ports.logger.warn(undefined, message, error);
    } else ports.logger.debug(undefined, message, error);
  }

  async function subscribe(reason: SubscriptionReason, unsubscribeActive: boolean): Promise<void> {
    if (!ports.live()) return;
    stopRetry();
    const generation = ++owner.generation;
    const previous = owner.subscription;
    owner.subscription = null;
    recovery.clear();
    clearInput();
    if (unsubscribeActive && previous) {
      await unsubscribe(previous);
      if (!ports.live() || owner.generation !== generation) return;
    }
    const pending: AdmissionBuffer = { generation, wires: [], bytes: 0, overflow: false };
    buffer = pending;
    try {
      const result = await ports.subscribe();
      const id = result.ack.subscriptionId;
      if (!ports.live() || generation !== owner.generation || pending.generation !== generation) {
        empty(pending);
        // 旧 ACK 若复用了新代 ID，不能取消当前已取得的 route。
        if (owner.subscription !== id) await unsubscribe(id);
        return;
      }
      if (buffer === pending) buffer = null;
      if (pending.overflow) {
        empty(pending);
        await unsubscribe(id);
        if (ports.live() && generation === owner.generation) void subscribe("pre-ack-overflow", false);
        return;
      }
      owner.subscription = id;
      owner.epoch = result.ack.logEpoch;
      owner.sequence = 0;
      owner.hasBase = false;
      recovery.clear();
      attempts = 0;
      warnedAt = null;
      const staged = [...pending.wires];
      empty(pending);
      for (const wire of staged) {
        if (wire.subscriptionId === id) receive(wire);
      }
    } catch (error) {
      if (!ports.live() || generation !== owner.generation) return;
      clearInput();
      if (codeOf(error) === KNORVIA_AGENT_RUNTIME_UNAVAILABLE_CODE) {
        ports.becameUnavailable();
        return;
      }
      const providerPending = codeOf(error) === KNORVIA_AGENT_PROVIDER_NOT_READY_CODE;
      reportFailure(reason, error, providerPending);
      retry(providerPending);
    }
  }

  return {
    get generation() {
      return owner.generation;
    },
    get nextExpiryAt() {
      return ports.assembler.nextExpiryAt;
    },
    receive,
    expire(now: number): void {
      for (const event of ports.assembler.expire(now)) {
        if (event.kind === "fault") fault(event);
      }
    },
    subscribe,
    reset(unsubscribeActive: boolean): void {
      ++owner.generation;
      stopRetry();
      recovery.clear();
      clearInput();
      const previous = owner.subscription;
      owner.subscription = null;
      if (unsubscribeActive && previous) void unsubscribe(previous);
    },
  };
}
