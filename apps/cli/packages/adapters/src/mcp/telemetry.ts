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

export type {
  McpProcessTelemetryIdentity,
  McpTelemetryTracker,
  McpTrackedProcess,
} from "./telemetry-types.js";
export type { McpTelemetryIsolation, McpTelemetrySource } from "./telemetry-types.js";

import type {
  McpProcessTelemetryIdentity,
  McpTrackedProcess,
  McpTelemetryTracker,
} from "./telemetry-types.js";
import type { McpTelemetryIsolation, McpTelemetrySource } from "./telemetry-types.js";

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

/** 采样事件：内存总量按 scope 汇总，孤儿判定只看「无 owner 且超阈值」。 */
function memoryEvent(fields: {
  arch: McpTelemetryEvent["arch"];
  isolation: McpTelemetryIsolation;
  instanceId: string;
  mcpId: string;
  occurredAt: number;
  orphanSuspected: boolean;
  ownerSessionCount: number;
  platform: McpTelemetryEvent["platform"];
  rssKb: number;
  scope: "direct_process" | "process_tree";
  source: McpTelemetrySource;
  unownedSeconds: number;
}): McpTelemetryEvent {
  return {
    arch: fields.arch,
    kind: "memory",
    mcpId: fields.mcpId,
    mcpInstanceId: fields.instanceId,
    mcpIsolation: fields.isolation,
    mcpSource: fields.source,
    platform: fields.platform,
    occurredAt: fields.occurredAt,
    memoryKb: fields.rssKb,
    memoryScope: fields.scope,
    orphanSuspected: fields.orphanSuspected,
    ownerSessionCount: fields.ownerSessionCount,
    unownedSeconds: fields.unownedSeconds,
  };
}

/** 崩溃事件：uptime 用「发生时刻 - 启动时刻」计算，避免负值。 */
function crashEvent(fields: {
  arch: McpTelemetryEvent["arch"];
  affectedSessionCount: number;
  exitCode: number | null;
  instanceId: string;
  isolation: McpTelemetryIsolation;
  mcpId: string;
  occurredAt: number;
  platform: McpTelemetryEvent["platform"];
  signal: string | null;
  startedAt: number;
  source: McpTelemetrySource;
}): McpTelemetryEvent {
  return {
    affectedSessionCount: fields.affectedSessionCount,
    arch: fields.arch,
    exitCode: fields.exitCode,
    kind: "process_crash",
    mcpId: fields.mcpId,
    mcpInstanceId: fields.instanceId,
    mcpIsolation: fields.isolation,
    mcpSource: fields.source,
    occurredAt: fields.occurredAt,
    platform: fields.platform,
    signal: fields.signal,
    uptimeMs: Math.max(0, fields.occurredAt - fields.startedAt),
  };
}

/** 启动事件：实例 id 在调用方生成，本构造器只做投影。 */
function startEvent(fields: {
  arch: McpTelemetryEvent["arch"];
  instanceId: string;
  isolation: McpTelemetryIsolation;
  mcpId: string;
  occurredAt: number;
  platform: McpTelemetryEvent["platform"];
  source: McpTelemetrySource;
}): McpTelemetryEvent {
  return {
    arch: fields.arch,
    kind: "process_start",
    mcpId: fields.mcpId,
    mcpInstanceId: fields.instanceId,
    mcpIsolation: fields.isolation,
    mcpSource: fields.source,
    occurredAt: fields.occurredAt,
    platform: fields.platform,
  };
}

/** 会话启动事件：四个计数与会话 id 由调用方给出。 */
function startupEvent(fields: {
  arch: McpTelemetryEvent["arch"];
  configuredCount: number;
  connectedCount: number;
  failedCount: number;
  occurredAt: number;
  platform: McpTelemetryEvent["platform"];
  processCount: number;
  sessionId: string;
}): McpTelemetryEvent {
  return {
    arch: fields.arch,
    configuredCount: fields.configuredCount,
    connectedCount: fields.connectedCount,
    failedCount: fields.failedCount,
    kind: "session_startup",
    occurredAt: fields.occurredAt,
    platform: fields.platform,
    processCount: fields.processCount,
    sessionId: fields.sessionId,
  };
}

