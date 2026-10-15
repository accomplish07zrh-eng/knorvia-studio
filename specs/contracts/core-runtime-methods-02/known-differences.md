# core-runtime-methods-02 已知差异与边界裁定（v1）

> 契约草案发布前已确认的差异，修复阶段照此办理；调整须在 PR 中列明理由。

## KD-1（承接 methods-01，尾巴）：rewind 成功落账载荷形状

- **计划**：合同与测试只锁「rewind 分派**错误冒泡**」语义（methods-01 B26）。rewind **成功**
  落账的载荷形状当时没有黑盒观察面。
- **本包处置**：`turn-model-step-*` 与会话落账链路无直接读取面——**成功载荷形状以
  `fixtures/rewind-success-payload.json` 实测录制**（由旧实现在验证装置中触发 rewind 成功路径
  采集），契约测试以「旧实现真值」金样断言（`KD-1 rewind 成功落账载荷金样`）。录制口径：
  时间戳/会话标识符号化脱敏，字段形状与值域逐字节保持。
- **遗留**：无（本包收口后 KD-1 两面——错误冒泡 + 成功载荷——都有断言）。

## KD-2（承接 methods-01，收口）：`providerMetadata.recoveredFromStreamFailure` 直接观察面

- **计划**（methods-01 KD-2）：`recoveredFromStreamFailure` 仅作传参流转，无黑盒观察面，
  直接观察留本包（turn-model-step 消费侧）。
- **本包处置（收口）**：观察缝 = `turn-model-step-records.ts` 的 `logTurnModelDiagnostics`
  ——诊断日志的 `providerMetadataKeys: objectKeys(result.providerMetadata)` 使该 flag 在
  模型步诊断面**可观测**（behavior **B34** 钉值）。契约用例
  `KD-2 providerMetadata.recoveredFromStreamFailure 观察面` 断言：恢复标记存在时
  `providerMetadataKeys` 含 `"recoveredFromStreamFailure"`、缺失时不含；并断言 B33 错误路 1
  的恢复分支把 `state.pendingStreamRecoveryRequest` 读后清空（一次性语义）。
- **遗留**：无（methods-01 的 KD-2 至此双面收口：传参（#180）+ 观察（本包））。

## KD-3（新）：`buildProviderUsageTokenOverride` 的历史归一化边界

- **差异**：usage 归属已提交 assistant，反向扫描随 history replacement 自然移动；
  「output 是否存在」可能被历史归一化抹平——此时 provider input 只覆盖 assistant 之前的请求、
  assistant 本身仍进本地增量（源码注释即契约，behavior B52 钉值）。
- **裁定**：合同按注释口径断言 `incrementalStartIndex` 双分支与 `tokenCount = base +
  incremental`；不承诺扫描到的 assistant 一定携带 output。
