<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP连接池与租约验收

2026-09-29。依照[先行规格](../specs/knorvia-mcp-connection-pool.md)独立替换连接池，保留共享/隔离、租约绑定、探活并发、idle关闭及startup事实。pool.ts唯一管理连接与lease状态，pool-identity.ts只处理配置等价和新context投影，不持有缓存；实际连接/工具调用仍归adapter，事实通知仍归telemetry。UI、数据、模型或传输实现未改。

合同准备者与根完整读过旧464行和公开声明；根完整复核合同及三份有限声明，直接核对McpPort、Logger、TraceContext、branded ID与共享失败类型。源/测试作者分别在仓外读取七份批准初始材料，另记录startup求值补充合同，不互读候选与测试。两者均设计先行。根完整审阅六份先行测试/设计/报告，先运行旧源33项，再完整审阅候选两源/设计/报告并运行同一断言。没有运行反馈修订或放宽断言。

| 受检对象      | 首次结果               |    耗时ms |
| ------------- | ---------------------- | --------: |
| old           | 33/33；0失败/跳过/取消 | 2376.8046 |
| candidate     | 33/33；0失败/跳过/取消 | 2456.9094 |
| main-old      | 33/33；0失败/跳过/取消 | 2380.3007 |
| main-source   | 33/33；0失败/跳过/取消 | 2478.4241 |
| main-compiled | 33/33；0失败/跳过/取消 | 2484.6785 |

五组分别为共享配置6、创建/转交6、重验6、关闭8、快照7项。通过公开adapter复用、参数引用/receiver、回调顺序和门闩观察，不读取私有key/Map。包含并发单轮重验、原握手拒绝与重连结果、idle取消/立即关闭、关闭异常优先级、旧lease仍能操作、live快照及startup参数的optional求值范围。主仓只加MIT头和平台无关目标URL；源码与冻结候选逐字节一致，所有原断言保留。

使用自有adapter/logger/telemetry/Date/timer，native crypto在计数包装后仍原生生成UUID。bare/globalThis/global计时入口均接管；原生3秒watchdog只约束测试门闩，setImmediate仅用于等待原生Promise工作。没有真实MCP连接、OS进程、凭据或网络。两份实际CLI可达dist逐字节匹配bundle sourcemap：pool 13204字节、SHA-256 dfe6b90de413c762f5631346d799a4919052ae4fe947aef1cc09ac2f8d1f90e8；identity 1369字节、SHA-256 4ae1b27d9c5190f5275a5b8f7acdd3882872a620a9b62094ab27767442d34dcf。这是相同33项的精确产物模块验证，不是完整CLI交互或桌面包验收。

源首轮语法/strict类型/格式通过，94规则lint首次两条no-useless-spread警告，原稿与首次格式后版本均保留；改为给必要的bindings快照数组命名，维持快照语义，无规则屏蔽。最终全部通过。测试首轮strict/noUncheckedIndexedAccess及94lint0/0，首次格式8目标失败，首稿/原日志保留；仅格式化后最终静态全通过，未执行产品。源compiler program196输入为2候选+2批准声明+192标准/第三方声明、其他产品正文0；测试compiler readFile219为任务文件与自动类型/metadata，其计数口径单独保留。

根与CLI类型、根lint2784文件0/0、CLI lint97文件0/0、六测试strict、八源/测试94规则lint0/0、九目标格式、architecture0违例均首次通过。根typecheck包括desktop main与5422中英文键。CLI构建17/17，12缓存，26.223秒。完整离线 **3,542/3,542**，0失败/跳过/取消，527681.961ms；Node24.14.0、pnpm10.33.2、本地Cua归档和Python绝对路径，关闭编译缓存，回归期间主仓源/测试冻结。根静态审读产物证据辅助脚本时修正了模板替换误及sha256标识的笔误，错误版本未执行；未改产品/断言。

两源363+52=415行、12913+1783=14696字节，有效338/44均低于400；旧464行16858字节。CLI尚非受控架构模块，根另人工确认公开入口/type reexport、依赖方向及单一状态/IO owner。行数、MIT头与测试成功均不能单独证明独立来源。

既有限制保留：部分注册/引用失败不回滚；lease.close仅自身幂等且不await传输关闭，关闭后其他方法未设fence；pool.close只阻止新lease，不禁止旧端口重建；进行中探活不取消；重复pool.close不join先前close。未验证真实OS timer调度、外部MCP/网络、付费推理、安装/便携程序。根Apache及preview身份保持，整仓MIT、全量独立替换及最终发布未完成。来源见[依据](../licensing/evidence/mcp-connection-pool.md)。

前一提交 `492c4dbc5b3b6ee0616e67227e7b87e48fcffa3a` 的 [GitHub Actions 原运行 36547260847](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36547260847) attempt 1 已完成。Linux job `109336522877`：3,509 项中 3,502 通过、7 项平台跳过、0 失败/取消，183491.3806ms；Windows job `109336523052`：3,509/3,509，0 失败/跳过/取消，386886.4926ms。根核对原 jobs、受检 SHA、所有 steps 及下载日志末尾统计，两个 job 均 success。此为前一遥测替换提交的云端结果，不冒充本批连接池候选 CI；既往其他提交的 Python 超时失败记录仍保留。
