// Copyright (c) Knorvia contributors
// SPDX-License-Identifier: MIT

import { createHmac, randomUUID } from "node:crypto";
import type { KnorviaMcpTelemetryEvent } from "@knorvia/shared";
import {
  createMcpResourceTelemetry,
  type McpResourceProcess,
  type McpResourceTelemetryOptions,
} from "./resource-telemetry.js";

type McpTelemetryEvent = KnorviaMcpTelemetryEvent;
type StartEvent = Extract<McpTelemetryEvent, { kind: "process_start" }>;
export type McpTelemetrySource = StartEvent["mcpSource"];
export type McpTelemetryIsolation = StartEvent["mcpIsolation"];

export interface McpProcessTelemetryIdentity {
  mcpId: string;
  mcpInstanceId: string;
}

export interface McpTrackedProcess {
  pid: number;
  serverName: string;
  mcpSource: McpTelemetrySource;
  pluginName?: string;
}

export interface McpTelemetryTracker {
  acquireOwner(input: { connectionId: string; ownerId: string; sessionId?: string }): void;
  recordSessionStartup(input: {
    configuredCount: number;
    connectedCount: number;
    failedCount: number;
    processCount: number;
    sessionId: string;
  }): void;
  recordProcessCrashed(input: {
    connectionId: string;
    exitCode: number | null;
    signal: string | null;
  }): void;
  recordProcessClosed(input: { connectionId: string }): void;
  recordProcessStarted(input: {
    connectionId: string;
    pid: number;
  }): McpProcessTelemetryIdentity | undefined;
  releaseOwner(input: { connectionId: string; ownerId: string }): void;
  registerConnection(input: {
    connectionId: string;
    isolation: McpTelemetryIsolation;
    serverName: string;
    source?: McpTelemetrySource;
  }): void;
  unregisterConnection(input: { connectionId: string }): void;
  listProcesses(): McpTrackedProcess[];
  sampleNow(): Promise<void>;
  start(): void;
  stop(): void;
}

interface CreateMcpTelemetryTrackerOptions {
  arch?: McpTelemetryEvent["arch"];
  idSalt: string;
  now?: () => number;
  onEvent(event: McpTelemetryEvent): void;
  platform?: McpTelemetryEvent["platform"];
  randomId?: () => string;
  onResourceSamples?: McpResourceTelemetryOptions["onResourceSamples"];
  processProbe?: McpResourceTelemetryOptions["processProbe"];
  logicalCpuCount?: number;
  totalMemoryGb?: number;
  timer?: McpResourceTelemetryOptions["timer"];
}

interface Registration {
  connectionId: string;
  isolation: McpTelemetryIsolation;
  mcpId: string;
  source: McpTelemetrySource;
  serverName: string;
  owners: Map<string, string | undefined>;
  process?: { instanceId: string; pid: number; startedAt: number };
  unownedAt?: number;
}

const PLUGIN_PREFIX = "plugin:";
const HASH_ID_LENGTH = 12;
const MILLISECONDS_PER_SECOND = 1000;
const ORPHAN_THRESHOLD_MS = 60_000;

function defaultSource(serverName: string): McpTelemetrySource {
  if (serverName === "node_repl") return "builtin";
  return serverName.startsWith(PLUGIN_PREFIX) ? "plugin" : "custom";
}

function connectionIdentity(serverName: string, source: McpTelemetrySource, salt: string): string {
  if (source !== "builtin") {
    const digest = createHmac("sha256", salt).update(serverName).digest("hex");
    return `${source}:${digest.slice(0, HASH_ID_LENGTH)}`;
  }
  const name = serverName.startsWith(PLUGIN_PREFIX)
    ? serverName.slice(PLUGIN_PREFIX.length)
    : serverName;
  const encoded = name.split(":").map((segment) =>
    Array.from(Buffer.from(segment), (byte) => {
      const character = String.fromCharCode(byte);
      return /^[A-Za-z0-9._~-]$/.test(character)
        ? character
        : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }).join(""),
  );
  return `builtin:${encoded.join(":")}`;
}

function ownerSessionCount(registration: Registration): number {
  const sessions = new Set<string>();
  for (const sessionId of registration.owners.values()) {
    if (sessionId !== undefined) sessions.add(sessionId);
  }
  return sessions.size;
}

export function resolvePluginName(serverName: string): string | undefined {
  if (!serverName.startsWith(PLUGIN_PREFIX)) return undefined;
  return serverName.slice(PLUGIN_PREFIX.length).split(":")[0]?.trim() || undefined;
}

