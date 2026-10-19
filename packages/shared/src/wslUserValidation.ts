// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

/** WSL 用户名按 UTF-16 计长，上限 64；不额外收紧 C1 或 Unicode。 */
export const WSL_USER_MAX_LENGTH = 64;

/** 契约禁止的字符：C0、DEL，以及 `/`、`:`、`\`。 */
// oxlint-disable-next-line no-control-regex -- 契约显式要求匹配这些控制字符。
const BLOCKED_USER_CHARACTERS = /[\u0000-\u001f\u007f:/\\]/u;

/** 已 trim 的用户名是否合法：长度落在 1–64，且不含禁用字符。 */
function isNormalizedWslUser(user: string): boolean {
  const withinBounds = user.length > 0 && user.length <= WSL_USER_MAX_LENGTH;
  return withinBounds && !BLOCKED_USER_CHARACTERS.test(user);
}

export function isValidWslUser(value: string): boolean {
  return isNormalizedWslUser(value.trim());
}

/** schema 与函数判定的差异仅在「空串放行」：调用方用空串表示未配置用户。 */
function acceptBlankOrValidUser(value: string): boolean {
  if (value.length === 0) return true;
  return isNormalizedWslUser(value);
}

const wslUserText = z.string().trim().max(WSL_USER_MAX_LENGTH);

export const wslUserSchema = wslUserText.refine(acceptBlankOrValidUser, {
  message: "Invalid WSL user",
});
