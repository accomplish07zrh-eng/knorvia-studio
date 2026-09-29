<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP凭据配对与命名空间验收

2026-09-29。按[先行合同](../specs/knorvia-mcp-credential-pair.md)独立替换两模块，不主动改变行为。原store继续拥有持久化与CAS，refresh/interactive继续各自拥有锁与授权副作用。公开常量、类型、函数arity、单批读写、exact-raw guard及弱legacy迁移选择保持；没有新缓存、锁、配置迁移、UI或真实数据改动。

根先完成15组自有观察，再为合同审阅的四项问题完成7组访问顺序和3组谓词观察。作者只按批准行为与公开声明先写设计、再完成新表达，不读旧正文/历史/测试/观察/bundle，也未执行候选；其编译器输入与已有上下文限制见[来源依据](../licensing/evidence/mcp-credential-pair.md)。

71项先行用例在根读取候选前编写，覆盖namespace原值、实时版本集合、浅谓词、raw与generation、单次批量快照、发布字段/序列化顺序、原生时间值、exact-raw条件失效、弱legacy表、引用与拒绝身份。

- 旧冻结正文 **71/71**，1588.5673ms。
- 冻结首候选 **71/71**，1580.0587ms，无运行反馈后修订。
- 主仓旧源码 **71/71**，1559.8143ms；主仓新源码 **71/71**，1565.3318ms。
- 实际CLI可达dist **71/71**，1546.7936ms；两dist与CLI sourcemap内容逐字节一致，credentials三个常量/九个函数及namespace单一函数的导出与arity核验通过。以上运行零失败、跳过、取消。

测试准备首轮严格类型出现4处throw-only getter推断void与声明不合；仅补显式返回类型后通过，原稿/失败日志保留。首次从主仓cwd lint仓外路径，工具因路径不在root而panic（-1073740791）；改用该隔离目录cwd后5文件94规则通过。publication测试随后按主题分为snapshot和publication两文件，断言未删改。首次整合辅助脚本的Markdown反引号转义错误发生在任何主仓写入前，修正准备件后才整合。这些准备失败不是产品运行失败，亦未隐藏为首次通过。

主仓根类型含desktop main与5422中英文键、根lint2784文件0警告0错误、CLI类型及lint97文件0/0、五测试strict ES2025/noUncheckedIndexedAccess、七文件94规则lint、架构0违例及八文件格式全部通过。CLI目录未纳入受控模块，另人工核对公开类型入口、native crypto/util边界、无新状态owner和store唯一写入路径。

CLI构建 **17/17**、12缓存、26.126秒，使用本地已核验Cua归档。credentials dist SHA-256为f344624274ad255df62ff6715a9bf470c92bd4fc4a00d8eb60deef094b068bd4；namespace为aea0e9d7d96e6a5d25eea8a084f163274c666c402673c2254d82b63a1e010bb5。构建后完整离线 **3,351/3,351**、0失败/跳过/取消，516264.6927ms；Node24.14.0，明确Python绝对路径并关闭编译缓存。全量运行期间主仓代码/测试冻结。

新源290行（255+35），旧366行，净减76行。未验证真实凭据/OAuth端点、收费模型或桌面包。本批未替换其余OAuth、shared lock、SDK或credential store；root Apache、仍适用权利和preview身份保持。全量独立替换与最终稳定包/官网尚未完成。本轮远端新鲜度检查一度因GitHub TLS握手失败，后续单独记录最终同步结果。

原始GitHub run [36531446327](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36531446327)，受检5e8d80a：Linux **3,273通过、7平台跳过、0失败/取消**，231511.506319ms；Windows **3,279通过、1失败、0跳过/取消**，325955.6907ms。类型、lint、格式、架构及构建等前置步骤成功，创作时钟相关用例通过。Windows失败是办公插件资源测试指定的Python3.13.15绝对路径执行 --version，在10000ms预算内未返回；诊断elapsed10364.1093ms、ETIMEDOUT、status=null、SIGTERM、pid5632、stdout/stderr为空，插件脚本未启动。没有回退解释器、扩大预算、重跑原始CI或把该失败改记通过，实际启动原因仍未确认。

本批来源清单 **8,012项、283独立替换、402自有新增、2,496条摘要复核**，问题与缺失0；仍有2,155上游未改、2,327上游修改与1,036未审文件。计数为当前内容复核范围，不能据此把整仓提前改为MIT。

收尾首次全仓格式检查在5,275文件中发现来源reviews.json一处排版未规范，退出1；保留此结果，随后仅格式化记录文件再复核。再次远端新鲜度检查成功：main相对origin/main为ahead0/behind0，前次TLS失败不改记为通过。
