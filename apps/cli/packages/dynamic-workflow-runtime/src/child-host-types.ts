// SPDX-License-Identifier: Apache-2.0
// 子进程宿主面的冻结形状：三个类型由合同 interface.md 逐字段锁定，运行期模块只引用它们。
// 这些名字也是包入口的导出，改一个就是破坏兼容面。
import type { ChildPayload } from "./protocol.js";

/** childMain 用到的 node:vm 表面：只有造 context 与跑脚本两个函数。 */
export interface ChildVmModule {
  createContext(sandbox: object, options?: { name?: string }): object;
  runInContext(code: string, sandbox: object, options?: { filename?: string }): unknown;
}

/** childMain 用到的 readline.Interface 表面。 */
export interface ChildReadlineInterface {
  on(event: "line", listener: (line: string) => void): unknown;
  close(): void;
}

/** 注入给 childMain 的宿主能力；两种启动方式各自提供真实实现。 */
export interface ChildMainDeps {
  vm: ChildVmModule;
  createInterface(options: { input: NodeJS.ReadableStream }): ChildReadlineInterface;
  /** 入站 response 的来源（父进程 stdin 管道）。持有它也让事件循环保持存活。 */
  stdin: NodeJS.ReadableStream;
  /** 出站 NDJSON 的去处；childMain 自己补换行。 */
  stdout: { write(chunk: string): unknown };
  /** 本次 run 的 payload：入口文件把它当 JSON 字面量内嵌并原样递进来。 */
  payload: ChildPayload;
}
