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
 * 回合输入携带的一条附件。
 *
 * 纯数据描述：**不引用任何其他类型**，所以可以放在这个纯类型包里。
 * 它跨越「输入采集 → 协议边界 → 模型请求」三层，而这三层分属不同包，
 * 因此描述它的类型必须住在它们都够得着的地方。
 *
 * `sourceKind` 目前只有一个取值：`clipboard-text` 表示 UI 长粘贴落盘生成的
 * 临时附件 —— 这类附件在模型请求里只保留路径引用，不重复携带内容。
 */
export interface TurnAttachment {
  type: "file" | "image" | "video" | "pdf" | "url";
  path?: string;
  content?: string;
  sourceKind?: "clipboard-text";
  /** 展示元信息；缺省时由 basename / 扩展名推断。不参与内容解析。 */
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
}
