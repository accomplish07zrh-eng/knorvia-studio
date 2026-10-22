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
export type RuntimeInfo = {
  arch: NodeJS.Architecture;
  cwd: string;
  execPath: string;
  node: string;
  platform: NodeJS.Platform;
  sea: boolean;
  versions: NodeJS.ProcessVersions;
};

/**
 * 当前的呈现面。
 *
 * 2026-10-23 从 `core/src/context/types.ts` 移来：它是纯字面量联合类型，
 * 与「纯类型包」的定位一致。原先 core 与 cli/bootstrap 都要引用它，
 * 而 core 会随 kernel-switch 删除，所以提到这里让两侧都能稳定依赖。
 */
export type PresentationSurface = "terminal" | "knorvia_desktop";
