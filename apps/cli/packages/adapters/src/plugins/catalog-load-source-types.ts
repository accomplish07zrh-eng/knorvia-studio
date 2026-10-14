// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors
// 市场源租约形状：由 catalog-load-source.ts 引入（MarketplaceSourceLease 由其实现文件原样再导出，公开面不变）。
// 字段说明（字段名是契约）：manifest 已解码的市场清单；sourceRoot 源根目录（文件/目录源才有）；
// cleanup 释放暂存资源的回调（下载型源才有）。

import type { PluginMarketplaceManifest } from "./catalog-types.js";

export interface MarketplaceSourceLease {
  manifest: PluginMarketplaceManifest;
  sourceRoot?: string;
  cleanup?: () => Promise<void>;
}