export function createMcpTelemetryTracker(
  options: CreateMcpTelemetryTrackerOptions,
): McpTelemetryTracker {
  const arch = options.arch ?? (process.arch as McpTelemetryEvent["arch"]);
  const now = options.now ?? Date.now;
  const platform = options.platform ?? (process.platform as McpTelemetryEvent["platform"]);
  const randomId = options.randomId ?? randomUUID;
  const registrations = new Map<string, Registration>();

  /** 进程采样入口：把当前注册表投影成资源进程列表（闭包依赖改为显式参数）。 */
  function buildProcesses(context: ProcessBuildContext): McpResourceProcess[] {
    const entries: McpResourceProcess[] = [];
    for (const registration of context.registrations.values()) {
      const capturedProcess = registration.process;
      if (!capturedProcess) continue;
      entries.push({
        instanceId: capturedProcess.instanceId,
        mcpId: registration.mcpId,
        pid: capturedProcess.pid,
        startedAt: capturedProcess.startedAt,
        isCurrent() {
          return (
            context.registrations.get(registration.connectionId) === registration &&
            registration.process === capturedProcess
          );
        },
        observed(tree, sampledAt, scope) {
          if (!tree) {
            if (registration.owners.size === 0) {
              registration.process = undefined;
              context.registrations.delete(registration.connectionId);
            }
            return;
          }
          const unownedMs =
            registration.owners.size === 0 && registration.unownedAt !== undefined
              ? Math.max(0, sampledAt - registration.unownedAt)
              : 0;
          context.emit(
            memoryEvent({
              arch: context.arch,
              instanceId: capturedProcess.instanceId,
              isolation: registration.isolation,
              mcpId: registration.mcpId,
              occurredAt: sampledAt,
              orphanSuspected: registration.owners.size === 0 && unownedMs > ORPHAN_THRESHOLD_MS,
              ownerSessionCount: ownerSessionCount(registration),
              platform: context.platform,
              rssKb: tree.reduce((sum, sample) => sum + sample.rssKb, 0),
              scope,
              source: registration.source,
              unownedSeconds: unownedMs / MILLISECONDS_PER_SECOND,
            }),
          );
        },
      });
    }
    return entries;
  }

  interface ProcessBuildContext {
    arch: McpTelemetryEvent["arch"];
    emit(event: McpTelemetryEvent): void;
    platform: McpTelemetryEvent["platform"];
    registrations: Map<string, Registration>;
  }
  function emit(event: McpTelemetryEvent): void {
    try {
      options.onEvent(event);
    } catch {
      // 只忽略同步通知失败；状态修改、字段投影和时钟仍在此边界之外。
    }
  }

  const sampler = createMcpResourceTelemetry({
    ...options,
    arch,
    platform,
    now,
    getProcesses: () => buildProcesses({ arch, emit, platform, registrations }),
  });

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
      emit(
        crashEvent({
          affectedSessionCount: ownerSessionCount(registration),
          arch,
          exitCode: input.exitCode,
          instanceId: current.instanceId,
          isolation: registration.isolation,
          mcpId: registration.mcpId,
          occurredAt,
          platform,
          signal: input.signal,
          source: registration.source,
          startedAt: current.startedAt,
        }),
      );
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
      emit(
        startEvent({
          arch,
          instanceId,
          isolation: registration.isolation,
          mcpId: registration.mcpId,
          occurredAt: startedAt,
          platform,
          source: registration.source,
        }),
      );
      return { mcpId: registration.mcpId, mcpInstanceId: instanceId };
    },
    recordSessionStartup(input) {
      emit(
        startupEvent({
          arch,
          configuredCount: input.configuredCount,
          connectedCount: input.connectedCount,
          failedCount: input.failedCount,
          occurredAt: now(),
          platform,
          processCount: input.processCount,
          sessionId: input.sessionId,
        }),
      );
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
