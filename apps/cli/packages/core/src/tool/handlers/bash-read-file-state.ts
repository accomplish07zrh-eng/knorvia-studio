// SPDX-License-Identifier: Apache-2.0
// bash 的 read-state 效果：命令完成后做两件事——① 命令带写嫌疑且已读文件被改动时，
// 给输出加「先 Read 再编辑」的过期提示；② 模型用 cat/head/tail/sed 直读过的文件，
// 把可见内容回填进 read-state，维持 read-before-write 语义。
import type { BashOutput, ExecutionResult } from "@knorvia/contracts";
import { resolveWorkspacePath } from "../path-policy.js";
import {
  createReadFileStateKey,
  findLatestReadFileState,
  normalizeReadFileStateMtimeMs,
} from "../read-file-state.js";
import type { ToolExecutionContext } from "../types.js";
import {
  buildReadStateRecord,
  buildStateTrace,
  composeStaleHint,
  effectsBlocked,
  statMtimeValue,
} from "./bash-exec/read-state-effects-util.js";
import { collectBashReadFileSources, selectReadContent } from "./bash-read-file-sources.js";

type BashDiskPort = NonNullable<ToolExecutionContext["fileSystemPort"]>;
type BashReadStateRegistry = NonNullable<ToolExecutionContext["readFileState"]>;

const BACKFILL_SIZE_CEILING_BYTES = 10 * 1024 * 1024;
// 写嫌疑标记：原地改写旗标与常见格式化/修复型脚本动作（依据各工具公开文档）。
const WRITE_SUSPICION_MARKERS = new RegExp(
  (
    "--write --fix --in-place --auto-correct \\brun\\s+format\\b \\b(yarn|pnpm)\\s+format\\b " +
    "\\brun\\s+fix\\b \\blint:file\\b \\blint:fix\\b \\bblack\\b \\bisort\\b \\bruff\\s+format\\b " +
    "\\bcargo\\s+(fmt|fix)\\b \\brustfmt\\b \\bgo\\s+fmt\\b \\bterraform\\s+fmt\\b \\bdprint\\s+fmt\\b " +
    "\\bswiftformat\\b \\bphpcbf\\b"
  )
    .split(" ")
    .join("|"),
);

interface BashReadFileStateEffectsInput {
  output: BashOutput;
  result: ExecutionResult;
  command: string;
  context: ToolExecutionContext;
}

export async function applyBashReadFileStateEffects(
  effects: BashReadFileStateEffectsInput,
): Promise<void> {
  const staleHint = await detectStaleReadHint(effects);
  if (staleHint) effects.output.staleReadFileStateHint = staleHint;
  await backfillFromObservedReads(effects);
}

// 过期提示：写嫌疑命令跑完后，逐个 stat 已读文件——比命令开始时间新且比记录新即视为被改。
async function detectStaleReadHint(
  effects: BashReadFileStateEffectsInput,
): Promise<string | undefined> {
  if (effectsBlocked(effects.output)) return undefined;
  if (!WRITE_SUSPICION_MARKERS.test(effects.command)) return undefined;
  const disk = effects.context.fileSystemPort;
  const registry = effects.context.readFileState;
  if (!disk || !registry) return undefined;

  const touched = new Set<string>();
  const probe = buildStateTrace(effects.context);
  const startedAtMs = effects.result.startedAt.getTime();
  const observations = [...registry.values()].map(async (record) => {
    const recordedMtime = normalizeReadFileStateMtimeMs(record.mtimeMs);
    if (recordedMtime === undefined) return;
    const liveMtime = await currentMtimeOf(disk, record.path, probe, effects.context);
    if (liveMtime === undefined) return;
    const freshAfterRun = liveMtime > startedAtMs && liveMtime > recordedMtime;
    if (freshAfterRun) touched.add(record.path);
  });
  await Promise.all(observations);
  if (touched.size === 0) return undefined;
  return composeStaleHint([...touched], effects.context.workingDirectory);
}

async function currentMtimeOf(
  disk: BashDiskPort,
  path: string,
  probe: ReturnType<typeof buildStateTrace>,
  ctx: ToolExecutionContext,
): Promise<number | undefined> {
  try {
    const metadata = await disk.stat({ path, trace: probe }, { signal: ctx.abortSignal });
    return statMtimeValue(metadata);
  } catch {
    // 无法 stat 的已读文件不阻断 Bash result。
    return undefined;
  }
}

// 回填：只信「模型确实看到的内容」——stdout 被截断时回读完整文件会绕过 read-before-write。
async function backfillFromObservedReads(effects: BashReadFileStateEffectsInput): Promise<void> {
  if (effectsBlocked(effects.output)) return;
  if (effects.output.stdoutTruncated === true) return;
  const disk = effects.context.fileSystemPort;
  const registry = effects.context.readFileState;
  if (!disk || !registry) return;

  const reads = collectBashReadFileSources(effects.command).filter(
    (observed) => !observed.requiresExitZero || effects.result.exitCode === 0,
  );
  if (reads.length === 0) return;

  const probe = buildStateTrace(effects.context);
  const ingests = reads.map((observed) =>
    ingestObservedRead(disk, registry, observed, effects, probe),
  );
  await Promise.all(ingests);
}

async function ingestObservedRead(
  disk: BashDiskPort,
  registry: BashReadStateRegistry,
  observed: ReturnType<typeof collectBashReadFileSources>[number],
  effects: BashReadFileStateEffectsInput,
  probe: ReturnType<typeof buildStateTrace>,
): Promise<void> {
  const absolutePath = resolveWorkspacePath({
    inputPath: observed.filePath,
    operation: "read",
    workingDirectory: effects.context.workingDirectory,
    workspaceRoot: effects.context.workspaceRoot,
  });
  if (findLatestReadFileState(registry, absolutePath)) return;

  try {
    const metadata = await disk.stat(
      { path: absolutePath, trace: probe },
      { signal: effects.context.abortSignal },
    );
    if (metadata.kind !== "file") return;
    if (metadata.sizeBytes > BACKFILL_SIZE_CEILING_BYTES) return;
    if (effects.context.abortSignal.aborted) return;

    const file = await disk.readTextFile(
      { path: absolutePath, maxBytes: BACKFILL_SIZE_CEILING_BYTES, trace: probe },
      { signal: effects.context.abortSignal },
    );
    if (file.truncated) return;
    const visible = selectReadContent(file.content, observed);
    if (!visible) return;

    const revisionId = file.revision?.id ?? metadata.revision?.id;
    const observedMtime = normalizeReadFileStateMtimeMs(
      file.revision?.mtimeMs ?? metadata.revision?.mtimeMs ?? metadata.mtimeMs,
    );
    const observedSize =
      file.revision?.sizeBytes ?? metadata.revision?.sizeBytes ?? metadata.sizeBytes;
    const record = buildReadStateRecord(
      absolutePath,
      visible,
      revisionId,
      observedMtime,
      observedSize,
    );
    registry.set(createReadFileStateKey(absolutePath, visible.offset ?? 1, visible.limit), record);
  } catch {
    // Bash 已经返回，read-state 回填失败不能改变 Bash 结果。
  }
}
