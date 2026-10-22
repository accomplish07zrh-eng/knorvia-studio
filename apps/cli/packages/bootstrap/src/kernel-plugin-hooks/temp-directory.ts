// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 临时目录端口：Hook 执行器在构造 stdin 时需要一个一次性的工作目录（B1.2），
// 并在 `cleanup()` 时递归删除它（B1.5，且可重复调用不抛错）。
//
// 为什么本包自己定义接口、而不是用 `FileSystemPort`：
//   ① 「临时目录」是本包的专属需求，不是通用文件系统能力；
//      塞进通用端口会让所有实现（含 device/fs 的封闭契约测试）都要跟着改。
//   ② 本包只需要两个方法，用通用端口会引入大量无关能力。
//   ③ 接口定义在本包内，真实实现由组合根注入 → 测试可以注入内存替身。
//
// ⚠️ 与 `adapters/src/fs/temp-directory.ts` 的关系：
//   那个文件提供 `createNodeTempDirectoryPort()` 的**真实实现**（用 node:fs 的 mkdtemp/rm）。
//   本文件只定义**接口形状**，保证本包不直接依赖 `node:fs`。
import type { TempDirectoryPort } from "@knorvia/adapters";

/**
 * 本包依赖的临时目录能力。
 *
 * 结构与 `@knorvia/adapters` 的 `TempDirectoryPort` 保持一致 ——
 * 这样组合根可以直接把 adapter 的实例传进来，不需要写转换层。
 * 而本包**只依赖这个类型**，不 import 它的实现文件。
 */
export type HookTempDirectoryPort = TempDirectoryPort;
