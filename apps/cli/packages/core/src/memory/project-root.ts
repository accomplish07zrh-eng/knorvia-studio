// SPDX-License-Identifier: Apache-2.0
// 项目记忆根：把一个工作区映射到 `memories/projects/<slug>-<hash>/memory`。
//
// 实现已移到 `@knorvia/shared`（见该包的 `project-memory-root.ts`）——
// 那里只做路径与哈希计算，不依赖内部模块，而调用方横跨运行时与存储层。
// 这里保留转发，让现有 `@knorvia/core` 的消费方无需同时改动。

export { resolveProjectMemoryRoot, type ProjectMemoryRootInput } from "@knorvia/shared";
