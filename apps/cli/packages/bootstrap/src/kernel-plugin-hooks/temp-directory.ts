// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Knorvia Studio contributors
//
// 临时目录端口：Hook 执行器在构造 stdin 时需要一个一次性的工作目录（B1.2），
// 里写 transcript.jsonl（B1.2），并在 `cleanup()` 时递归删除它（B1.5）。
//
// 为什么本包自己定义接口、而不是用 `FileSystemPort`：
//   ① 「临时目录」是本包的专属需求，不是通用文件系统能力；
//      塞进通用端口会让所有实现（含 device/fs 的封闭契约测试）都要跟着改。
//   ② 本包只需要三个方法，用通用端口会引入大量无关能力。
//   ③ 接口定义在本包内，真实实现由组合根注入 → 测试可以注入内存替身。
//
// ⚠️ 与 `@knorvia/adapters` 的 `TempDirectoryPort` 的关系：
//   那个提供**真实实现**（用 node:fs 的 mkdtemp / rm / writeFile）。
//   本文件只定义**本包需要的接口形状**，保证本包不直接依赖 `node:fs`。
//
// ⚠️ 为什么有 `writeTranscript` 而不是复用 `FileSystemPort.writeTextFile`：
//   transcript 必须写在**这个临时目录里**，而临时目录的生命周期由本端口拥有。
//   让「创建 / 写入 / 删除」同属一个端口，才能保证「写入的一定会被删掉」。
//   若拆到两个端口，调用方可能写了文件却忘了删目录。

/** 本包依赖的临时目录能力（创建 + 写入 + 递归删除）。 */
export interface HookTempDirectoryPort {
  /** 在系统临时目录（或指定父目录）下创建一个唯一命名目录，返回绝对路径。 */
  createTempDirectory(request: {
    readonly prefix: string;
    readonly parentDirectory?: string;
  }): Promise<{ readonly path: string }>;
  /** 向已创建的临时目录里写一个 UTF-8 文本文件（路径由调用方从 createTempDirectory 拼出）。 */
  writeTranscript(path: string, content: string): Promise<void>;
  /**
   * 递归删除目录树。
   *
   * `missingOk` 默认 true：`cleanup()` 可能被重复调用（如 finally 里再次清理），
   * 第二次删除不存在的目录不能抛错。
   */
  removeDirectory(request: {
    readonly path: string;
    readonly missingOk?: boolean;
  }): Promise<{ readonly removed: boolean }>;
}
