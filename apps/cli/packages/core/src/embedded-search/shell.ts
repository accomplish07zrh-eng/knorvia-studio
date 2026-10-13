import type * as contracts from "@knorvia/contracts";
import {
  injectEmbeddedSearchBashPrelude,
  isEmbeddedSearchPreludeDialect,
} from "./shell-internal.js";

/** find()/grep() alias 注入总开关。 */
export function shouldInjectEmbeddedSearchBashPrelude(): boolean {
  return injectEmbeddedSearchBashPrelude();
}

/** 会话 shell 的 dialect 是否在注入白名单内；未选择 shell 时视为否。 */
export function supportsEmbeddedSearchShellSelection(
  selection: contracts.ExecutionShellSelection | undefined,
): boolean {
  return isEmbeddedSearchPreludeDialect(selection);
}
