// SPDX-License-Identifier: Apache-2.0
// Git 领域共享类型面：仓库摘要、变更、diff、分支操作、checkpoint（纯声明）。
import type { Locale } from "./protocol.js";

export type GitHeadRefType = "branch" | "detached";

export type GitChangeKind = "modified" | "added" | "deleted" | "renamed";

export type GitChangeSourceId = "unstaged" | "staged" | "branch" | "last-turn";

export type GitRepositoryChangeSourceId = Extract<
  GitChangeSourceId,
  "unstaged" | "staged" | "branch"
>;

const CHANGE_SECTION_TABLE = {
  staged: true,
  unstaged: true,
  untracked: true,
  conflicted: true,
  branch: true,
  "last-turn": true,
} as const;
export type GitChangeSectionId = keyof typeof CHANGE_SECTION_TABLE;

export type GitDiffAvailability = "patch" | "binary" | "truncated" | "unavailable";

export type GitBranchMutationAction = "switch" | "create-and-switch";

const BRANCH_ISSUE_TABLE = {
  "invalid-branch-name": true,
  "branch-already-exists": true,
  "target-branch-not-found": true,
  "tracked-changes-would-be-overwritten": true,
  "untracked-changes-would-be-overwritten": true,
  "conflicts-present": true,
  "operation-in-progress": true,
  "branch-in-other-worktree": true,
  unknown: true,
} as const;
export type GitBranchMutationIssueCode = keyof typeof BRANCH_ISSUE_TABLE;

export type GitRepositorySummary = {
  workspacePath: /* 工作区根路径 */ string;
  repoRoot: /* 仓库根路径 */ string;
  workspaceInRepoPath: /* 工作区相对仓库根的路径 */ string;
  /** Git 元数据 watcher 边界；workspace 内容 watcher 由 UI 按 workspace Host 平台决定。 */
  autoRefreshWatchPaths: GitRepositoryAutoRefreshWatchPath[];
  branchName: /* 当前分支名；游离头为空 */ string | null;
  trackingBranchName: /* 上游分支名 */ string | null;
  headRefType: /* 头引用形态 */ GitHeadRefType;
  ahead: /* 领先上游提交数 */ number;
  behind: /* 落后上游提交数 */ number;
  isDirty: /* 工作区是否有未提交变更 */ boolean;
  isGitAvailable: /* git 可执行文件是否可用 */ boolean;
  isRepository: /* 是否在仓库内 */ boolean;
};

export type GitRepositoryAutoRefreshWatchPath = {
  path: /* 被监视路径 */ string;
  recursive: /* 是否递归监视 */ boolean;
};

export type GitFileChange = {
  path: /* 绝对路径 */ string;
  repoRelativePath: /* 相对仓库根 */ string;
  workspaceRelativePath: /* 相对工作区根 */ string;
  x?: /* git porcelain 的 x 状态码 */ string;
  y?: /* git porcelain 的 y 状态码 */ string;
  kind: /* 变更类别 */ GitChangeKind;
  section: /* 所属分组 */ GitChangeSectionId;
  added: /* 新增行数 */ number;
  removed: /* 删除行数 */ number;
  isStaged: /* 是否已暂存 */ boolean;
  isUntracked: /* 是否未跟踪 */ boolean;
  isConflicted: /* 是否冲突 */ boolean;
};

export type GitDiffRequest = {
  path: /* 目标文件路径 */ string;
  staged?: /* 取暂存区版本 */ boolean;
  sourceId?: /* 变更来源 */ GitChangeSourceId;
};

export type GitDiffResult = {
  path: /* 目标文件路径 */ string;
  availability: /* 补丁可用性 */ GitDiffAvailability;
  patch: /* 统一 diff 文本 */ string | null;
  beforeContent: /* 变更前全文 */ string | null;
  afterContent: /* 变更后全文 */ string | null;
  summary?: /* 可选统计摘要 */ string | null;
};

export type GitIdentity = {
  userName: /* user.name 读数 */ string | null;
  userEmail: /* user.email 读数 */ string | null;
  nameSource: /* name 的生效来源 */ string | null;
  emailSource: /* email 的生效来源 */ string | null;
  scopeLabel?: /* 来源作用域标签 */ string | null;
};

export type GitRepositoryRequest = {
  workspacePath: /* 工作区根路径 */ string;
};

const COMMIT_GRAPH_REF_KIND_TABLE = { branch: true, remote: true, tag: true, head: true } as const;
export type GitCommitGraphRefKind = keyof typeof COMMIT_GRAPH_REF_KIND_TABLE;

