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

function ownerSessionCount(entry: Registration): number {
  const sessions = new Set<string>();
  for (const sessionId of entry.owners.values()) {
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

/** 跟踪器上下文：把注册表、发射器与时钟集中成一处，方法体因此可以放在模块级。 */
interface TrackerContext {
  arch: McpTelemetryEvent["arch"];
  publish(event: McpTelemetryEvent): void;
  idSalt: string;
  now(): number;
  platform: McpTelemetryEvent["platform"];
  randomId(): string;
  registry: Map<string, Registration>;
}

/** 统一取登记：找不到即跳过，消除各处重复的「get + 判空」序列。 */
function withRegistration(
  tracker: TrackerContext,
  connectionId: string,
  mutate: (entry: Registration) => void,
): void {
  const entry = tracker.registry.get(connectionId);
  if (!entry) return;
  mutate(entry);
}

/** 占用登记：记录 owner 与会话，并清掉「无人占用」起点。 */
function acquireOwner(
  tracker: TrackerContext,
  request: { connectionId: string; ownerId: string; sessionId?: string },
): void {
  withRegistration(tracker, request.connectionId, (entry) => {
    entry.owners.set(request.ownerId, request.sessionId);
    entry.unownedAt = undefined;
  });
}

/** 崩溃记录：清掉进程句柄后发射一次崩溃事件。 */
function recordCrashed(
  tracker: TrackerContext,
  request: { connectionId: string; exitCode: number | null; signal: string | null },
): void {
  const entry = tracker.registry.get(request.connectionId);
  const current = entry?.process;
  if (!entry || !current) return;
  entry.process = undefined;
  const occurredAt = tracker.now();
  tracker.publish(
    crashEvent({
      affectedSessionCount: ownerSessionCount(entry),
      arch: tracker.arch,
      exitCode: request.exitCode,
      instanceId: current.instanceId,
      isolation: entry.isolation,
      mcpId: entry.mcpId,
      occurredAt,
      platform: tracker.platform,
      signal: request.signal,
      source: entry.source,
      startedAt: current.startedAt,
    }),
  );
}

/** 进程关闭：无 owner 时顺带移除登记，避免留下空壳。 */
function recordClosed(tracker: TrackerContext, request: { connectionId: string }): void {
  withRegistration(tracker, request.connectionId, (entry) => {
    entry.process = undefined;
    if (entry.owners.size === 0) tracker.registry.delete(request.connectionId);
  });
}

/** 进程启动：校验 pid、生成实例 id、发射启动事件并回传遥测身份。 */
function recordStarted(
  tracker: TrackerContext,
  request: { connectionId: string; pid: number },
): McpProcessTelemetryIdentity | undefined {
  const entry = tracker.registry.get(request.connectionId);
  if (!entry) return undefined;
  const pid = request.pid;
  if (!Number.isInteger(pid) || pid <= 0) return undefined;
  const instanceId = tracker.randomId();
  const startedAt = tracker.now();
  entry.process = { instanceId, pid, startedAt };
  if (entry.owners.size === 0) entry.unownedAt ??= startedAt;
  tracker.publish(
    startEvent({
      arch: tracker.arch,
      instanceId,
      isolation: entry.isolation,
      mcpId: entry.mcpId,
      occurredAt: startedAt,
      platform: tracker.platform,
      source: entry.source,
    }),
  );
  return { mcpId: entry.mcpId, mcpInstanceId: instanceId };
}

/** 会话启动统计：四个计数与会话 id 原样透传。 */
function recordStartup(
  tracker: TrackerContext,
  request: {
    configuredCount: number;
    connectedCount: number;
    failedCount: number;
    processCount: number;
    sessionId: string;
  },
): void {
  tracker.publish(
    startupEvent({
      arch: tracker.arch,
      configuredCount: request.configuredCount,
      connectedCount: request.connectedCount,
      failedCount: request.failedCount,
      occurredAt: tracker.now(),
      platform: tracker.platform,
      processCount: request.processCount,
      sessionId: request.sessionId,
    }),
  );
}

/** 释放 owner：只有确实删掉了映射才更新无主起点。 */
function releaseOwnerRole(
  tracker: TrackerContext,
  request: { connectionId: string; ownerId: string },
): void {
  withRegistration(tracker, request.connectionId, (entry) => {
    if (!entry.owners.delete(request.ownerId)) return;
    if (entry.owners.size === 0) entry.unownedAt = tracker.now();
  });
}

/** 注册连接：来源缺省按服务名推断，mcpId 由服务名 + 来源 + 盐派生。 */
function registerConnection(
  tracker: TrackerContext,
  request: {
    connectionId: string;
    isolation: McpTelemetryIsolation;
    serverName: string;
    source?: McpTelemetrySource;
  },
): void {
  const source = request.source ?? defaultSource(request.serverName);
  const mcpId = connectionIdentity(request.serverName, source, tracker.idSalt);
  tracker.registry.set(request.connectionId, {
    connectionId: request.connectionId,
    isolation: request.isolation,
    mcpId,
    owners: new Map(),
    serverName: request.serverName,
    source,
  });
}

/** 注销连接：清空 owner；若已无进程句柄则直接移除登记。 */
function unregisterConnection(tracker: TrackerContext, request: { connectionId: string }): void {
  withRegistration(tracker, request.connectionId, (entry) => {
    entry.owners.clear();
    entry.unownedAt ??= tracker.now();
    if (!entry.process) tracker.registry.delete(request.connectionId);
  });
}

/** 进程清单：只列出仍持有进程句柄的连接，插件名按需解析。 */
function listProcesses(tracker: TrackerContext): McpTrackedProcess[] {
  const rows: McpTrackedProcess[] = [];
  for (const entry of tracker.registry.values()) {
    if (!entry.process) continue;
    const pluginName = resolvePluginName(entry.serverName);
    rows.push({
      mcpSource: entry.source,
      pid: entry.process.pid,
      ...(pluginName ? { pluginName } : {}),
      serverName: entry.serverName,
    });
  }
  return rows;
}

/** 采样构建上下文：注册表、发射器与时钟由调用方注入。 */
interface ProcessBuildContext {
  arch: McpTelemetryEvent["arch"];
  publish(event: McpTelemetryEvent): void;
  platform: McpTelemetryEvent["platform"];
  registry: Map<string, Registration>;
}

/** 进程采样入口：把当前注册表投影成资源进程列表。 */
function buildProcesses(tracker: ProcessBuildContext): McpResourceProcess[] {
  const entries: McpResourceProcess[] = [];
  for (const entry of tracker.registry.values()) {
    const capturedProcess = entry.process;
    if (!capturedProcess) continue;
    entries.push({
      instanceId: capturedProcess.instanceId,
      isCurrent() {
        return (
          tracker.registry.get(entry.connectionId) === entry && entry.process === capturedProcess
        );
      },
      mcpId: entry.mcpId,
      observed(tree, sampledAt, scope) {
        if (!tree) {
          if (entry.owners.size === 0) {
            entry.process = undefined;
            tracker.registry.delete(entry.connectionId);
          }
          return;
        }
        const unownedMs =
          entry.owners.size === 0 && entry.unownedAt !== undefined
            ? Math.max(0, sampledAt - entry.unownedAt)
            : 0;
        tracker.publish(
          memoryEvent({
            arch: tracker.arch,
            instanceId: capturedProcess.instanceId,
            isolation: entry.isolation,
            mcpId: entry.mcpId,
            occurredAt: sampledAt,
            orphanSuspected: entry.owners.size === 0 && unownedMs > ORPHAN_THRESHOLD_MS,
            ownerSessionCount: ownerSessionCount(entry),
            platform: tracker.platform,
            rssKb: tree.reduce((sum, sample) => sum + sample.rssKb, 0),
            scope,
            source: entry.source,
            unownedSeconds: unownedMs / MILLISECONDS_PER_SECOND,
          }),
        );
      },
      pid: capturedProcess.pid,
      startedAt: capturedProcess.startedAt,
    });
  }
  return entries;
}

export function createMcpTelemetryTracker(
  settings: CreateMcpTelemetryTrackerOptions,
): McpTelemetryTracker {
  const arch = settings.arch ?? (process.arch as McpTelemetryEvent["arch"]);
  const now = settings.now ?? Date.now;
  const platform = settings.platform ?? (process.platform as McpTelemetryEvent["platform"]);
  const randomId = settings.randomId ?? randomUUID;
  const registry = new Map<string, Registration>();

  const publish = (event: McpTelemetryEvent): void => {
    try {
      settings.onEvent(event);
    } catch {
      // 只忽略同步通知失败；状态修改、字段投影和时钟仍在此边界之外。
    }
  };

  const tracker: TrackerContext = {
    arch,
    publish,
    idSalt: settings.idSalt,
    now,
    platform,
    randomId,
    registry,
  };
  const sampler = createMcpResourceTelemetry({
    ...settings,
    arch,
    getProcesses: () => buildProcesses({ arch, publish, platform, registry }),
    now,
    platform,
  });

  return {
    acquireOwner: (request) => acquireOwner(tracker, request),
    listProcesses: () => listProcesses(tracker),
    recordProcessClosed: (request) => recordClosed(tracker, request),
    recordProcessCrashed: (request) => recordCrashed(tracker, request),
    recordProcessStarted: (request) => recordStarted(tracker, request),
    recordSessionStartup: (request) => recordStartup(tracker, request),
    registerConnection: (request) => registerConnection(tracker, request),
    releaseOwner: (request) => releaseOwnerRole(tracker, request),
    sampleNow: sampler.sampleNow,
    start: sampler.start,
    stop: sampler.stop,
    unregisterConnection: (request) => unregisterConnection(tracker, request),
  };
}
