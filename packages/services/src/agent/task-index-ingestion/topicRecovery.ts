import { PROTOCOL_V4_LIMITS } from "@knorvia/shared/protocol-v4";
import type {
  Delivery,
  LogicalTopicFrame,
  RecoveryFlight,
  SubscriptionReason,
  TopicOwnership,
  TopicPorts,
} from "./topicTypes.js";

/** Recovery changes only the containing topic's ownership record. */
export function createTopicRecovery<F extends LogicalTopicFrame>(
  owner: TopicOwnership,
  ports: TopicPorts<F>,
  replace: (reason: SubscriptionReason) => void,
) {
  function clear(): void {
    const pending = owner.flight;
    if (pending?.deadline) clearTimeout(pending.deadline);
    if (pending) pending.deadline = null;
    owner.flight = null;
  }

  function settle(flight: RecoveryFlight): void {
    if (owner.flight !== flight || !flight.acknowledged) return;
    if (flight.upgrade) {
      clear();
      if (flight.forceSnapshot) replace("snapshot-recovery-gap");
      else request(true);
      return;
    }
    if (flight.applied) {
      clear();
      if (flight.followup) request(false);
      return;
    }
    if (flight.deadline) return;
    flight.deadline = setTimeout(() => {
      flight.deadline = null;
      if (!ports.live() || owner.flight !== flight || flight.applied) return;
      clear();
      if (flight.forceSnapshot) replace("recovery-frame-timeout");
      else request(true);
    }, PROTOCOL_V4_LIMITS.logicalFrameAssemblyTimeoutMs);
    flight.deadline.unref?.();
  }

  function request(forceSnapshot: boolean): void {
    const subscription = owner.subscription;
    if (!subscription || !ports.live()) return;
    if (owner.flight) {
      if (forceSnapshot && !owner.flight.forceSnapshot) {
        owner.flight.upgrade = true;
        settle(owner.flight);
      }
      return;
    }
    const forced = forceSnapshot || !owner.hasBase || owner.epoch === null;
    const flight: RecoveryFlight = {
      subscription,
      forceSnapshot: forced,
      acknowledged: false,
      applied: false,
      upgrade: false,
      followup: false,
      deadline: null,
    };
    owner.flight = flight;
    const base = forced ? null : { logEpoch: owner.epoch!, seq: owner.sequence };
    void ports
      .resync({
        subscriptionId: subscription,
        base,
        ...(forced ? { forceSnapshot: true } : {}),
      })
      .then((result) => {
        if (!ports.live() || owner.flight !== flight) return;
        if (owner.subscription !== subscription || result.ack.subscriptionId !== subscription) {
          clear();
          replace("resync-ack-mismatch");
          return;
        }
        flight.acknowledged = true;
        if (result.ack.mode === "snapshot") flight.forceSnapshot = true;
        settle(flight);
      })
      .catch((error) => {
        if (!ports.live() || owner.flight !== flight) return;
        clear();
        ports.logger.warn(
          undefined,
          `task index ${ports.kind} resync 失败，改用新鲜订阅 workspace=${ports.target.workspacePath}`,
          error,
        );
        replace("resync-failed");
      });
  }

  function gap(delivery: Delivery): void {
    if (delivery !== "recovery") {
      request(false);
      return;
    }
    const flight = owner.flight;
    if (!flight) return;
    if (flight.forceSnapshot) {
      clear();
      replace("force-recovery-gap");
    } else request(true);
  }

  return {
    clear,
    gap,
    applied(delivery: Delivery): void {
      if (delivery === "recovery" && owner.flight) {
        owner.flight.applied = true;
        settle(owner.flight);
      }
    },
    fault(delivery: Delivery | undefined): void {
      if (delivery === "online" && owner.flight) {
        owner.flight.followup ||= owner.flight.applied;
        return;
      }
      gap(delivery ?? (owner.flight ? "recovery" : "online"));
    },
  };
}
