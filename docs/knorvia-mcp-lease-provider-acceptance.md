<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP授权锁与运行期令牌提供器验收

2026-09-29。按[先行规格](../specs/knorvia-mcp-lease-provider.md)独立替换两模块。公共六个runtime导出、arity、路径与锁预算、pending显示投影及exact-raw CAS、provider捕获配置与实时读取分工保持。共享锁、凭据store和refresh服务继续分别拥有副作用；无UI、真实数据、重复状态、额外缓存或重试改动。

根读取旧正文/公开声明与有限调用点，完成53组自有观察；首轮锁成功trace误用了随后被修改的数组，已保留并明确无效，另一次原生path/random观察复制trace后核实两次锁调用。合同审阅补充“锁取得后random失败不额外release”与“有效JSON数组不获得清理权限”，前者是旧正文核实，并非实际native random故障实验。作者先设计后按批准合同编写，输入与来源限制见[依据](../licensing/evidence/mcp-lease-provider.md)。

71项用例在根阅读首候选前写成：旧冻结 **71/71**、5911.9002ms；首候选 **71/71**、5938.6252ms。随后根完整内容审阅发现code getter重复读取，新增3项变化getter验收：旧 **74/74**、6188.6513ms，首候选 **71通过、3失败**、6163.9626ms。作者仅获得行为澄清，保留首稿，修订锁分类为一次读取；provider字节不变。修订候选 **74/74**、6066.3058ms。不能把这次修订称为无运行反馈的首次通过。

主仓旧/新源码分别 **74/74**、5876.7075/5818.4204ms；实际CLI可达dist **74/74**、5768.7713ms，零失败/跳过/取消。两个dist与实际CLI sourcemap内容逐字节一致。授权锁dist SHA-256为1eae8a9cd620399260257f369a353b87c13cc7309896901eb450bc127d091a49；provider为6ae4c3dcf255409af6a40d98c8f0b32510ef7eabb4fd3da13772e827e0490e42。多数依赖为自有可控端口；另有自有临时目录调用真实保留锁API，验证第二owner排斥、释放后重获，不宣称跨进程崩溃恢复或实网OAuth验证。

测试准备首次strict检查因SDK onUnauthorized声明要求ctx参数出现5处TS2554；保留首稿后补传自有ctx，仍断言运行方法arity0且不调用其中fetch。首次运行准备错误地从根package解析shared/node，MODULE_NOT_FOUND发生在测试前，改从adapters公开包入口解析后执行。主仓质量辅助脚本首次误用旧变量名的参数展开，仅输出pnpm用法、exit1；修正仓外脚本并另存日志后，实际检查才执行。这些准备失败与首候选3项行为失败均保留。

根类型含desktop main及5422中英文键、根lint2784文件0警告0错误、CLI类型/lint97文件0/0、四测试strict/noUncheckedIndexedAccess、六文件94规则lint、架构0违例、七文件格式全部通过。CLI目录尚非受控模块，另人工核对公开shared/contracts入口、原有单一状态/写入owner和依赖方向。CLI构建 **17/17**、12缓存、26.072秒，使用已核验本地Cua归档。

本机全局pnpm外层启动器固定Node26；进程核验确认其转交的项目pnpm与检查使用Node24.14.0，后续完整测试入口直接绑定Node24与已缓存pnpm10.33.2，避免依赖全局启动器。完整离线 **3,425/3,425**、0失败/跳过/取消，519518.9563ms；关闭编译缓存并指定Python绝对路径，主仓代码/测试在该运行期间冻结。

新源191行，旧241行，净减50行。未验证实网OAuth、真实凭据、收费模型、桌面安装/便携包。本批未替换refresh、其他MCP宿主、共享锁和存储实现；root Apache、适用第三方权利及preview身份保持。全量独立替换、最终稳定发行与官网仍未完成。

原始GitHub run [36533441310](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36533441310)，受检c2a68cc、attempt1：Linux job109292048556为 **3,344通过、7平台跳过、0失败/取消**，188380.914481ms；Windows job109292048802为 **3,351/3,351通过、0失败/跳过/取消**，362399.5849ms。两job与其前置检查均成功。这是后续凭据配对提交的原始运行，不是5e8d80a的重跑；前次Python --version超时仍记为失败，原因未确认。只读调查没有证据将其归因为路径、权限、DLL、杀毒或负载，也没有据此扩大超时、回退解释器或改变测试。
