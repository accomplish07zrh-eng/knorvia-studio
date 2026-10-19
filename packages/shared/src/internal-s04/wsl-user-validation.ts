// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

export const WSL_USER_MAX_LENGTH = 64;

// oxlint-disable-next-line no-control-regex -- 契约显式禁止 C0 与 DEL，必须匹配这些控制字符。
const FORBIDDEN_WSL_USER_CHARACTER = /[\u0000-\u001f\u007f:/\\]/u;

export function isValidWslUser(value: string): boolean {
  const user = value.trim();
  return (
    user.length > 0 &&
    user.length <= WSL_USER_MAX_LENGTH &&
    !FORBIDDEN_WSL_USER_CHARACTER.test(user)
  );
}

export const wslUserSchema = z
  .string()
  .trim()
  .max(WSL_USER_MAX_LENGTH)
  .refine((value) => value.length === 0 || isValidWslUser(value), {
    message: "Invalid WSL user",
  });
