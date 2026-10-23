// SPDX-License-Identifier: Apache-2.0
// 持久化远程会话路径修复（从 core 的 runtime/helpers/session/remote-session-repair.ts 内联）。
//
// kernel-switch 前置：这个模块唯一的新引擎消费者是 protocol/server-operations.ts，
// 而它的依赖（@knorvia/contracts + @knorvia/shared）bootstrap 本来就都有 ——
// 所以按「协议层自己的职责」内联到协议层，core 侧随 core 删除。
//
// 行为约定（逐字保留自原实现）：
// 无工作区身份或身份非 remote: 前缀原样返回；把 directory/path 与身份比对分成
// clean/repair/unsafe/unrelated 四态；有 repair 态时先在内存修好记录，再走 CAS 窄化
// 写回并回读会话：匹配返回回读结果，不匹配但记录已一致也返回，不匹配且仍需修则回调
// 报告后返回内存修复；存储不支持窄化接口同样回调后降级。身份非法、路径含身份但无法
// 安全归位、回读中身份变化/记录消失/仍不安全 → SessionCorrupted（可恢复）；
// 存储层其它异常不吞核心错误，回调后降级返回内存修复。
import {
  CoreErrorType,
  createCoreError,
  isCoreError,
  type RepairRemoteSessionPathsInput,
  type SessionInfo,
  type SessionStorePort,
} from "@knorvia/contracts";
import { parseRemoteWorkspaceIdentity } from "@knorvia/shared";

/** 支持窄化修复的会话存储面（窄化接口可缺席）。 */
export type RemoteSessionPathRepairStore = Pick<SessionStorePort, "getSession"> & {
  repairRemoteSessionPaths?: (input: RepairRemoteSessionPathsInput) => Promise<boolean>;
};

/** 路径四态：干净 / 可安全归位 / 含身份但不安全 / 与身份无关。 */
type PathState = "clean" | "repair" | "unsafe" | "unrelated";

/** 持久化失败回调的形状。 */
type PersistenceFailureHook = (error: unknown) => void;

/** 损坏上下文的固定 reason 串（诊断契约字段）。 */
const CORRUPTION_REASON = "remote_session_workspace_path_corrupted";

// 损坏错误的三条固定消息（值逐字冻结，按句拼接）。
const IDENTITY_INVALID_MESSAGE = ["Persisted remote session workspace identity", "is invalid"].join(
  " ",
);
const UNSAFE_PATH_MESSAGE = [
  "Remote session workspace path is corrupted",
  "and cannot be repaired safely",
].join(" ");
const RECORD_VANISHED_MESSAGE = "Remote session disappeared during path repair";
const IDENTITY_CHANGED_MESSAGE = [
  "Remote session workspace identity changed",
  "during path repair",
].join(" ");
const UNSAFE_AFTER_REPAIR_MESSAGE = [
  "Remote session workspace path changed to an unsafe value",
  "during repair",
].join(" ");

// 回调报告的两条降级原因（值逐字冻结）。
const UNSUPPORTED_STORE_MESSAGE = "Session store does not support narrow remote path repair";
const CAS_MISMATCH_MESSAGE = "Remote session path repair CAS did not match";

/** 远程身份前缀。 */
const REMOTE_PREFIX = "remote:";

/** 抛一条可恢复的会话损坏错误。 */
const corruptedRecord = (message: string, context: Record<string, unknown>) =>
  createCoreError(CoreErrorType.SessionCorrupted, message, {
    context,
    recoverable: true,
  });

/** 损坏诊断上下文：记录定位字段 + 固定 reason。 */
const corruptionContext = (record: SessionInfo, workspaceIdentity: string | undefined) => ({
  directory: record.directory,
  path: record.path,
  reason: CORRUPTION_REASON,
  sessionId: record.id,
  workspaceIdentity,
});

// 与身份无关的路径给 unrelated；含身份但归位不安全给 unsafe；身份本身或「工作区根 + / +
// 身份」的嵌入形态给 repair；字面等于工作区路径给 clean。
const classifyLocation = (
  value: string,
  workspacePath: string,
  workspaceIdentity: string,
): PathState => {
  if (value === workspacePath) return "clean";
  const rootPrefix = workspacePath === "/" ? "/" : `${workspacePath}/`;
  const embeddedIdentity = `${rootPrefix}${workspaceIdentity}`;
  if (value === workspaceIdentity || value === embeddedIdentity) return "repair";
  return value.includes(workspaceIdentity) ? "unsafe" : "unrelated";
};

