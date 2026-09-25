# Knorvia Studio 发布门禁：管理员规则清单

2026-09-25。对应 `specs/knorvia-release-gates.md`（T01）。本清单中的项目只能在 GitHub 仓库设置里配置，**改 YAML 不等于已完成配置**。本文件只声明需要配置什么，以及如何核实。

## 必须由仓库管理员配置

1. **保护 `main` 分支**
   - 禁止直接推送（`Require a pull request before merging`）。
   - 禁止强制推送与删除分支。
   - 允许的合并方式按团队约定，但不得跳过必需检查。
2. **必需状态检查（required status checks）**
   至少包含以下 job 名（工作流 → job）：
   - `Studio offline checks / linux`
   - `Studio offline checks / windows`
     两项都必须勾选 `Require branches to be up to date before merging`，否则旧提交上的绿色结果会被复用。
3. **发布权限**
   - 只有受信任的维护者拥有 `Release Windows portable` 的 `workflow_dispatch` 触发权限。
   - 仓库 Actions 的 `Workflow permissions` 保持「Read and write permissions」仅限于需要发布的维护者范围。
4. **不可变发布**
   - **不要**在 Releases 设置里启用任何“允许替换同名附件”的第三方自动化。
   - 不使用 `--cleanup-tag`、不删除已发布 Release 或标签；发现问题版本时发布新的修复版本。

## 如何核实（管理员操作后可自查）

```text
# 1. 分支保护是否存在（需要仓库管理员权限的 token）
gh api repos/:owner/:repo/branches/main/protection

# 2. 必需检查是否包含 linux 与 windows
gh api repos/:owner/:repo/branches/main/protection \
  --jq '.required_status_checks.contexts'
```

预期输出包含：

```text
Studio offline checks / linux
Studio offline checks / windows
```

## 当前状态（如实记录）

- 本轮只修改了仓库内的工作流文件，**没有**、也无法从代码侧配置分支保护。
- `studio-offline.yml` 现在在 `pull_request` 上同时运行 Linux 与 Windows 检查；这只是让检查“可见”。仓库管理员未完成上面的配置前，不能声称 PR 已被强制保护。
- 本地已用夹具验证同版本不可变判定逻辑（`scripts/release-gate.test.ts`）；云端工作流在本次交付环境中未执行。

## 失败阻断的核实方式

1. 在 PR 中故意引入一个 typecheck 错误，观察 `Studio offline checks / linux` 与 `windows` 变红。
2. 观察 `Release Windows portable` 的 `package` 与 `publish` job 因 `needs` 依赖未执行（不是“执行后跳过”）。
3. 不要为了验证而给质量检查 job 添加 `continue-on-error` 或 `if: always()`；那会破坏阻断语义。
