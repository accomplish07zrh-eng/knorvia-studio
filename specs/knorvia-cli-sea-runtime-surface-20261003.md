# SEA / distribution workspace runtime 输出边界

父任务授权处理 PR21 head `8123d33cdfbe273449be0ffd4cd8992eecf837dd` 的 `docs/evidence/native-packaged-acceptance-20261003/result.json` 所记阻塞。其 distribution log 在 CLI `sea-runtime-package-resolution.mjs` 因 `@knorvia/cua/dist/index.js` 不存在终止，未产出完整发行归档。当前 CUA manifest 明确导出根 JS / declaration，没有 dist build；实现由 native 路持有，本批只读。

本路独占 `apps/cli/packages/cli/scripts/**`。收集器同时为 SEA 和根 distribution 提供 assets；一次修复复用该已有路径，不创建根 packager 或第二份 runtime manifest。不修改根脚本/配置/CI、其他路源文件、CUA 公共 layout、driver、协议、UI 或用户数据。Apache/第三方/版权历史保留，本修复不是 CUA 独立替换或开源许可授予。

## 现有入口与实际输出合同

读取 package.json 后，workspace 根 runtime entry 由 exports 的 `.` / condition object、main 或 module 给出；exports 是 string/array 时本身为根入口。沿用既有 src → dist 编译入口投影，types 条件不当作可执行 JS。若 manifest 没有 runtime entry，维持旧 `./dist/index.js` fallback。明确的 root import JS 应检查真实文件，不能以没有 dist 判为没有产物；缺失应指出确切入口并让构建失败，不绕过未编译 workspace。包查找/物理版本 placement 与 Node 的消费者优先级不变。

已有 workspace 编译输出仍包含 package.json + 全部 dist/**（不含 maps），source TS 与 dev/test/scripts 不带入。若 manifest 明确声明根 runtime JS，则另外保留该根目录的 .js/.mjs/.cjs、.d.ts/.d.mts/.d.cts、JSON 产物及声明在其他首层目录的 runtime outputs；root JS 的私有同目录模块必须一起带入，不能只拷贝 export 文件而损坏内部相对 import。根 TS 不作为可执行产物，不引入任意全目录打包。当前 CUA 的所有根 runtime/private JS 与 declarations 保持原字节、文件名及 exports 映射，其他资源/driver 仍走原 official-plugin/native asset owner。

投影 exports/main/module/types/imports 仍只修改 staged package.json，不修改源 manifest；root CUA exports 不被变成虚构 dist 路径。应由同一个 manifest surface helper 供 preflight 和 inclusion 决策使用，避免两份不同布局判断。

## 定向验收与交付限制

先在旧 collector 复现 missing-dist 以及 root runtime 被遗漏，再实现。仅使用临时目录中的 fake workspace 与实际 CUA manifest/根文件的只读快照：确认 explicit root entry、compiled src entry、legacy fallback、缺失入口与按消费者的版本 placement；通过真实 collectSeaTuiAssets/stageSeaPackageAssets 检查 root/subpath/private 文件齐全、manifest/文件摘要和源 manifest 未写、dist 保留与 maps/src/test/scripts 排除。目标 Linux/Windows layout 可用假的 native package 作 fixture，不执行真实 driver 或 native binary，不宣称平台运行验收。

生产修复在 CLI 范围直接提交原分支/draft。新 tests 需要加入 root `scripts/test-studio.mjs` 的显式列表；该共享文件只提供精确最小 patch 供整合者处理，不擅自编辑。frozen evidence/source inventory 同样由整合者更新。

本批不执行完整 distribution/SEA/archive build、root/full CLI build、lint、完整 typecheck、整库回归、全量审计或 Windows/macOS/UI 验收。必要 collector fixture 通过只证明此入口/资产边界修复，最终发行归档及 distribution-smoke 仍待整合阶段重建。