/** 单字段路径判定：undefined 当作干净。 */
const locationStateOf = (
  value: string | undefined,
  workspacePath: string,
  workspaceIdentity: string,
): PathState =>
  value === undefined ? "clean" : classifyLocation(value, workspacePath, workspaceIdentity);

/** 按两字段状态把 repair 字段改写到工作区路径上（返回新记录）。 */
const applyInMemoryRepair = (
  record: SessionInfo,
  workspacePath: string,
  directoryState: PathState,
  pathState: PathState,
): SessionInfo => {
  const repaired = { ...record };
  if (directoryState === "repair") repaired.directory = workspacePath;
  if (pathState === "repair") repaired.path = workspacePath;
  return repaired;
};

/** 组装 CAS 窄化写回载荷：带旧值做比对，携带内存修复后的新值。 */
const buildCasInput = (
  record: SessionInfo,
  workspaceIdentity: string,
  repaired: SessionInfo,
): RepairRemoteSessionPathsInput => ({
  sessionID: record.id,
  workspaceID: workspaceIdentity as RepairRemoteSessionPathsInput["workspaceID"],
  expectedDirectory: record.directory,
  expectedPath: record.path ?? null,
  directory: repaired.directory,
  path: repaired.path ?? null,
  timeUpdated: record.time.updated,
});

/** 修复主流程：四态判定 → 内存修复 → CAS 写回 → 回读复核。 */
export const repairPersistedRemoteSessionPaths = async (
  store: RemoteSessionPathRepairStore,
  record: SessionInfo,
  hooks?: { onPersistenceFailure?: PersistenceFailureHook },
): Promise<SessionInfo> => {
  const workspaceIdentity = record.workspaceID?.trim();
  if (!workspaceIdentity) return record;

  const parsed = parseRemoteWorkspaceIdentity(workspaceIdentity);
  if (!parsed) {
    if (!workspaceIdentity.startsWith(REMOTE_PREFIX)) return record;
    throw corruptedRecord(IDENTITY_INVALID_MESSAGE, corruptionContext(record, workspaceIdentity));
  }

  const workspacePath = parsed.workspacePath;
  const directoryState = classifyLocation(record.directory, workspacePath, workspaceIdentity);
  const pathState = locationStateOf(record.path, workspacePath, workspaceIdentity);
  const anyUnsafe = directoryState === "unsafe" || pathState === "unsafe";
  if (anyUnsafe) {
    throw corruptedRecord(UNSAFE_PATH_MESSAGE, corruptionContext(record, workspaceIdentity));
  }
  const needsRepair = directoryState === "repair" || pathState === "repair";
  if (!needsRepair) return record;

  const initialRepair = applyInMemoryRepair(record, workspacePath, directoryState, pathState);
  const narrowRepair = store.repairRemoteSessionPaths;
  if (!narrowRepair) {
    hooks?.onPersistenceFailure?.(new Error(UNSUPPORTED_STORE_MESSAGE));
    return initialRepair;
  }

  try {
    const matched = await narrowRepair.call(
      store,
      buildCasInput(record, workspaceIdentity, initialRepair),
    );
    const refreshed = await store.getSession(record.id);
    if (matched) return refreshed ?? initialRepair;
    if (!refreshed) {
      throw corruptedRecord(RECORD_VANISHED_MESSAGE, {
        reason: CORRUPTION_REASON,
        sessionId: record.id,
        workspaceIdentity,
      });
    }

    const refreshedIdentity = refreshed.workspaceID?.trim();
    if (refreshedIdentity !== workspaceIdentity) {
      throw corruptedRecord(
        IDENTITY_CHANGED_MESSAGE,
        corruptionContext(refreshed, refreshedIdentity),
      );
    }

    const refreshedDirectory = classifyLocation(
      refreshed.directory,
      workspacePath,
      workspaceIdentity,
    );
    const refreshedPath = locationStateOf(refreshed.path, workspacePath, workspaceIdentity);
    if (refreshedDirectory === "unsafe" || refreshedPath === "unsafe") {
      throw corruptedRecord(
        UNSAFE_AFTER_REPAIR_MESSAGE,
        corruptionContext(refreshed, workspaceIdentity),
      );
    }
    if (refreshedDirectory !== "repair" && refreshedPath !== "repair") return refreshed;

    hooks?.onPersistenceFailure?.(new Error(CAS_MISMATCH_MESSAGE));
    return applyInMemoryRepair(refreshed, workspacePath, refreshedDirectory, refreshedPath);
  } catch (error) {
    if (isCoreError(error) && error.type === CoreErrorType.SessionCorrupted) throw error;
    hooks?.onPersistenceFailure?.(error);
    return initialRepair;
  }
};