export type GitCommitGraphRef = {
  name: /* 引用全名 */ string;
  kind: /* 引用种类 */ GitCommitGraphRefKind;
};

export type GitCommitGraphCommit = {
  hash: /* 提交哈希 */ string;
  parents: /* 父提交哈希列表 */ string[];
  refs: /* 指向该提交的引用 */ GitCommitGraphRef[];
  subject: /* 提交标题 */ string;
  authorName: /* 作者名 */ string | null;
  authoredAtMs: /* 作者时间毫秒 */ number | null;
};

export type GitCommitGraphRequest = GitRepositoryRequest & {
  maxCount?: /* 最多返回条数 */ number;
  skip?: /* 跳过条数 */ number;
};

export type GitCommitGraphResult = {
  commits: /* 提交列表 */ GitCommitGraphCommit[];
  hasMore: /* 是否还有更多 */ boolean;
};

export type GitRefreshRequest = GitRepositoryRequest & {
  includeIdentity?: /* 是否附带身份信息 */ boolean;
  includeBranchComparison?: /* 是否附带分支对比 */ boolean;
};

const WORKSPACE_REPO_KIND_TABLE = {
  "not-repository": true,
  "main-tree": true,
  "linked-worktree": true,
} as const;
export type GitWorkspaceRepositoryKind = keyof typeof WORKSPACE_REPO_KIND_TABLE;

export type GitWorkspaceRepositoryInfo = {
  workspacePath: /* 工作区根路径 */ string;
  kind: /* 仓库形态 */ GitWorkspaceRepositoryKind;
  isGitAvailable: /* git 是否可用 */ boolean;
};

export type GitSwitchBranchRequest = GitRepositoryRequest & {
  targetBranchName: /* 目标分支名 */ string;
};

export type GitCreateBranchRequest = GitRepositoryRequest & {
  branchName: /* 新分支名 */ string;
  startPoint?: /* 起点引用 */ string;
};

export type GitChangesRequest = GitRepositoryRequest & {
  sourceId: /* 变更来源（仓库面） */ Extract<GitRepositoryChangeSourceId, "unstaged" | "staged">;
};

export type GitIgnoredPathsRequest = GitRepositoryRequest & {
  paths: /* 待判定路径列表 */ string[];
};

export type GitDiffQuery = GitRepositoryRequest & GitDiffRequest;

export type GitBranchComparison = {
  baseRef: /* 对比基线引用 */ string | null;
  headRef: /* 对比目标引用 */ string | null;
  comparisonLabel: /* 展示用对比标签 */ string | null;
  changes: /* 对比得到的文件变更 */ GitFileChange[];
};

export type GitLocalBranch = {
  name: /* 分支名 */ string;
  isCurrent: /* 是否当前分支 */ boolean;
  upstreamName: /* 上游分支名 */ string | null;
  commitHash: /* 顶端提交哈希 */ string | null;
  commitTimestampMs: /* 顶端提交时间毫秒 */ number | null;
};

export type GitLocalBranchListResult = {
  headRefType: /* 头引用形态 */ GitHeadRefType;
  currentBranchName: /* 当前分支名 */ string | null;
  branches: /* 本地分支列表 */ GitLocalBranch[];
};

export type GitBranchMutationIssue = {
  code: /* 问题码 */ GitBranchMutationIssueCode;
  message: /* 可展示的问题描述 */ string;
  paths?: /* 相关文件路径 */ string[];
  detail?: /* 补充细节 */ string | null;
};

export type GitBranchMutationResult = {
  ok: /* 是否成功 */ boolean;
  action: /* 执行的动作 */ GitBranchMutationAction;
  branchName: /* 目标分支名 */ string | null;
  didChange: /* 是否改变了 HEAD */ boolean;
  created: /* 是否新建了分支 */ boolean;
  summary: /* 操作后的仓库摘要 */ GitRepositorySummary;
  issues: /* 阻止原因或警告 */ GitBranchMutationIssue[];
};

export type GitPathMutationRequest = GitRepositoryRequest & {
  paths: /* 目标路径列表 */ string[];
};

export type GitDiscardPathsRequest = GitPathMutationRequest & {
  staged?: /* 只丢弃暂存区版本 */ boolean;
};

export type GitCommitRequest = GitRepositoryRequest & {
  message: /* 提交信息 */ string;
  paths?: /* 限定提交路径 */ string[];
  stagedOnly?: /* 只提交暂存区 */ boolean;
};

