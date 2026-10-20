// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
//
// 市场与安装记录的唯一写入面。所有路径都由本模块给出，调用方不要自己拼。
// 记录文件是原子替换的产物：读取先走崩溃恢复拿到可见版本，解析失败按「未初始化」处理；
// 写入按路径串行化——同一路径同时只允许一次写入，其余排队，避免交错覆盖。

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { atomicBusyError } from "./atomic-protocol.js";
import { recoverAtomicTargetSync, writeFileAtomically } from "./atomic-directory.js";
import { writeFileAtomicallySync } from "./atomic-file.js";
import {
  decodeInstalledPluginRecords,
  decodeKnownMarketplaceRecords,
  encodeInstalledPluginRecords,
  encodeKnownMarketplaceRecords,
} from "./catalog-records.js";
import type { InstalledPluginRecord, KnownMarketplaceRecord } from "./catalog-types.js";
import { sanitizePluginId } from "./helpers.js";

/** 两条授权记录的文件名、所在子目录与编解码器。 */
const AUTHORITY = {
  known: {
    file: "known_marketplaces.json",
    encode: encodeKnownMarketplaceRecords,
  },
  installed: {
    file: "installed_plugins.json",
    encode: encodeInstalledPluginRecords,
  },
} as const;

/** 安装缓存的三层子目录名；市场、插件名与版本依次落在这三层下。 */
const CACHE_DIRECTORY = "cache";
const MARKETPLACE_DIRECTORY = "marketplaces";
const DATA_DIRECTORY = "data";

/** 同一路径的写入票据：排队中的下一次写入，以及正在写的那一次。 */
const queued = new Map<string, Promise<void>>();
const inFlight = new Set<string>();

/**
 * 所有记录与目录路径的统一构造：根目录 + 若干段，段位按需过标识清理。
 * 清理与否由调用方决定（记录文件名不需清理，市场/插件/版本标识需要）。
 */
function pathUnder(storageRoot: string, segments: readonly string[], sanitize: boolean): string {
  const parts = sanitize ? segments.map((segment) => sanitizePluginId(segment)) : segments;
  return resolve(storageRoot, ...parts);
}

/** 市场清单记录文件的路径。 */
export function knownAuthorityPath(storageRoot: string): string {
  return pathUnder(storageRoot, [AUTHORITY.known.file], false);
}

/** 已安装插件记录文件的路径。 */
export function installedAuthorityPath(storageRoot: string): string {
  return pathUnder(storageRoot, [AUTHORITY.installed.file], false);
}

/** 某个市场的本地目录。 */
export function marketplaceDirectory(storageRoot: string, id: string): string {
  return pathUnder(storageRoot, [MARKETPLACE_DIRECTORY, id], true);
}

/** 缓存目录的三段坐标：市场、插件名、版本（依次落下三层）。 */
export type CacheCoordinates = readonly [marketplace: string, name: string, version: string];

/**
 * 某个插件版本的缓存目录：市场 / 插件名 / 版本，三段都过标识清理后再拼接。
 * 坐标用元组传入，调用点不必逐个列位置参数。
 */
export function pluginCacheDirectory(storageRoot: string, coordinates: CacheCoordinates): string {
  return pathUnder(storageRoot, [CACHE_DIRECTORY, ...coordinates], true);
}

/** 某个插件的私有数据目录。 */
export function getPluginDataDir(storageRoot: string, /* 插件标识 */ pluginId: string): string {
  return pathUnder(storageRoot, [DATA_DIRECTORY, pluginId], true);
}

/**
 * 读一条授权记录。
 * 崩溃恢复的失败要向上抛（它意味着状态完整性有问题）；只有 JSON 解析失败才按
 * 「还没初始化」返回 undefined，这是历史空态的既定行为。
 */
function readAuthority(path: string): unknown {
  const visible = recoverAtomicTargetSync(path);
  try {
    return JSON.parse(readFileSync(visible, "utf8"));
  } catch {
    return undefined;
  }
}

/** 读市场清单记录；文件缺失或内容不可解析时返回空数组。 */
export function loadKnownMarketplacesSync(storageRoot: string): KnownMarketplaceRecord[] {
  return decodeKnownMarketplaceRecords(readAuthority(knownAuthorityPath(storageRoot)));
}

/** 读已安装插件记录；文件缺失或内容不可解析时返回空数组。 */
export function listInstalledPluginRecords(storageRoot: string): InstalledPluginRecord[] {
  return decodeInstalledPluginRecords(readAuthority(installedAuthorityPath(storageRoot)));
}

/** 一条已安装记录对应的插件根：先走恢复拿到可见目录。 */
export function resolveInstalledPluginRoot(
  _storageRoot: string,
  record: InstalledPluginRecord,
): string {
  return recoverAtomicTargetSync(record.installPath);
}

/**
 * 按路径串行化一次写入。票据进入队列后等待前一次完成；无论成功失败都要
 * 清掉自己的票据并放行下一位，否则队列会永久卡住。
 */
async function serializeAuthority<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const predecessor = queued.get(path) ?? Promise.resolve();
  let release!: () => void;
  const ticket = new Promise<void>((done) => {
    release = done;
  });
  queued.set(path, ticket);
  // 收尾动作只写一次：成功与失败走同一条出口，避免两处维护。
  const settle = (): void => {
    inFlight.delete(path);
    if (queued.get(path) === ticket) queued.delete(path);
    release();
  };
  await predecessor;
  inFlight.add(path);
  let outcome: T;
  try {
    outcome = await operation();
  } catch (failure) {
    settle();
    throw failure;
  }
  settle();
  return outcome;
}

/** 变更结果：新记录、返回值，以及是否需要落盘（默认落盘）。 */
type RecordChange<T, R> = {
  records: R[];
  result: T;
  write?: boolean;
};

/** 市场清单记录的读写事务。 */
export async function changeKnownRecords<T>(
  storageRoot: /* 市场数据根目录 */ string,
  edit: (records: KnownMarketplaceRecord[]) => RecordChange<T, KnownMarketplaceRecord>,
): Promise<T> {
  const path = knownAuthorityPath(storageRoot);
  return serializeAuthority(path, async () => {
    const change = edit(loadKnownMarketplacesSync(storageRoot));
    if (change.write === false) return change.result;
    await writeFileAtomically(path, AUTHORITY.known.encode(change.records));
    return change.result;
  });
}

/** 已安装插件记录的读写事务。 */
export async function changeInstalledRecords<T>(
  storageRoot: string,
  edit: (records: InstalledPluginRecord[]) => RecordChange<T, InstalledPluginRecord>,
): Promise<T> {
  const path = installedAuthorityPath(storageRoot);
  return serializeAuthority(path, async () => {
    const change = edit(listInstalledPluginRecords(storageRoot));
    if (change.write === false) return change.result;
    await writeFileAtomically(path, AUTHORITY.installed.encode(change.records));
    return change.result;
  });
}

/**
 * 市场清单记录的同步变更。已有异步写入排队或进行中时直接报忙，
 * 避免同步路径与异步路径互相覆盖。返回同一个数组引用表示「无需落盘」。
 */
export function changeKnownRecordsSync(
  storageRoot: string,
  edit: (records: KnownMarketplaceRecord[]) => KnownMarketplaceRecord[],
): KnownMarketplaceRecord[] {
  const path = knownAuthorityPath(storageRoot);
  if (inFlight.has(path) || queued.has(path)) throw atomicBusyError(path);
  const previous = loadKnownMarketplacesSync(storageRoot);
  const next = edit(previous);
  if (next !== previous) writeFileAtomicallySync(path, AUTHORITY.known.encode(next));
  return next;
}
