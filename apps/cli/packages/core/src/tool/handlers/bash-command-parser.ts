// SPDX-License-Identifier: Apache-2.0
// 兼容面：命令分析器的形状定义（兼容声明块）与两个公开函数。
// 实现按语法分析阶段重组于 bash-exec/command-analysis.ts，本模块路径的导出不变。
export { analyzeBashCommand, isBashCommandPermissionSafe } from "./bash-exec/command-analysis.js";

export type BashCommandOperator = "&&" | "||" | "|" | "|&" | "sequence";

export interface BashCommandEnvAssignment {
  readonly name: string | undefined;
  readonly value: string | undefined;
}

export interface BashCommandRedirect {
  readonly fileDescriptor: number | undefined;
  readonly operator: import("unbash").Redirect["operator"];
  readonly target: string;
}

export interface BashCommandInvocation {
  readonly argv: string[];
  readonly commandText: string;
  readonly envAssignments: BashCommandEnvAssignment[];
  readonly hasAssignmentPrefix: boolean;
  readonly hasDynamicWords: boolean;
  readonly hasRedirects: boolean;
  readonly name: string;
  readonly operatorBefore?: BashCommandOperator;
  readonly redirects: BashCommandRedirect[];
}

export interface BashCommandAnalysis {
  readonly commands: BashCommandInvocation[];
  readonly hasDynamicWords: boolean;
  readonly hasParseErrors: boolean;
  readonly hasRedirects: boolean;
  readonly hasUnsupportedSyntax: boolean;
  readonly unsupportedNodeTypes: string[];
}
