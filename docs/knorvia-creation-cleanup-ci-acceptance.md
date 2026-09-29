<!-- SPDX-License-Identifier: MIT; Copyright (c) 2026 Knorvia Studio contributors -->

# 创作幂等测试的后台收尾验收

2026-09-29。修正在原有测试加入受控响应和公开终态等待，并将已有模拟凭据换成明确的测试占位值。产品代码、请求幂等规则及任何业务截止时间均不变。

修复提交 `5cb937de59d69ce56d0a112331232a8daaec2942` 的[原始 GitHub run 36565784277](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36565784277) attempt 1 已通过。Linux job `109397223795`：3693 项，3686 通过、7 平台跳过、0 失败/取消，249357.276281ms；Windows job `109397223600`：3693 全部通过、0 失败/跳过/取消，390157.903ms。来源、冻结安装、类型、lint、格式、架构和 CLI 构建步骤均成功。完整原始日志已读取，raw-log JSON 摘要分别为 `df6eb338faf48da80bc044a20d034cecc9c8ea1bb3e2bb6bb20c2e4db4c25ede` 与 `b59349ccc1064122eed7d299dc753fb1251f9de7b71efd0a49dc304834b85fd2`。这次是修复提交的首次运行，未重跑或改写下面原提交的失败。

## 原始云端结果

MCP客户端提交822cfeecd7add20499bff86d220bebb18ea57c5b的[原始GitHub run36562935638](https://github.com/accomplish07zrh-eng/knorvia-studio/actions/runs/36562935638)，attempt1，两个job的前置质量步骤全部成功。Linux job109387890227：3693 total、3685 pass、1 fail、7平台skip、0 cancelled，250149.384849ms；唯一失败是creation-provenance的requestId幂等用例在清理目录时ENOTEMPTY。Windows job109387890371：3693/3693，0失败/跳过/取消，380443.887ms。没有重跑原job；Linux原失败仍保留。

两个完整raw-log JSON摘要分别为`8cfb4b0dc1c1275b2dd418d0d0aa72b360d2f4b3718923882d8145f2552ffbcb`、`e422af6f111b3572742003b0040e0f6791631d4b72ffc2784fe135fed5c8ae6d`。

## 原因与修正边界

CreateJob的公开回执只表明接纳，后台run仍会写成果与终态。原用例验证四组冲突拒绝及一次提交后，直接删临时目录，没有等待已接纳任务；其他邻近成功用例已有terminal等待。根完整读了该测试及相关服务的接纳/run/终态写入路径，未修改服务。

隔离诊断保留原用例全部幂等断言，仅用owned Promise门闩延后模拟供应商响应，并在原清理入口读取公开状态：running、outputs0、submissions1。随后放行并等待成功再清理。该诊断1/1，exit0，1845.1522ms；它确定存在缺少收尾的时序窗口，不声称复现云端精确ENOTEMPTY调度，也不将此前全部偶发失败归因于此。

修正保留原有断言，新增供应商开始通知，使幂等和冲突断言确实发生在同一请求运行中；finally无论断言成败均放行响应，使用既有公共getJob与原100次/20ms terminal预算等待成功，并核对PNG摘要与一次提交后才删目录。没有增加rm重试、吞错、扩大超时或访问服务私有字段。测试目录由mkdtemp创建并只由该用例使用；不触碰真实创作数据。

## 验证与来源

原文件SHA-256 `0c085bee581c1946fb2cc7218fdc0015a823b6dbfdad74e3b95bb58b9c2b89c0`；加入16行收尾时为`dd1a60f1e7f13c212f781f00e1058a794af635b7d2bfd36742091ccad17f92e0`；另将已有模拟凭据替换为明确占位值后为`2f7316219f2dd22d07a554df6be04ba0f2fe186dfeb641036f21fd04e6158945`。未改既有幂等或凭据脱敏断言；原文件现有来源分类和许可不因此改为MIT或独立替换。本说明为新编写的事实记录。

加入收尾后的主仓creation-provenance七项 **7/7**，0失败/跳过/取消，1906.6825ms；strict/noUnchecked类型、94规则lint0警告0错误、根类型（含desktop main、5422中英文键）、根lint2784文件0警告0错误、architecture changed0违例及两目标格式全部通过。后续仅替换模拟凭据后，定向脱敏用例 **1/1**，0失败/跳过/取消，1590.3809ms，日志SHA-256为`5d76a1d09cbfc11dcf86d7525660e543e985c7268d730e9f4b53863bbb16be33`。没有产品代码或构建输入变化，因此未重跑CLI构建及本地整仓3693项；修复提交的原始跨平台CI结果见本文开头。

首次暂存内容扫描使用默认gitleaks规则、完整七文件且不采用allow注释豁免，得到1项generic-api-key命中：原测试中从未联网使用的模拟凭据外形类似真实密钥。首次失败回执保留，SHA-256为`39ee1251f48889216231e2cd8dec5e4f0117c0fa53ed8aaac5c1dc3e2c6547ce`。该值现换成`fixture-only-key`，继续验证配置中的具体值不会进入记录、快照或错误；没有放宽扫描规则或移除脱敏断言。最终七文件共11154288字节重新扫描为0项、exit0后提交；补丁61150字节，SHA-256 `8cbe6b8901149e2dfcc032cadb967b23fc9471a71b40d23f69a2b91dc87624ad`。

证据：probe-receipt SHA-256 `83c9295817537c7624d14b507fc7194beee842b30187e213d80c5f3c51cf2e32`；诊断完整日志`e1276add252c47ea05a89ee49ea741bf2e39597bdf51bc01e0a839cba964ce87`；主仓七项日志`3bcc9e34e878dea6c779a6ca7288b657c3358a017aa057150a715c07192ba107`。服务实例、凭据Map、输入图片、供应商fetch和临时目录均属本测试；没有真实模型、网络请求、用户数据或安装包验收。
