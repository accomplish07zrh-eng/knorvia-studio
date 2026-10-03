import { countContextPrefixMessages } from "../deps.js";
import type { EnvInfo, ExecutionShellSelection, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";
import type { AgentRuntimeConfig } from "../types.js";
import { persistBashShellSelectionSnapshot, readPersistedBashShellSelectionSnapshot, resolveBashShellSnapshotForResume, type BashShellSnapshotRestore, } from "./bash-shell-snapshot.js";
import { rebuildContextPrefix } from "./context-refresh.js";
import { buildShellEnvironmentResumeNotice, getShellEnvironmentResumeNoticeKind, } from "./shell-environment.js";
import { refreshBranchAwareBuiltInTools } from "./embedded-search-branch.js";
