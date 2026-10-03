<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# ComfyUI 双帧 CI 超时诊断

原始 [CI #185](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36678100951) 检查恢复分支 `b096355bcb8890d0834d065dccdcc80f7389b2fa`：Linux 全部成功；Windows 来源、类型、lint、格式、架构、CLI 构建通过，离线回归 **3838 项 = 3837 通过 + 1 失败 + 0 跳过/取消**，502973.313ms。

唯一失败是 `packages/services/test/creation-polish.test.ts` 的 ComfyUI 双帧上传/占位用例：原 1000ms 终态预算后仍 running，状态 queued@1ms → running@12ms；67 次公共 getJob 读取，最长14.8ms。原日志未记录上传、提交、history 或下载入口，因此首因尚未定位；不能由先前 #184 成功断言这一问题已经修复，也不重跑覆盖首次失败。

新增测试专用内存 trace 记录八个固定阶段的进入/响应构造后返回、计数及最多16个单调耗时事件。timeoutContext 只在原终态失败时追加投影，不读内部状态文件、不保存帧内容、请求体、凭据、URL 或个人路径。history 进入只见证此前 providerTaskId await 已完成，缺席标记 unobserved。纯回归证明重复计数、进入/返回差别、事件上限和 checkpoint 见证；创作用例原成功状态、两帧、占位、真实存储、1ms供应商轮询和1000ms/10ms终态预算保持。

本地定向 **14/14** 通过。该结果验证诊断接线，不能证明云端首因或产品缺陷已修复。生产 CreationService、供应商实现、业务截止、付费重试和用户数据未改；原失败与后续 CI 分开记录。依赖/资产仍由并行只读核验提供证据，不重复该审计。
