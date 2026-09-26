# Knorvia Studio 同提交发布门禁与版本不可变

2026-09-25。依据《Knorvia Studio 开发任务书与迭代路线》T01 编写；本规格先于实现。当前仓库为 `0.8.0-preview.2`，基线 `bcc63b6`。

## 背景与现状（已核对源码）

- `.github/workflows/studio-offline.yml` 目前把检查步骤内联在 `linux` 与 `windows` 两个 job 中，是两份重复定义；`windows` job 带 `if: github.event_name != 'pull_request'`，因此 PR 上不跑 Windows 检查。[S03]
- `.github/workflows/release-windows.yml` 为 `workflow_dispatch` 手动发布，已使用 `--prerelease` 判断，发布 job 不依赖任何检查，附件上传使用 `gh release upload --clobber`。[S04]
- 现有 `--clobber` 会在同名附件存在时覆盖已发布字节，与“同版本内容不可变”冲突。
- 检查步骤中的 `actions/checkout` 未显式绑定 SHA；当发布在 `main` 进行时，检查与打包之间存在取到不同提交的可能。

## 术语

- **受检 SHA（checked SHA）**：本批次所有质量检查实际运行的提交。
- **交付 SHA（delivered SHA）**：打包与发布所使用的提交。
- **幂等重跑**：同一版本、同一标签目标、同名附件且 SHA-256 一致时，重复执行不得改变已发布字节。
- **不可变拒绝**：同一版本的标签目标或附件内容与已发布不一致时，必须拒绝并提示改用新版本，不得覆盖、不得删除标签/Release/附件。

## 规则

1. **单一检查定义**：所有质量检查只在 `.github/workflows/studio-quality.yml`（`workflow_call`）中定义一次。离线检查工作流与发布工作流都通过调用该可复用工作流执行，不再各自内联步骤。检查项固定为：`pnpm typecheck`、`pnpm lint`、`pnpm fmt:check`、`pnpm architecture:check`、`pnpm build:cli-packages`、`pnpm test:studio`。
2. **检查与打包绑定同一 SHA**：可复用工作流接收可选 `ref` 输入；未提供时使用调用事件的 `github.sha`。该工作流以 `checked-sha` 输出实际检出的完整 SHA，并在 job summary 中记录该 SHA、事件与检查结果。打包 job 必须在 `needs` 中依赖检查 job，并 checkout `needs.quality.outputs.checked-sha`，禁止在运行期自行解析 `main` 最新提交。
3. **失败阻断**：发布工作流中，打包与发布 job 必须 `needs` 检查 job。检查被取消、失败、缺失或跳过都不算通过；`needs.` 的默认语义已保证失败/取消阻断，因此不得给检查 job 添加 `continue-on-error` 或 `if: always()`。
4. **PR 必跑 Windows**：`.github/workflows/studio-offline.yml` 在 `pull_request` 上同时运行 Linux 快速检查与 Windows 检查；`push: main` 与 `workflow_dispatch` 同样运行两者。仓库分支保护规则需要管理员配置，YAML 可被看到不等于已受保护；该配置列入 `docs/knorvia-release-admin-rules.md`，不在工作流中声称已完成。
5. **普通提交只产生验证产物**：离线检查工作流不构建安装包、不创建 Release。只有 `workflow_dispatch` 显式触发发布工作流才对外发布。
6. **保留预发布判断**：版本含 `preview`/`dev`/`beta`/`alpha` 时使用 `--prerelease`，否则不使用；不重复实现、不改写该判断。
7. **同版本不可变**：发布前先解析该标签当前指向的提交（`git rev-parse "$tag^{commit}"`）。若标签已存在：
   - 标签目标提交 ≠ 交付 SHA → 拒绝，要求提升版本号；
   - 同名附件已存在且 SHA-256 与本次构建一致 → 幂等结束，不上传、不覆盖；
   - 同名附件已存在但 SHA-256 不一致 → 拒绝，要求提升版本号；
   - Release 存在但没有同名附件 → 允许补传该附件。
8. **禁止破坏性操作**：不使用 `--clobber`，不删除标签、Release 或附件，不使用 `--cleanup-tag`。判断逻辑集中在 `scripts/release-immutability.mjs`，可用本地夹具独立验证，不依赖网络。
9. **日志可查**：Release 说明与工作流 summary 记录交付 SHA、产物名与 SHA-256。产物哈希同时写入 `<artifact>.sha256` 附件。
10. **dry run 也要做不可变性校验**：标签查询与不可变判定放在**只读** job `validate-release`（`permissions: contents: read`）里，
    普通发布与 `dry_run` 都会执行；只有创建 Release、上传附件这类**写**操作才受 `!inputs.dry_run` 控制。
    因此 dry run 能发现旧标签冲突或已有附件内容不一致，并阻断（`release-decision.json` 作为产物保留）。
    `publish` job 通过 `needs.validate-release.outputs.action` 决定 create / upload / skip。
11. **发布判定测试必须进入统一入口**：`scripts/` 不在 `scripts/test-studio.mjs` 的目录扫描范围内，必须逐个显式列入。
    `scripts/release-gate.test.ts`（11 例判定表夹具）已在其中，因此 `pnpm test:studio` 与质量工作流都会跑到它。
    **验收不能只看它通过一次**：故意改坏一条断言后 `pnpm test:studio` 必须失败并指出该文件（实测 783/784，失败点 `scripts/release-gate.test.ts:24`）。
12. **版本号与既有标签**：`v0.8.0-preview.2` 已指向旧基线 `bcc63b6`，按规则 7 不能再往该标签发布；
    收尾时把根 `package.json` 升到 `0.8.0-preview.3`，**原标签与附件保留不动**。
    历史文档里出现 `0.8.0-preview.2` 是对当时构建的记录，不随版本升级改写。

## 判定表

| 已存在同标签     | 标签目标       | 同名附件 | 附件 SHA-256 | 结果                                   |
| ---------------- | -------------- | -------- | ------------ | -------------------------------------- |
| 否               | —              | —        | —            | 创建 Release 并上传                    |
| 是               | 等于交付 SHA   | 无       | —            | 补传附件                               |
| 是               | 等于交付 SHA   | 有       | 等于本次     | 幂等结束（skip）                       |
| 是               | 等于交付 SHA   | 有       | 不等于本次   | 拒绝（exit 3）                         |
| 是               | 不等于交付 SHA | 任意     | 任意         | 拒绝（exit 2）                         |
| 未知（查询失败） | —              | —        | —            | 视为“否”前必须显式区分查询失败与不存在 |

发布脚本对 `gh release view` 的失败必须区分“Release 不存在”和“查询失败”；查询失败不得按“不存在”继续创建。

## 验收场景

1. 故意让一项检查失败，验证打包与发布 job 不执行。
2. 检查与打包使用同一 SHA，且该 SHA 出现在工作流日志与 summary 中。
3. 用本地夹具覆盖判定表六种情形，`scripts/release-gate.test.ts` 全部通过。
4. 相同版本重跑且内容一致时决策为 `skip`，不调用上传；不一致时退出码非 0。
5. 预览版本仍使用 `--prerelease`。
6. 分支保护与必需检查由管理员配置，见 `docs/knorvia-release-admin-rules.md`，本轮不声称已配置。
