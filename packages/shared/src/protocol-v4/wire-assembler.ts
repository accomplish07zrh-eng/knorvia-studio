/* eslint-disable max-lines -- Ordinal admission and decoded-byte accounting share one atomic owner. */
import type { z } from "zod";
import { PROTOCOL_V4_LIMITS } from "./core.js";
import { crc32WireBytes, decodeWireBase64 } from "./wire-binary.js";
import { measureTopicNotificationEnvelopeBytes } from "./wire-codec.js";
import type { TopicFrameDeliveryKind, TopicWireFrameCandidate } from "./wire.js";

export interface TopicWireAssemblyFault {
  deliveryKind?: TopicFrameDeliveryKind;
  reasonCode: string;
  logicalFrameId: string;
  logicalFrameOrdinal: number;
  topic: string;
  subscriptionId: string;
}

export type TopicWireAssemblyEvent<F> =
  | { kind: "complete"; frame: F; deliveryKind: TopicFrameDeliveryKind }
  | { kind: "fault"; fault: TopicWireAssemblyFault };

export interface TopicWireFrameAssemblerOptions {
  maxAssemblyBytes?: number;
  maxFragments?: number;
  maxConcurrentAssemblies?: number;
  maxStagedDecodedBytes?: number;
  timeoutMs?: number;
  maxPhysicalFrameBytes?: number;
}

interface FrameIdentity {
  deliveryKind?: unknown;
  logicalFrameId: string;
  logicalFrameOrdinal: number;
  topic: string;
  subscriptionId: string;
}

interface FragmentFields {
  fragmentIndex: number;
  fragmentCount: number;
  logicalBytes: number;
  checksum: { algorithm: string; value: string };
  dataBase64: string;
}

interface Assembly extends FrameIdentity {
  deliveryKind: TopicFrameDeliveryKind;
  fragmentCount: number;
  logicalBytes: number;
  checksum: { algorithm: "crc32"; value: string };
  fragments: Array<Uint8Array | undefined>;
  receivedCount: number;
  decodedBytes: number;
  firstSeenAt: number;
}

interface SettledFrame {
  id: string;
  ordinal: number;
}

const COMPLETE_KEYS = new Set([
  "wireVersion",
  "kind",
  "deliveryKind",
  "logicalFrameId",
  "logicalFrameOrdinal",
  "topic",
  "subscriptionId",
  "frame",
]);

const FRAGMENT_KEYS = new Set([
  "wireVersion",
  "kind",
  "deliveryKind",
  "logicalFrameId",
  "logicalFrameOrdinal",
  "topic",
  "subscriptionId",
  "fragmentIndex",
  "fragmentCount",
  "logicalBytes",
  "checksum",
  "dataBase64",
]);

const CHECKSUM_KEYS = new Set(["algorithm", "value"]);

function deliveryKindOf(value: unknown): TopicFrameDeliveryKind | null {
  return value === "initial" || value === "online" || value === "recovery" ? value : null;
}

function routeKey(source: Pick<FrameIdentity, "topic" | "subscriptionId">): string {
  return `${source.topic}\0${source.subscriptionId}`;
}

