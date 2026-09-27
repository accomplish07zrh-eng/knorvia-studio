// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Knorvia Studio contributors

export type ToolInputValidationPath = (string | number)[];
interface Located<Code extends string> {
  code: Code;
  path: ToolInputValidationPath;
  message: string;
}
type SizeOrigin = "array" | "number" | "string";
interface Size<Code extends string> extends Located<Code> {
  origin: SizeOrigin;
  inclusive: boolean;
  exact?: true;
}

export interface ToolInputCustomIssue extends Located<"custom"> {}
export interface ToolInputInvalidTypeIssue extends Located<"invalid_type"> {
  expected: string;
  format?: string;
  received?: string;
}
export interface ToolInputInvalidValueIssue extends Located<"invalid_value"> {
  values: unknown[];
}
export interface ToolInputUnrecognizedKeysIssue extends Located<"unrecognized_keys"> {
  keys: string[];
}
export interface ToolInputTooSmallIssue extends Size<"too_small"> {
  minimum: number;
}
export interface ToolInputTooBigIssue extends Size<"too_big"> {
  maximum: number;
}
export interface ToolInputInvalidFormatIssue extends Located<"invalid_format"> {
  origin?: "string";
  format: string;
  pattern?: string;
}
export interface ToolInputInvalidUnionIssue extends Located<"invalid_union"> {
  errors: ToolInputValidationIssue[][];
  message: "Invalid input";
}
export type ToolInputValidationIssue =
  | ToolInputCustomIssue
  | ToolInputInvalidTypeIssue
  | ToolInputInvalidValueIssue
  | ToolInputUnrecognizedKeysIssue
  | ToolInputTooSmallIssue
  | ToolInputTooBigIssue
  | ToolInputInvalidFormatIssue
  | ToolInputInvalidUnionIssue;
