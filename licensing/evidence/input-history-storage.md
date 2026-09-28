<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 输入历史持久存储来源记录

2026-09-28，基线 `15c993f`。主代理与只读复核者先阅读原目标、公开端口及调用边界，提取[合同](../../specs/knorvia-input-history-storage.md)并运行旧版先行测试。冻结旧模块留在仓库外供有限对照；作者在单独目录编写，不允许访问旧目标、历史、dist/maps、冻结基线、先行测试或其他仓储正文。

## 允许输入与实际范围

允许输入仅本批合同，以及由主代理提取的 InputHistoryAttachment/Entry/Kind/RecordInputHistoryInput/RecallPreviousInputHistoryInput 公共声明、InputHistoryRow、encodeJson/decodeJson 和 withWriteTransaction 签名。Node DatabaseSync、Date 和 crypto API 可使用；表、列、固定排序及时间/错误规则是互操作合同。作者早前任务的上下文仍存在，未以全流程无源码接触表述本次过程。

作者实际完整读取准备合同 137 行、实现前澄清后合同 139 行及声明文件 62 行。主代理以文字澄清显式运行时 sessionID:null 的立即返回边界，并补充第二连接在预检后提交坏 JSON 的锁内读取失败验收；没有向作者发送旧函数、SQL 模板或测试正文。作者报告没有访问被排除的实现输入，其语法和有限替身检查只确认投影与调用阶段，不冒充原生 SQLite、事务或产品类型验收。

## 逐文件审查

本批替换 `repositories/input-history.ts`：由合同编写接受种类投影、完整行解码和同步查询路径，先只读排除当前重复，再在既有自有事务 owner 中复查并插入、裁剪。共享排序与绑定裁剪上限服务两个公开入口；事务清理继续由已审 helper 承担，不复制旧事务 catch，也不是把旧实现移到新路径。主代理核对作者输入、输出及表达组织，独立只读复核另外检查合同和原生错误边界。

作者冻结源码 121 行，主仓库仅格式化后 **129 行**，比旧 168 行净减 39。固定字段、标准 SQL、JSON 和必要返回键本身不主张新颖性；审查依据是先行行为合同、受限输入下的新表达与完整集成证据，不以简单函数改名、提取、长度或测试通过作为充分结论。

新规格、五份先行测试/夹具与事实记录由本轮编写。本批审查的独立表达纳入 MIT 并绑定实际摘要；其他模块和第三方不因此获得新声明。Node/SQLite 的许可与归属继续保留。完整验收和局限见[验收记录](../../docs/knorvia-input-history-storage-acceptance.md)；根 Apache-2.0 与预览版本维持。
