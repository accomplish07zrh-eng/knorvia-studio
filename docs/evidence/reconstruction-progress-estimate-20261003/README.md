# Knorvia 全量重构进度：只读阶段估算

结论：已发布实现草稿的可审计覆盖代理约18%–25%，可以概括为「约两成」。若必须报总工程量，15%–30%是包含功能粒度、代码体量与整合成本不确定性的宽估计；父线程暂估20%–30%的低端有支撑，30%没有直接计数依据。这不是577个独立完成owner，也不是MIT／完整验收完成率。

快照只取已发布PR8/9/10/11/12，head分别23e0a85d／6470e414／bb45cbbf／0a36f716／dd963aae；完整SHA和Git-tree／merge-base元数据已保存。五PR当前全部draft且未合并。没有读取受阻私有backup，没有恢复／导入root未发布工作，没有运行测试、构建或新增作者、改变生产源码／配置／全局licensing。

| 阶段 | 最有支撑的结论 |
|---|---|
| 已发布实现草稿覆盖 | 大约18%–25%的源码文件／体量代理，约两成；全量工程20%–30%只能是宽推断，不能算精确完成率。 |
| 最低技术验证 | 多个功能owner已通过专项synthetic/API等最低gate；缺少统一、逐digest绑定的全量owner通过清单，不能可信换算全量百分比。部分semantic/consumer依赖仍阻塞，native/full-suite未完成。 |
| 最终整合／完整验收 | 本轮五PR合并0/5，均为draft；尚无跨路整合、全产品/native/full验收完成证据。不能把「本轮未整合」说成整个已有产品0%完成。 |
| 剩余来源／材料义务 | 剩余21项全部OPEN，本轮这21项关闭0/21；不具备最终MIT发布结论。 |

生产源码口径：apps/cli/packages或packages下含/src/的ts/tsx/js/jsx/mjs/cjs，剔除.test./.spec./__tests__/evidence。提交次数、文档／证据数量、测试文件不进分子。配置、声明／固定公共表达式可能仍在源码代理中；不能强迫其重写或授予原创credit。

| 已发布PR | 去重前生产源码差异路径 |
|---|---:|
| 8（E） |79|
| 9（G，含6470e414 Host index） |123|
| 10（D） |152|
| 11（A） |184|
| 12（root） |42|
| 五路去重并集 |577|

独立核验与父线程577及每PR计数完全一致。166路径是相对各自merge-base新增的源码文件，可能是原owner拆分出的私有helper／接口，不能当166个新增完成业务功能。父线程当前已发布ledger同口径4077项；本E保存ledger为4002项（upstream-modified2043、unchanged982、unreviewed524、independent438、original15）。父线程分类2072/960/592/438/15与本地不同，保留75项快照差异，不修改inventory／绕过私有checkpoint来对齐。

本地可审计算式：已有453独立／原创标签 +577已发布差异，标签与差异无路径重叠；其中409差异路径落在旧ledger、168不在旧ledger。旧分母内862/4002=21.54%；把新差异路径加入分母和分子为1030/4170=24.70%（只是覆盖上限，含helper）；旧ledger按bytes加权18.29%。577/约4千≈14%只是本轮差异触及范围，不等于全量工程已完成率。现有标签是旧来源／独立实现inventory，不是本轮全量重新验收／法律证明；修改过的文件也可能仅部分重构或保留大量旧表达式。

分布交叉检验：旧ledger中apps/cli1560、UI1460、services334、desktop256、shared227；当前五PR差异里UI源码0。CLI独立／原创标签441+发布差异276；services差异152、server45、RPC12、desktop41等说明后端进展显著，但不是整个桌面／UI重构接近完成。B6+本地workspace/grouped-task views没有进入已发布计数；当前A mcp/config、D权限三owner与root未提交网络draft不能额外计交付。Root仅dd963aae发布分支可计，私有checkpoint不可访问不视为恢复。

功能owner完成清单采用各已发布PR的qualified正文而非batch/commit数：E纯context/history/media/memory/MCP/workflow投影等；G传输/backend/assets/RPC/CLI/Host；Dservices生命周期/持久化/事件/CUA；A runtime/tool/workflow/parser/subagent/permission；root缓存/client/IPC/Host/window/chrome。完整scope和最低gate／semantic/native/rights限制在stage-and-owner-summary.json；PR正文快照仅为已发布自报证据，不替代逐源hash审计。无法建立完整功能owner分母，因而不捏造统一最低验证百分比。

初值修正已保存：直接比head和当前base顶端会把分支缺少的base变更错误计入；PR8/11实为diverged。正确merge-base分别bd0bb014／0d80f9ca，另外三路为f25b9311。撤回初始484existing／627total／923/4109比例，不再使用。第一次统计脚本else0语法错误在出数前修正，原脚本保留。当前数字来自正确merge-base元数据，只读，未呈现／审查compare返回的任何patch源码。

可信度：发布差异数量高，草稿工作量代理中等，功能加权总进度和完整技术／来源验收比例低／未建立。最有用的下一步是root整合按功能owner建立统一清单、处理HOLD／重叠和semantic/native验收，然后更新逐文件来源审查；本轮没有执行这些工作，也没有改变用户原配置／原对话。
