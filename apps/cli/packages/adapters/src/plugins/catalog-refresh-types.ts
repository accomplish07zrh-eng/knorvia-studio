// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
// 市场增删改入口形状：由 catalog-refresh.ts 引入（仅供实现文件导入，不新增公开面）。
// 字段说明（字段名是契约）：expectedId 期望的市场标识（与清单名不一致则拒绝）；
// signal 中止信号；source 市场来源；storageRoot 插件数据根目录；trustedId 可信市场标识
// （官方保留名仅允许可信来源持有）；marketplace 目标市场标识（缺席表示全部）。

import type { MarketplaceSource } from "./catalog-types.js";

export interface AddMarketplaceInput {
  expectedId?: string;
  signal?: AbortSignal;
  source: MarketplaceSource;
  storageRoot: string;
  trustedId?: string;
}

export interface EnsureMarketplaceManifestAvailableInput {
  marketplace: string;
  signal?: AbortSignal;
  storageRoot: string;
}

export interface UpdateMarketplaceInput {
  marketplace?: string;
  signal?: AbortSignal;
  storageRoot: string;
}

export interface RemoveMarketplaceInput {
  marketplace: string;
  storageRoot: string;
}
