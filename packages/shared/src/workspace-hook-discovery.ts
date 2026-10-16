// SPDX-License-Identifier: Apache-2.0

// 发现入口只汇出配置与摘要。写入和审阅裁决走各自的包路径，避免第二条暴露面。
export * from "./workspace-hook-config.js";
export * from "./workspace-hook-digest.js";