function hasOnlyKeys(value: object, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function hasFragmentFields(
  wire: TopicWireFrameCandidate,
): wire is TopicWireFrameCandidate & FragmentFields {
  if (
    wire.kind !== "fragment" ||
    !hasOnlyKeys(wire, FRAGMENT_KEYS) ||
    typeof wire.fragmentIndex !== "number" ||
    typeof wire.fragmentCount !== "number" ||
    typeof wire.logicalBytes !== "number" ||
    typeof wire.dataBase64 !== "string"
  ) {
    return false;
  }
  const checksum = wire.checksum;
  return (
    typeof checksum === "object" &&
    checksum !== null &&
    !Array.isArray(checksum) &&
    hasOnlyKeys(checksum, CHECKSUM_KEYS) &&
    "algorithm" in checksum &&
    typeof checksum.algorithm === "string" &&
    "value" in checksum &&
    typeof checksum.value === "string"
  );
}

function matchesEnvelope(value: unknown, source: FrameIdentity): boolean {
  if (typeof value !== "object" || value === null) return false;
  const frame = value as { topic?: unknown; subscriptionId?: unknown };
  return frame.topic === source.topic && frame.subscriptionId === source.subscriptionId;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function boundedOption(value: number | undefined, maximum: number, name: string): number {
  const requested = value ?? maximum;
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
  return Math.min(Math.floor(requested), maximum);
}

function faultEvent<F>(source: FrameIdentity, suffix: string): TopicWireAssemblyEvent<F> {
  const deliveryKind = deliveryKindOf(source.deliveryKind);
  return {
    kind: "fault",
    fault: {
      ...(deliveryKind === null ? {} : { deliveryKind }),
      reasonCode: `proto.${suffix}`,
      logicalFrameId: source.logicalFrameId,
      logicalFrameOrdinal: source.logicalFrameOrdinal,
      topic: source.topic,
      subscriptionId: source.subscriptionId,
    },
  };
}

export class TopicWireFrameAssembler<F> {
  private readonly maxAssemblyBytes: number;
  private readonly maxFragments: number;
  private readonly maxConcurrentAssemblies: number;
  private readonly maxStagedDecodedBytes: number;
  private readonly timeoutMs: number;
  private readonly maxPhysicalFrameBytes: number;
  private readonly assemblies = new Map<string, Assembly>();
  private readonly settled = new Map<string, SettledFrame>();
  private stagedDecodedBytes = 0;

  constructor(
    private readonly frameSchema: z.ZodType<F>,
    options: TopicWireFrameAssemblerOptions = {},
  ) {
    this.maxAssemblyBytes = boundedOption(
      options.maxAssemblyBytes,
      PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxBytes,
      "maxAssemblyBytes",
    );
    this.maxFragments = boundedOption(
      options.maxFragments,
      PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxFragments,
      "maxFragments",
    );
    this.maxConcurrentAssemblies = boundedOption(
      options.maxConcurrentAssemblies,
      PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxConcurrent,
      "maxConcurrentAssemblies",
    );
    this.maxStagedDecodedBytes = boundedOption(
      options.maxStagedDecodedBytes,
      PROTOCOL_V4_LIMITS.logicalFrameAssemblyMaxStagedBytes,
      "maxStagedDecodedBytes",
    );
    this.timeoutMs = boundedOption(
      options.timeoutMs,
      PROTOCOL_V4_LIMITS.logicalFrameAssemblyTimeoutMs,
      "timeoutMs",
    );
    this.maxPhysicalFrameBytes = boundedOption(
      options.maxPhysicalFrameBytes,
      PROTOCOL_V4_LIMITS.maxFrameBytes,
      "maxPhysicalFrameBytes",
    );
  }

  accept(wire: TopicWireFrameCandidate, now = Date.now()): TopicWireAssemblyEvent<F>[] {
    const events = this.expire(now);
    const key = routeKey(wire);
    if (!Number.isSafeInteger(wire.logicalFrameOrdinal) || wire.logicalFrameOrdinal < 1) {
      events.push(faultEvent(wire, "frameAssemblyMetadataMismatch"));
      return events;
    }

    const settled = this.settled.get(key);
    if (settled) {
      if (wire.logicalFrameOrdinal < settled.ordinal) return events;
      if (wire.logicalFrameOrdinal === settled.ordinal) {
        if (wire.logicalFrameId !== settled.id) {
          events.push(faultEvent(wire, "frameAssemblyOrdinalConflict"));
        }
        return events;
      }
    }

    const deliveryKind = deliveryKindOf(wire.deliveryKind);
    if (deliveryKind === "recovery") {
      for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        if (
          event?.kind === "fault" &&
          event.fault.topic === wire.topic &&
          event.fault.subscriptionId === wire.subscriptionId &&
          event.fault.logicalFrameOrdinal < wire.logicalFrameOrdinal
        ) {
          events.splice(index, 1);
        }
      }
    }

    const active = this.assemblies.get(key);
    if (active) {
      if (wire.logicalFrameOrdinal < active.logicalFrameOrdinal) return events;
      if (wire.logicalFrameOrdinal === active.logicalFrameOrdinal) {
        if (wire.logicalFrameId !== active.logicalFrameId) {
          this.release(active);
          this.settle(active);
          events.push(faultEvent(wire, "frameAssemblyOrdinalConflict"));
          return events;
        }
      } else {
        this.release(active);
        this.settle(active);
        if (deliveryKind !== "recovery") {
          events.push(faultEvent(active, "frameAssemblySuperseded"));
        }
      }
    }

    if (deliveryKind === null) {
      this.releaseAndSettle(wire);
      events.push(faultEvent(wire, "frameAssemblyMetadataMismatch"));
      return events;
    }

    if (wire.kind === "complete") {
      return this.acceptComplete(wire, deliveryKind, events);
    }
    return this.acceptFragment(wire, deliveryKind, now, events);
  }

  expire(now = Date.now()): TopicWireAssemblyEvent<F>[] {
    const events: TopicWireAssemblyEvent<F>[] = [];
    for (const assembly of this.assemblies.values()) {
      if (now - assembly.firstSeenAt < this.timeoutMs) continue;
      this.release(assembly);
      this.settle(assembly);
      events.push(faultEvent(assembly, "frameAssemblyTimedOut"));
    }
    return events;
  }

  discard(topic: string, subscriptionId: string): void {
    const key = routeKey({ topic, subscriptionId });
    const active = this.assemblies.get(key);
    if (active) this.release(active);
    this.settled.delete(key);
  }

  abort(topic: string, subscriptionId: string): void {
    const active = this.assemblies.get(routeKey({ topic, subscriptionId }));
    if (!active) return;
    this.release(active);
    this.settle(active);
  }

  clear(): void {
    this.assemblies.clear();
    this.settled.clear();
    this.stagedDecodedBytes = 0;
  }

  getStats(): { assemblies: number; stagedDecodedBytes: number } {
    return { assemblies: this.assemblies.size, stagedDecodedBytes: this.stagedDecodedBytes };
  }

  get nextExpiryAt(): number | null {
    let next: number | null = null;
    for (const assembly of this.assemblies.values()) {
      const expiry = assembly.firstSeenAt + this.timeoutMs;
      if (next === null || expiry < next) next = expiry;
    }
    return next;
  }

  private acceptComplete(
    wire: TopicWireFrameCandidate & { kind: "complete" },
    deliveryKind: TopicFrameDeliveryKind,
    events: TopicWireAssemblyEvent<F>[],
  ): TopicWireAssemblyEvent<F>[] {
    if (!hasOnlyKeys(wire, COMPLETE_KEYS) || !Object.prototype.hasOwnProperty.call(wire, "frame")) {
      this.releaseAndSettle(wire);
      events.push(faultEvent(wire, "frameAssemblyMetadataMismatch"));
      return events;
    }
    if (measureTopicNotificationEnvelopeBytes(wire).maxBytes > this.maxPhysicalFrameBytes) {
      this.releaseAndSettle(wire);
      events.push(faultEvent(wire, "frameEnvelopeTooLarge"));
      return events;
    }
    const active = this.assemblies.get(routeKey(wire));
    if (active) {
      this.release(active);
      this.settle(active);
      events.push(faultEvent(active, "frameAssemblyMetadataMismatch"));
      return events;
    }
    const logicalBytes = new TextEncoder().encode(JSON.stringify(wire.frame)).byteLength;
    if (logicalBytes > this.maxAssemblyBytes) {
      this.settle(wire);
      events.push(faultEvent(wire, "frameAssemblyTooLarge"));
      return events;
    }
    if (!matchesEnvelope(wire.frame, wire)) {
      this.settle(wire);
      events.push(faultEvent(wire, "frameAssemblyMetadataMismatch"));
      return events;
    }
    const parsed = this.frameSchema.safeParse(wire.frame);
    this.settle(wire);
    if (!parsed.success) {
      events.push(faultEvent(wire, "frameAssemblyInvalidPayload"));
    } else {
      events.push({ kind: "complete", frame: parsed.data, deliveryKind });
    }
    return events;
  }

  private acceptFragment(
    wire: TopicWireFrameCandidate,
    deliveryKind: TopicFrameDeliveryKind,
    now: number,
    events: TopicWireAssemblyEvent<F>[],
  ): TopicWireAssemblyEvent<F>[] {
    if (!hasFragmentFields(wire)) {
      this.releaseAndSettle(wire);
      events.push(faultEvent(wire, "frameAssemblyMetadataMismatch"));
      return events;
    }
    if (measureTopicNotificationEnvelopeBytes(wire).maxBytes > this.maxPhysicalFrameBytes) {
      this.releaseAndSettle(wire);
      events.push(faultEvent(wire, "frameEnvelopeTooLarge"));
      return events;
    }
    if (wire.fragmentCount > this.maxFragments) {
      this.releaseAndSettle(wire);
      events.push(faultEvent(wire, "frameFragmentCountExceeded"));
      return events;
    }
    if (wire.logicalBytes > this.maxAssemblyBytes) {
      this.releaseAndSettle(wire);
      events.push(faultEvent(wire, "frameAssemblyTooLarge"));
      return events;
    }
    if (
      !Number.isInteger(wire.fragmentCount) ||
      wire.fragmentCount < 1 ||
      !Number.isInteger(wire.fragmentIndex) ||
      wire.fragmentIndex < 0 ||
      wire.fragmentIndex >= wire.fragmentCount ||
      !Number.isInteger(wire.logicalBytes) ||
      wire.logicalBytes < 1 ||
      wire.fragmentCount > wire.logicalBytes ||
      wire.checksum.algorithm !== "crc32" ||
      !/^[0-9a-f]{8}$/u.test(wire.checksum.value)
    ) {
      this.releaseAndSettle(wire);
      events.push(faultEvent(wire, "frameAssemblyMetadataMismatch"));
      return events;
    }
    const decoded = decodeWireBase64(wire.dataBase64);
    if (!decoded) {
      this.releaseAndSettle(wire);
      events.push(faultEvent(wire, "frameAssemblyInvalidBase64"));
      return events;
    }

    const key = routeKey(wire);
    let assembly = this.assemblies.get(key);
    if (assembly) {
      if (
        assembly.fragmentCount !== wire.fragmentCount ||
        assembly.deliveryKind !== deliveryKind ||
        assembly.logicalBytes !== wire.logicalBytes ||
        assembly.checksum.algorithm !== wire.checksum.algorithm ||
        assembly.checksum.value !== wire.checksum.value
      ) {
        this.release(assembly);
        this.settle(assembly);
        events.push(faultEvent(wire, "frameAssemblyMetadataMismatch"));
        return events;
      }
    } else {
      if (this.assemblies.size >= this.maxConcurrentAssemblies) {
        this.settle(wire);
        events.push(faultEvent(wire, "frameAssemblyConcurrentLimit"));
        return events;
      }
      if (this.stagedDecodedBytes + decoded.byteLength > this.maxStagedDecodedBytes) {
        this.settle(wire);
        events.push(faultEvent(wire, "frameAssemblyBudgetExceeded"));
        return events;
      }
      assembly = {
        deliveryKind,
        logicalFrameId: wire.logicalFrameId,
        logicalFrameOrdinal: wire.logicalFrameOrdinal,
        topic: wire.topic,
        subscriptionId: wire.subscriptionId,
        fragmentCount: wire.fragmentCount,
        logicalBytes: wire.logicalBytes,
        checksum: { algorithm: "crc32", value: wire.checksum.value },
        fragments: Array.from(
          { length: wire.fragmentCount },
          (): Uint8Array | undefined => undefined,
        ),
        receivedCount: 0,
        decodedBytes: 0,
        firstSeenAt: now,
      };
      this.assemblies.set(key, assembly);
    }

    const previous = assembly.fragments[wire.fragmentIndex];
    if (previous) {
      if (!sameBytes(previous, decoded)) {
        this.release(assembly);
        this.settle(assembly);
        events.push(faultEvent(wire, "frameAssemblyFragmentConflict"));
      }
      return events;
    }
    if (this.stagedDecodedBytes + decoded.byteLength > this.maxStagedDecodedBytes) {
      this.release(assembly);
      this.settle(assembly);
      events.push(faultEvent(wire, "frameAssemblyBudgetExceeded"));
      return events;
    }
    if (assembly.decodedBytes + decoded.byteLength > assembly.logicalBytes) {
      this.release(assembly);
      this.settle(assembly);
      events.push(faultEvent(wire, "frameAssemblyLengthMismatch"));
      return events;
    }
    assembly.fragments[wire.fragmentIndex] = decoded;
    assembly.receivedCount += 1;
    assembly.decodedBytes += decoded.byteLength;
    this.stagedDecodedBytes += decoded.byteLength;
    if (assembly.receivedCount < assembly.fragmentCount) return events;

    this.release(assembly);
    return this.completeAssembly(assembly, events);
  }

  private completeAssembly(
    assembly: Assembly,
    events: TopicWireAssemblyEvent<F>[],
  ): TopicWireAssemblyEvent<F>[] {
    if (assembly.decodedBytes !== assembly.logicalBytes) {
      this.settle(assembly);
      events.push(faultEvent(assembly, "frameAssemblyLengthMismatch"));
      return events;
    }
    const bytes = new Uint8Array(assembly.decodedBytes);
    let offset = 0;
    for (const fragment of assembly.fragments) {
      if (!fragment) {
        this.settle(assembly);
        events.push(faultEvent(assembly, "frameAssemblyLengthMismatch"));
        return events;
      }
      bytes.set(fragment, offset);
      offset += fragment.byteLength;
    }
    if (crc32WireBytes(bytes) !== assembly.checksum.value) {
      this.settle(assembly);
      events.push(faultEvent(assembly, "frameAssemblyChecksumMismatch"));
      return events;
    }
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      this.settle(assembly);
      events.push(faultEvent(assembly, "frameAssemblyInvalidUtf8"));
      return events;
    }
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      this.settle(assembly);
      events.push(faultEvent(assembly, "frameAssemblyInvalidJson"));
      return events;
    }
    if (!matchesEnvelope(value, assembly)) {
      this.settle(assembly);
      events.push(faultEvent(assembly, "frameAssemblyMetadataMismatch"));
      return events;
    }
    const parsed = this.frameSchema.safeParse(value);
    this.settle(assembly);
    if (!parsed.success) {
      events.push(faultEvent(assembly, "frameAssemblyInvalidPayload"));
    } else {
      events.push({ kind: "complete", frame: parsed.data, deliveryKind: assembly.deliveryKind });
    }
    return events;
  }

  private release(assembly: Assembly): void {
    const key = routeKey(assembly);
    if (this.assemblies.get(key) !== assembly) return;
    this.assemblies.delete(key);
    this.stagedDecodedBytes -= assembly.decodedBytes;
  }

  private settle(source: FrameIdentity): void {
    const key = routeKey(source);
    const previous = this.settled.get(key);
    if (previous && previous.ordinal > source.logicalFrameOrdinal) return;
    this.settled.set(key, { id: source.logicalFrameId, ordinal: source.logicalFrameOrdinal });
  }

  private releaseAndSettle(source: FrameIdentity): void {
    const active = this.assemblies.get(routeKey(source));
    if (
      active &&
      active.logicalFrameId === source.logicalFrameId &&
      active.logicalFrameOrdinal === source.logicalFrameOrdinal
    ) {
      this.release(active);
    }
    this.settle(source);
  }
}
