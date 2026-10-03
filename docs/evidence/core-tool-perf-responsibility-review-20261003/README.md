# tool-perf：职责核验与保留结论

Root 将精确路径 `apps/cli/packages/core/src/tool/handlers/tool-perf.ts` 分配给本路后，核对了旧接受记录、完整目标正文、公开 telemetry schema，以及5个直接调用方的有限 import/call 摘录。目标仍为5123字节、134行，SHA256 `282e3c0e15234bbc03c5d9ce1fc0549aaab699342b1e3e8fe0cef70622dba9e8`。来源登记仍为 upstream-modified / NOASSERTION；没有原始 rights 或 MIT 自动清零。

**保留现有源码，不生成替换候选。** 目标不是完整性能请求/input/result owner，也不是单纯的透传：它有实质性的有界命令摘要、隐私分类、耗时/字节计数、遥测字段投影/合并及非枚举属性附加职责，但不负责 request admission/validation、任务身份、调用执行、错误或取消。全文件11个同步导出，未定义 ToolEntry、性能运行入口或状态机；async/await token为0只作辅助静态观察，不单独用于推导纯度。

[精确行号、调用位置、来源/输入digest与检查记录](review.json)。Write/Edit使用耗时、字节与遥测附加；Bash/Bash-output使用分类、隐私身份及附加；invocation读取/合并遥测。未执行这些调用方，也未打开 parser/registry 的实现。公开 contracts/performance.ts 给出遥测结构与状态描述，并不将请求/执行责任转给此helper。

现有 licensing/reviews.json 精确路径无命中；current-files与旧allocation/screen精确记录只有来源/条件分配元数据，没有旧接受receipt。指定 receipt/review/reservation/accepted/candidate JSON 的路径搜索无匹配。**本地/公开缺项不能否定 root 私有或未发表历史**，没有访问这些私有文件。早先巨量文本搜索、完整screen打印及caller摘录发生截断；不把截断输出当作通过证据，随后用精确结构化记录和有限调用行号核验。

保留全部参数/返回/错误与取消边界，未改调用方、A instrumentation或native benchmark执行器。没有新增模块、候选或author；没有fake/real性能执行，也没有benchmark/process/tool/provider/network/真实用户文件调用。仓库remote基线核验仅为正常Git元数据操作。文档保留结论不需要运行native、全量测试或构建；旧缺失本地TypeScript架构失败保持原状态，不绕过或改称通过。

本轮0源代码修改、0完整owner新增；21项材料义务仍OPEN。若未来root另行分配“telemetry/privacy工具集完整owner”，再按该精确职责制作契约和完整冻结候选；本轮不扩展到executor/instrumentation/native benchmark。源暴露curator、历史更广暴露及修复过的scratch写入边界限定继续适用；无新隔离或clean-room主张。