export type GitCommitResult = {
  commitHash: /* 新提交哈希 */ string;
  summary: /* 提交后的仓库摘要 */ GitRepositorySummary;
};

export type GitGenerateCommitMessageRequest = GitRepositoryRequest & {
  workspaceIdentity?: /* 身份 key（远程场景） */ string;
  locale?: /* 输出语言 */ Locale;
  includeUnstaged?: /* 是否纳入未暂存变更 */ boolean;
  currentSessionFilePaths?: /* 当前会话涉及的文件 */ string[];
  conversationContext?: /* 会话上下文 */ GitCommitMessageConversationContext;
};

export type GitCommitMessageConversationContext = {
  sessionId?: /* 会话标识 */ string;
  omittedMessageCount?: /* 被省略的消息数 */ number;
  messages: /* 参与生成的消息 */ GitCommitMessageConversationMessage[];
};

export type GitCommitMessageConversationMessage = {
  role: /* 发言角色 */ "user" | "assistant";
  content: /* 消息正文 */ string;
};

export type GitGenerateCommitMessageResult = {
  message: /* 生成的提交信息 */ string;
  providerId: /* 使用的供应商 */ string;
  model: /* 使用的模型 */ string;
};

export type GitPushRequest = GitRepositoryRequest;

export type GitPushResult = {
  branchName: /* 被推送分支名 */ string | null;
  trackingBranchName: /* 上游分支名 */ string | null;
  remoteName: /* 远端名 */ string | null;
  setUpstream: /* 是否同时设置上游 */ boolean;
  summary: /* 推送后的仓库摘要 */ GitRepositorySummary;
};

export type GitRefreshResult = {
  summary: /* 仓库摘要 */ GitRepositorySummary;
  identity: /* git 身份信息 */ GitIdentity | null;
  unstagedChanges: /* 未暂存变更 */ GitFileChange[];
  stagedChanges: /* 已暂存变更 */ GitFileChange[];
  branchComparison: /* 分支对比结果 */ GitBranchComparison | null;
};

export type GitCheckpointScope = "workspace";

const CHECKPOINT_CONFLICT_TABLE = {
  "content-mismatch": true,
  "missing-in-worktree": true,
  "unexpected-file-in-worktree": true,
  "type-mismatch": true,
} as const;
export type GitCheckpointConflictReason = keyof typeof CHECKPOINT_CONFLICT_TABLE;

export type GitCheckpointMeta = {
  checkpointId: /* checkpoint 标识 */ string;
  workspacePath: /* 工作区根路径 */ string;
  repoRoot: /* 仓库根路径 */ string;
  workspaceInRepoPath: /* 工作区相对仓库根 */ string;
  createdAt: /* 创建毫秒时间戳 */ number;
  refName: /* checkpoint 引用名 */ string;
  commitOid: /* checkpoint 提交哈希 */ string;
  scope: /* 覆盖范围 */ GitCheckpointScope;
};

export type GitCheckpointRequest = GitRepositoryRequest & {
  checkpointId: /* 目标 checkpoint */ string;
};

export type GitCheckpointDiffQuery = GitRepositoryRequest & {
  fromCheckpointId: /* 起点 checkpoint */ string;
  toCheckpointId: /* 终点 checkpoint */ string;
};

export type GitCheckpointFileDiff = {
  path: /* 绝对路径 */ string;
  repoRelativePath: /* 相对仓库根 */ string;
  workspaceRelativePath: /* 相对工作区根 */ string;
  originalPath?: /* 改名前路径 */ string | null;
  kind: /* 变更类别 */ GitChangeKind;
  added: /* 新增行数 */ number;
  removed: /* 删除行数 */ number;
};

export type GitCheckpointDiff = {
  fromCheckpointId: /* 起点 checkpoint */ string;
  toCheckpointId: /* 终点 checkpoint */ string;
  files: /* 文件级差异 */ GitCheckpointFileDiff[];
};

export type GitCheckpointRestoreQuery = GitCheckpointDiffQuery & {
  force?: /* 强制覆盖冲突文件 */ boolean;
};

export type GitCheckpointConflict = {
  path: /* 绝对路径 */ string;
  repoRelativePath: /* 相对仓库根 */ string;
  workspaceRelativePath: /* 相对工作区根 */ string;
  reason: /* 冲突原因 */ GitCheckpointConflictReason;
};

export type GitCheckpointRestoreResult = {
  success: /* 是否恢复成功 */ boolean;
  conflicts?: /* 冲突明细 */ GitCheckpointConflict[];
  restoredPaths?: /* 实际恢复的路径 */ string[];
};
