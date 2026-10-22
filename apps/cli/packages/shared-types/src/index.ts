// SPDX-License-Identifier: Apache-2.0
// 纯类型包：只有编译期事实，模块求值后运行期命名空间为空。

/** JSON 能表达的任意值；递归覆盖数组与对象两种容器。 */
export type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** 前台命令拿到的标准流与原始参数，由入口层构造后向下传递。 */
export type RunContext = {
  argv: string[];
  stderr: NodeJS.WriteStream;
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
};

/** `auto` 表示交给探测决定，其余两个值是可直接加载的目录键。 */
export type GlobalLocale = "auto" | "en-US" | "zh-CN";

/** 探测结果只会是具体目录，不会回到 `auto`。 */
export type GlobalDetectedLocale = Exclude<GlobalLocale, "auto">;

/**
 * 无头运行的回传形态。
 *
 * - `text`：只打印答案正文。
 * - `json`：该轮结束后输出一份汇总文档。
 * - `stream-json`：在汇总之外，把每个会话事件按行（NDJSON）边跑边写出，
 *   适合把 CLI 当子进程驱动、需要过程进度的调用方。
 */
export type GlobalOutputFormat = "text" | "json" | "stream-json";

/**
 * 全局选项。`force`/`json`/`noColor`/`verbose` 始终有值（默认 false），
 * 其余字段只在调用方显式给出时才出现。
 */
export type GlobalOptions = {
  force: boolean;
  json: boolean;
  noColor: boolean;
  verbose: boolean;
  browserExecutable?: string;
  browserUse?: "headless";
  detectedLocale?: GlobalDetectedLocale;
  locale?: GlobalLocale;
  memoryBench?: boolean;
  outputFormat?: GlobalOutputFormat;
};

/** 运行环境的只读快照，用于诊断与打包自检。 */
// 2026-10-23 移出：`RuntimeInfo` 的定义已提到 `@knorvia/shared`。
// 原因：`getRuntimeInfo` 的实现搬到了那里（它要读 `process` 与 `node:sea`，
// 放不进纯类型包），而类型与实现应当同源。
// `apps/cli → packages` 是仓库的常态依赖方向（9 个 apps/cli 包已依赖 packages/*），
// 所以这里转发不引入反向依赖。
export type { RuntimeInfo } from "@knorvia/shared";
