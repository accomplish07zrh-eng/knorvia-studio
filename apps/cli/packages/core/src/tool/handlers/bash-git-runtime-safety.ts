// SPDX-License-Identifier: Apache-2.0
// git 运行时安全：只读命令一旦涉及 git，就必须确认工作目录不会让 git 加载
// 别处的 hooks/config。判定分两层——命令段层面找 git 与目录切换的组合；
// 目录层面沿祖先链检查 .git 指针（实体目录 / 软链 / gitdir 文件）与裸仓库迹象。
import {
  accessSync,
  constants,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export interface BashReadonlyRuntimeContext {
  workingDirectory?: string;
  workspaceRoot?: string;
}

// shell 包装词：只改变「按哪个路径取可执行文件 / 是否 glob 展开」，剥掉后再取名。
const EXEC_PREFIX_WORDS = new Set(["builtin", "command", "noglob"]);
const REPEATED_DEFAULT_PATH_FLAG = /^-p+$/u;
const DIRECTORY_STEP_WORDS = new Set("cd popd pushd".split(" "));

type CommandSegmentShape = { argv: readonly string[]; name: string };

export function analysisContainsGitCommand(segments: readonly CommandSegmentShape[]): boolean {
  return segments.some((segment) => resolvedHeadName(segment) === "git");
}

export function analysisContainsGitAndDirectoryChange(
  segments: readonly CommandSegmentShape[],
): boolean {
  let gitSeen = false;
  let stepSeen = false;
  for (const segment of segments) {
    const head = resolvedHeadName(segment);
    gitSeen ||= head === "git";
    stepSeen ||= DIRECTORY_STEP_WORDS.has(head);
  }
  // git 可能在目标目录加载 hooks/config；普通 `cd && grep/find` 仍可只读放行。
  return gitSeen && stepSeen;
}

function resolvedHeadName(segment: CommandSegmentShape): string {
  return unwrapHeadWord(segment.argv) ?? segment.name;
}

// 递归剥离包装词；无法继续剥离时当前词就是命令头（可能是包装词本身）。
function unwrapHeadWord(argv: readonly string[]): string | undefined {
  const head = argv[0];
  if (head === undefined || !EXEC_PREFIX_WORDS.has(head)) return head;
  const peeled = peelPrefixWord(head, argv);
  if (peeled === undefined) return head;
  return unwrapHeadWord(peeled);
}

function peelPrefixWord(word: string, stream: readonly string[]): readonly string[] | undefined {
  if (word === "noglob") {
    return stream.length <= 1 ? undefined : stream.slice(1);
  }
  if (word === "builtin") {
    const offset = stream[1] === "--" ? 2 : 1;
    return offset >= stream.length ? undefined : stream.slice(offset);
  }
  let offset = 1;
  while (offset < stream.length && REPEATED_DEFAULT_PATH_FLAG.test(stream[offset] ?? "")) {
    offset += 1;
  }
  if (stream[offset] === "--") offset += 1;
  const next = stream[offset];
  if (next === undefined || next.startsWith("-")) return undefined;
  return stream.slice(offset);
}

type DotGitVerdict = "absent" | "safe" | "unsafe";

const MAX_POINTER_FILE_BYTES = 32 * 1024;
const HEAD_FILE_BYTE_CAP = 4096;
const HEAD_TEXT_PREVIEW_CAP = 255;
const HEAD_REF_SHAPE = /^ref:[ \t]*refs\//u;
const HEAD_OID_SHAPE = /^[0-9a-f]{40}([0-9a-f]{24})?[ \t\n\r]*$/u;

export function isGitRuntimeContextUnsafe(ctx: BashReadonlyRuntimeContext | undefined): boolean {
  const workingDirectory = ctx?.workingDirectory;
  if (!workingDirectory) return false;

  const canonical = canonicalFolderKey(workingDirectory);
  if (!canonical) return true;

  const ownVerdict = judgeDotGitEntry(workingDirectory, canonical);
  if (ownVerdict === "safe") return false;
  if (ownVerdict === "unsafe") return true;

  return ancestorsLookBareOrForeign(workingDirectory, canonical);
}

// 逐级向上找可信仓库边界；途中遇到裸仓库迹象即判不安全，到根为止都干净则安全。
function ancestorsLookBareOrForeign(start: string, canonical: string): boolean {
  if (bareRepositoryMarkers(start)) return true;
  const parent = dirname(start);
  if (parent === start) return false;
  const verdict = judgeDotGitEntry(parent, canonical);
  if (verdict === "absent") return ancestorsLookBareOrForeign(parent, canonical);
  return verdict === "unsafe";
}

// .git 指针分类：目录（标准仓库）、gitdir 指针文件、软链指针，逐种检查。
function judgeDotGitEntry(directory: string, canonicalCwd: string): DotGitVerdict {
  const pointer = join(directory, ".git");
  try {
    const stats = lstatSync(pointer);
    if (stats.isSymbolicLink()) {
      const target = linkDestination(pointer, directory);
      return target ? judgeGitDirTarget(target, canonicalCwd) : "unsafe";
    }
    if (stats.isFile()) return judgePointerFile(pointer, stats.size, directory, canonicalCwd);
    if (stats.isDirectory()) {
      return standardRepositoryLayout(pointer) ? "safe" : "absent";
    }
  } catch {
    return "absent";
  }
  return "absent";
}

function judgePointerFile(
  pointer: string,
  size: number,
  directory: string,
  canonicalCwd: string,
): DotGitVerdict {
  if (size > MAX_POINTER_FILE_BYTES) return "unsafe";
  const pointerText = readFileSync(pointer, "utf8");
  if (pointerText.includes("\0")) return "unsafe";
  const marker = "gitdir: ";
  if (!pointerText.startsWith(marker)) return "absent";
  const destination = pointerText.slice(marker.length).replace(/[\r\n]+$/, "");
  const absolute = isAbsolute(destination) ? destination : join(directory, destination);
  return judgeGitDirTarget(absolute, canonicalCwd);
}

function judgeGitDirTarget(target: string, canonicalCwd: string): DotGitVerdict {
  const canonicalTarget = canonicalFolderKey(target);
  if (!canonicalTarget) return "unsafe";
  // 指向 cwd 内部的 gitdir 会让 git 从当前目录加载配置，判不安全。
  if (withinInclusive(canonicalTarget, canonicalCwd)) return "unsafe";
  if (!pathMentionsDotGit(canonicalTarget)) return "unsafe";
  return headFileLooksValid(canonicalTarget) ? "safe" : "absent";
}

function linkDestination(pointer: string, holder: string): string | undefined {
  try {
    const destination = readlinkSync(pointer);
    return isAbsolute(destination) ? destination : join(holder, destination);
  } catch {
    return undefined;
  }
}

// 标准仓库布局：HEAD 形态合法，objects/refs 存在且可执行，且不是 linked worktree。
function standardRepositoryLayout(gitDirectory: string): boolean {
  if (!headFileLooksValid(gitDirectory)) return false;
  const layoutParts = ["objects", "refs"].map((child) => join(gitDirectory, child));
  if (!layoutParts.every(executableDirectoryExists)) return false;
  return !folderStatSucceeds(join(gitDirectory, "commondir"));
}

function executableDirectoryExists(path: string): boolean {
  try {
    if (!statSync(path).isDirectory()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function headFileLooksValid(gitDirectory: string): boolean {
  try {
    const headPath = join(gitDirectory, "HEAD");
    const stats = lstatSync(headPath);
    if (!stats.isFile() || stats.size > HEAD_FILE_BYTE_CAP) return false;
    const head = readFileSync(headPath, "utf8").slice(0, HEAD_TEXT_PREVIEW_CAP);
    return HEAD_REF_SHAPE.test(head) || HEAD_OID_SHAPE.test(head);
  } catch {
    return false;
  }
}

// 裸仓库迹象：目录自身有 HEAD（文件或软链），或直接摊着 objects/refs。
function bareRepositoryMarkers(folder: string): boolean {
  try {
    const stats = lstatSync(join(folder, "HEAD"));
    if (stats.isFile() || stats.isSymbolicLink()) return true;
  } catch {
    // 缺少 HEAD 不是裸仓库信号，继续检查 objects/refs。
  }
  return ["objects", "refs"].some((child) => folderStatSucceeds(join(folder, child)));
}

function canonicalFolderKey(folder: string): string | undefined {
  try {
    return comparableKey(realpathSync.native(resolve(folder)));
  } catch {
    return undefined;
  }
}

function comparableKey(path: string): string {
  return path.replace(/\\/gu, "/").normalize("NFC").toLowerCase();
}

function withinInclusive(child: string, root: string): boolean {
  const rootWithSlash = root.endsWith("/") ? root : `${root}/`;
  return child === root || child.startsWith(rootWithSlash);
}

function pathMentionsDotGit(path: string): boolean {
  return path.split(/[\\/]+/u).some((segment) => segment.toLowerCase() === ".git");
}

function folderStatSucceeds(path: string): boolean {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}
