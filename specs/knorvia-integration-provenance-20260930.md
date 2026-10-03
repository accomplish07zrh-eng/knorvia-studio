# 并行切片整合与输入来源绑定

2026-09-30。整合设备身份/完整文件系统、services session 三叶模块、shared wire 三叶模块及进程采样 QA 修复，各原提交先审查并保留为独立 cherry-pick。不得将集成测试通过或兼容重写改标为 MIT；旧 source exposure、Apache、部分第三方范围与全部 notices 保留。

`third-party/inventory.json.inputs` 是当前实际构建输入的新鲜度门。修改 wire-codec 时，先让旧绑定失败，再保存输入前后摘要、行为规格/冻结测试/原独立提交和原第三方范围；只对这一实际改动更新输入绑定。`copied` 的历史来源/摘要、Microsoft 声明、publisher license 和未决材料不改变。当前 input hash 不作为 publisher exact-match，也不消除该文件上游关系。

进程首次 50 项门未覆盖同步事件循环阻塞、重复根、小数 tick 取整、无空白单位这四项。整合追加原 QA 8 个失败/通过用例证据和当前产物；不改写历史通过结果为更广证明。整合 source/dist、真实消费者、必要全回归与最新 SHA CI 分开记录。无新依赖、UI/数据格式/迁移、合并/发行或部署。
