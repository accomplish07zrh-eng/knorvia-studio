// SPDX-License-Identifier: Apache-2.0
// 只读策略的形状定义。数据侧（各命令族）只声明画像，判定逻辑集中在遍历器。
// 安全旗标的七种取值语义，由遍历器统一解释：
//   none            旗标自身即完整用法，后面不接任何值
//   string          后面跟随一个任意文本值
//   optionalString  后面的值可有可无
//   number          后面必须是数字（行数、条数一类）
//   char            后面只允许一个字符（备份后缀一类）
//   "{}"            后面跟随以花括号为模板的片段（find -exec 一族）
//   "EOF"           该旗标开启一段以自定义定界符收尾的文本块
export type SafeFlagValue = "{}" | "EOF" | "char" | "none" | "number" | "optionalString" | "string";

// 一条策略 = 命令名（或多词前缀）+ 允许出现的旗标画像 + 可选的追加复核。
// 语义：画像之外的任何词都会让这条命令被判为有副作用。
export interface BashReadonlyCommandPolicy {
  /** 前缀命中后的追加危险性复核；返回 true 表示这条命令实际有副作用。 */
  additionalCommandIsDangerousCallback?: (
    commandText: string,
    argsAfterPrefix: readonly string[],
  ) => boolean;
  /** 命中后不再审查任何后续词（纯观察类命令）。 */
  allowAnyArgs?: boolean;
  /** 允许把数字直接接在旗标后面的紧凑写法。 */
  allowCompactNumericCountFlag?: boolean;
  /** 只认命令名本身，出现任何参数都判有副作用。 */
  commandOnly?: boolean;
  /** 对整段命令文本的最终正则复核，不匹配即判有副作用。 */
  regex?: RegExp;
  /** 参数流中 "--" 之后的词按路径解释，不再当旗标看待。 */
  respectsDoubleDash?: boolean;
  /** 允许出现的旗标画像（取值语义见文件头部七种）。 */
  safeFlags?: Readonly<Record<string, SafeFlagValue>>;
}
