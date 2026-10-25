// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors

import type { IDisposable } from "@knorvia/rpc";
import {
  createMemoryDiagnosticsRegistry,
  type MemoryDiagnosticsProvider,
  type MemoryDiagnosticsRegistry,
} from "@knorvia/shared";

/**
 * services 进程级的内存诊断计数器表。
 *
 * 单例必须留在本模块：agent / task / fileWatcher / terminal 四个服务都从这里取同一张表，
 * 各自去 new 一个的话，`collect()` 只能看到调用方自己那份，进程级汇总就永远缺项。
 */
export const memoryDiagnosticsRegistry: MemoryDiagnosticsRegistry =
  createMemoryDiagnosticsRegistry();

/**
 * 登记一组计数器，返回的句柄在服务释放时调用。
 *
 * `name` 是 key 前缀（`fileWatcher` + `open` 得到 `fileWatcher.open`），
 * 因此同进程内重名会覆盖先注册的那份，名字要按服务实例的归属来取。
 */
export function registerMemoryDiagnosticsProvider(
  name: string,
  provider: MemoryDiagnosticsProvider,
): IDisposable {
  return memoryDiagnosticsRegistry.register(name, provider);
}

/**
 * 汇总当前进程内所有已登记的计数器。
 *
 * 单个 provider 抛错或产出非有限值时，由注册表跳过该条目，其余照常返回；
 * 诊断代码本身不该把调用方带崩。
 */
export function collectServiceMemoryDiagnostics(): Record<string, number> {
  return memoryDiagnosticsRegistry.collect();
}
