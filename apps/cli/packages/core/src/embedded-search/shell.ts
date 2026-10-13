import type * as contracts from "@knorvia/contracts";
import {
  injectEmbeddedSearchBashPrelude,
  isEmbeddedSearchPreludeDialect,
} from "./shell-internal.js";

/** find()/grep() alias 注入总开关。 */
export const shouldInjectEmbeddedSearchBashPrelude = (): boolean =>
  injectEmbeddedSearchBashPrelude();

/** 会话 shell 的 dialect 是否在注入白名单内；未选择 shell 时视为否。 */
export const supportsEmbeddedSearchShellSelection = (
  selection: contracts.ExecutionShellSelection | undefined,
): boolean => isEmbeddedSearchPreludeDialect(selection);