export function createMcpTelemetryTracker(
  options: CreateMcpTelemetryTrackerOptions,
): McpTelemetryTracker {
  const arch = options.arch ?? (process.arch as McpTelemetryEvent["arch"]);
  const now = options.now ?? Date.now;
  const platform = options.platform ?? (process.platform as McpTelemetryEvent["platform"]);
  const randomId = options.randomId ?? randomUUID;
  const registrations = new Map<string, Registration>();

  function emit(event: McpTelemetryEvent): void {
    try {
      options.onEvent(event);
    } catch {
      // 只忽略同步通知失败；状态修改、字段投影和时钟仍在此边界之外。
    }
  }

  function getProcesses(): McpResourceProcess[] {
    const entries: McpResourceProcess[] = [];
    for (const registration of registrations.values()) {
      const capturedProcess = registration.process;
      if (!capturedProcess) continue;
      entries.push({
        instanceId: capturedProcess.instanceId,
        mcpId: registration.mcpId,
        pid: capturedProcess.pid,
        startedAt: capturedProcess.startedAt,
        isCurrent() {
          return (
            registrations.get(registration.connectionId) === registration &&
            registration.process === capturedProcess
          );
        },
        observed(tree, sampledAt, scope) {
          if (!tree) {
            if (registration.owners.size === 0) {
              registration.process = undefined;
              registrations.delete(registration.connectionId);
            }
            return;
          }
          const unownedMs =
            registration.owners.size === 0 && registration.unownedAt !== undefined
              ? Math.max(0, sampledAt - registration.unownedAt)
              : 0;
          emit({
            arch,
            kind: "memory",
            mcpId: registration.mcpId,
            mcpInstanceId: capturedProcess.instanceId,
            mcpIsolation: registration.isolation,
            mcpSource: registration.source,
            platform,
            occurredAt: sampledAt,
            memoryKb: tree.reduce((sum, sample) => sum + sample.rssKb, 0),
            memoryScope: scope,
            orphanSuspected: registration.owners.size === 0 && unownedMs > ORPHAN_THRESHOLD_MS,
            ownerSessionCount: ownerSessionCount(registration),
            unownedSeconds: unownedMs / MILLISECONDS_PER_SECOND,
          });
        },
      });
    }
    return entries;
  }

  const sampler = createMcpResourceTelemetry({ ...options, arch, platform, now, getProcesses });

  return {
    acquireOwner(input) {
      const registration = registrations.get(input.connectionId);
      if (!registration) return;
      registration.owners.set(input.ownerId, input.sessionId);
      registration.unownedAt = undefined;
    },
    recordProcessCrashed(input) {
      const registration = registrations.get(input.connectionId);
      const current = registration?.process;
      if (!registration || !current) return;
      registration.process = undefined;
      const occurredAt = now();
      emit({
        affectedSessionCount: ownerSessionCount(registration),
        arch,
        exitCode: input.exitCode,
        kind: "process_crash",
        mcpId: registration.mcpId,
        mcpInstanceId: current.instanceId,
        mcpIsolation: registration.isolation,
        mcpSource: registration.source,
        occurredAt,
        platform,
        signal: input.signal,
        uptimeMs: Math.max(0, occurredAt - current.startedAt),
      });
    },
    recordProcessClosed(input) {
      const registration = registrations.get(input.connectionId);
      if (!registration) return;
      registration.process = undefined;
      if (registration.owners.size === 0) registrations.delete(input.connectionId);
    },
    recordProcessStarted(input) {
      const registration = registrations.get(input.connectionId);
      if (!registration) return undefined;
      const pid = input.pid;
      if (!Number.isInteger(pid) || pid <= 0) return undefined;
      const instanceId = randomId();
      const startedAt = now();
      registration.process = { instanceId, pid, startedAt };
      if (registration.owners.size === 0) registration.unownedAt ??= startedAt;
      emit({
        arch,
        kind: "process_start",
        mcpId: registration.mcpId,
        mcpInstanceId: instanceId,
        mcpIsolation: registration.isolation,
        mcpSource: registration.source,
        occurredAt: startedAt,
        platform,
      });
      return { mcpId: registration.mcpId, mcpInstanceId: instanceId };
    },
    recordSessionStartup(input) {
      emit({
        arch,
        configuredCount: input.configuredCount,
        connectedCount: input.connectedCount,
        failedCount: input.failedCount,
        kind: "session_startup",
        occurredAt: now(),
        platform,
        processCount: input.processCount,
        sessionId: input.sessionId,
      });
    },
    releaseOwner(input) {
      const registration = registrations.get(input.connectionId);
      if (!registration || !registration.owners.delete(input.ownerId)) return;
      if (registration.owners.size === 0) registration.unownedAt = now();
    },
    registerConnection(input) {
      const source = input.source ?? defaultSource(input.serverName);
      const mcpId = connectionIdentity(input.serverName, source, options.idSalt);
      registrations.set(input.connectionId, {
        connectionId: input.connectionId,
        isolation: input.isolation,
        mcpId,
        source,
        serverName: input.serverName,
        owners: new Map(),
      });
    },
    unregisterConnection(input) {
      const registration = registrations.get(input.connectionId);
      if (!registration) return;
      registration.owners.clear();
      registration.unownedAt ??= now();
      if (!registration.process) registrations.delete(input.connectionId);
    },
    listProcesses() {
      const rows: McpTrackedProcess[] = [];
      for (const registration of registrations.values()) {
        if (!registration.process) continue;
        const pluginName = resolvePluginName(registration.serverName);
        rows.push({
          pid: registration.process.pid,
          serverName: registration.serverName,
          mcpSource: registration.source,
          ...(pluginName ? { pluginName } : {}),
        });
      }
      return rows;
    },
    sampleNow: sampler.sampleNow,
    start: sampler.start,
    stop: sampler.stop,
  };
}
