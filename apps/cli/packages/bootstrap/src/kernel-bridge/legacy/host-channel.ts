// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// kernel-bridge-legacy：把反向请求通道以窄接口交给后续包。
//
// 为什么需要本文件（2026-10-20，Lead 裁决方案 A）：
// 合同 interface.md §四 冻结了 `LegacyHostChannel`，但 #230 交付时它的唯一使用者是本包自己
// （`runtime-preferences.ts` 发 `session/requestRuntimePreferences`），因此只冻结了类型、
// 没有实现。`kernel-plugin-credentials` 作为**调用方**要发
// `interaction/requestProviderRuntimeHeaders` 时，才发现没有任何公开路径能拿到通道：
// 真正的通道是 `HostRequestBook`，而它是 `LegacyBridge` 的 `private` 成员。
//
// 设计取舍：
//   1. **只暴露窄接口**。`HostRequestBook` 还有 `setChannel` / `settleFromClient` / `dispose`
//      等管理方法；直接交出去等于让调用方能改通道状态、能伪造应答结算。这里只交出
//      `request` / `notify` 两个函数，管理面仍归桥唯一所有。
//   2. **未 attach 时返回 undefined**，不抛错。与桥内部「未 attach 时反向请求按无客户端
//      失败」的语义一致，调用方用 `channel?` 判断即可。
//   3. **不缓存、不复制 pending 表**：`request` 直接转给桥的唯一 `HostRequestBook`，
//      所以 `server-<n>` id 计数、超时、取消、重连语义全都不变（单一所有者）。

import type { LegacyHostChannel, LegacyHostRequestOptions } from "./types.js";
import type { HostRequestBook } from "./host-request-book.js";

/** 写一行的最小传输面（与 `notifications.ts` 的同名概念一致：桥持有 stdout）。 */
export interface HostChannelSink {
  write(message: Readonly<Record<string, unknown>>): void;
}

/**
 * 两个方法各自的类型直接从冻结接口上取。
 *
 * 为什么用 `LegacyHostChannel["request"]` 而不是在这里重抄签名：签名已在 `types.ts` 定义过一次；
 * 重抄会出现第二份「事实」——冻结面改了而这里没跟上时不会报错，而且两段文本会高度雷同。
 */
type ReverseRequestFn = LegacyHostChannel["request"];
type HostNotifyFn = LegacyHostChannel["notify"];

/**
 * 用桥的唯一反向请求簿建一个窄通道。
 *
 * @param book 桥持有的唯一 `HostRequestBook`（不复制、不包装状态）
 * @param sink stdout 写入口；`undefined` 表示桥尚未 attach
 * @returns 窄通道；`sink` 缺席时返回 undefined（调用方据此判断「现在不能反问 Host」）
 */
export function createHostChannel(
  book: HostRequestBook,
  sink: HostChannelSink | undefined,
): LegacyHostChannel | undefined {
  // 未 attach：没有 stdout 可写，也就不可能发反向请求。返回 undefined 而不是抛错，
  // 让调用方用 `channel?` 表达「此刻没有宿主可问」。
  if (sink === undefined) return undefined;

  // 直接转给唯一簿：id 计数、超时/取消/无客户端与重发现语义全由它承担。
  // 这里不做任何二次包装——多一层包装就会让「谁在计数、谁在超时」出现第二种解释。
  const request: ReverseRequestFn = (call, args, shape, options) =>
    book.request(call, args, shape, (options ?? {}) as LegacyHostRequestOptions);

  // CLI→Host 通知（借方法名的那类，如 computer-use/operation-event）：不占请求 id。
  const notify: HostNotifyFn = (name, payload, trace) => {
    sink.write(
      trace === undefined
        ? { method: name, params: payload }
        : { method: name, params: payload, trace },
    );
  };

  return { request, notify };
}
