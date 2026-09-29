<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# MCP认证请求验收

2026-09-29。依照[先行规格](../specs/knorvia-mcp-official-auth.md)独立替换请求认证边界：入口拥有来源准入、init请求事实、凭据尝试、单次重试与终态通知；响应伴随拥有诊断投影、限量读取、分类和丢弃。共享header策略、信任注册、凭据提供器与实际传输保留原有依赖所有者，不新增凭据持久化或缓存。UI与用户数据未改。

根和合同准备者完整读过旧563行及公开接口；根完整复核合同和三份有限声明，核对实际类型来源。源作者与测试作者分别只读取七份初始批准材料，另收录工厂名称的单独澄清；先设计后分别实现，未互读源码或测试。根完整审阅六份测试/设计/报告并先运行旧实现，然后才完整审阅候选两源/设计/报告并运行同一套断言。运行阶段没有反馈改稿。

| 对象          | 首次结果               |    耗时ms |
| ------------- | ---------------------- | --------: |
| old           | 34/34；0失败/跳过/取消 | 2886.8079 |
| candidate     | 34/34；0失败/跳过/取消 | 3120.1226 |
| main-old      | 34/34；0失败/跳过/取消 |  2916.329 |
| main-source   | 34/34；0失败/跳过/取消 | 3089.0148 |
| main-compiled | 34/34；0失败/跳过/取消 | 3128.0245 |

34项分为准入6、请求7、响应7、重试7、错误7。包含捕获与live输入、init-only Request事实、动态header覆盖及保留/关联header删除顺序、tools/call绕过诊断、64KiB含边界读取、诊断优先级、响应释放等待、只重试一次与同步回调/日志异常的归属。测试不检查私有状态，保留现有不支持的重放、未主动取消及未屏蔽回调异常等边界。

测试使用自有registry/resolver/shared-helper/logger/callback/fetch/Date；普通限量正文使用原生URL、Request、Headers、Response、Buffer、TextDecoder，超限/失败/取消用自有reader，避免原生tee无限等待。3秒watchdog只约束测试门闩。没有真实凭据、MCP或网络。主仓六测试保留原断言，只增加MIT头、可移植入口映射，以及fixture对三个实际shared helper的Pick类型约束。

源首轮parse/format/94规则lint成功，strict类型首次TS2322；保留原稿和首次格式后文本，仅给已通过准入的origin加类型断言，最终全部静态检查通过。两次compiler program各196输入：2候选、2批准声明、192标准/第三方，其他产品正文0。测试首轮严格类型和94lint成功，首次7文件格式失败；原稿和原日志保留，格式化后全部通过。测试compiler实际readFile221路径，首版审计是编译器读入文本hash，最终版改为原字节hash，审计修正不改变测试行为。

根/CLI类型、根lint2784文件0/0、CLI lint97文件0/0和architecture0违例首次通过。根typecheck包括desktop main与5422中英文键。主仓额外strict测试类型首次TS2740：有限三helper夹具被声明为实际整个shared模块；只收窄为Pick，保留首次失败及修正收据。之后strict类型、八文件94规则lint0/0、九目标格式通过；CLI构建17/17，12缓存，26.35秒。原成功检查没有为凑次数重复运行。

两份实际CLI可达dist与bundle sourcemap逐字节一致：entry 11349字节，SHA-256 aea64cd8a485d8bf14d24aacf001cd8a458a580665797b2809971b02c4e13227；response 3155字节，SHA-256 b08bd04fbb5915d89b12c69b4eb9e2c306c852c286a5c99dd2c1ba5d7081f73e。上述34项在这些确切产物运行通过，含最终fixture类型修正。完整离线 **3,576/3,576**，0失败/跳过/取消，533359.1466ms；Node24.14.0、pnpm10.33.2、本地Cua归档与Python绝对路径，关闭编译缓存，回归期间主仓源/测试冻结。

两源331+84=415物理行，308/71有效行均低于400，共14618字节；旧563行23750字节。CLI未纳入受控架构模块，根另人工复核公开导出、直接共享helper再导出身份、依赖方向和单一状态所有者。保留的风险包括mutable请求事实、正文重放、诊断字节限制无时间截止、等待取消可能阻塞、同步logger/回调可覆盖异常、tools/call按协议约定绕过诊断。未验证真实凭据/外网、原生溢出tee取消、完整CLI交互或桌面安装程序。

首次远端新鲜度检查遇到GitHub TLS失败，保留原日志；相同TLS验证未禁用，经本机已有代理重试actual fetch成功，ahead/behind均0。根Apache、依赖权利与preview保持；本批不表示全量替换、整仓MIT或最终发行完成。来源见[逐文件依据](../licensing/evidence/mcp-official-auth.md)。

前一连接池提交 `ea6d871207d75be3bd5e1de5830eaf5dd8be2a9e` 的 [GitHub Actions 原运行 36550479739](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36550479739) attempt 1 已完成。Linux job `109347152283`：3,542 项中 3,535 通过、7 项平台跳过、0 失败/取消，198118.522381ms；Windows job `109347152006`：3,542/3,542，0 失败/跳过/取消，408446.0289ms。根核对原 run/jobs 的受检 SHA、全部步骤和原日志末尾统计，两个 job 均 success。这是前一连接池提交的云端结果，不算当前认证请求批次 CI；更早提交的 Python 启动超时失败仍保留。
