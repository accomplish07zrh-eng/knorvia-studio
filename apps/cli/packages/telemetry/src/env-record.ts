// SPDX-License-Identifier: Apache-2.0
// 环境记录：一组「键 → 字符串或未设置」的只读视图。
//
// 本包不读 process.env —— 环境由调用方（CLI 入口）传入，便于测试构造任意组合，
// 也避免遥测模块在 import 期就依赖进程状态。
export type EnvRecord = Readonly<Record<string, string | undefined>>;
