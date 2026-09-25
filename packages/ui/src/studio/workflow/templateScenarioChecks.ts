import { STUDIO_OUTPUT_REF_VERSION } from "@knorvia/services";
import type { TemplateScenario } from "./templateScenarioTypes.js";

/** 发版前检查：只核对，不发布；证据不足即未验证。 */
export const releaseCheckScenario: TemplateScenario = {
  id: "releaseCheck",
  paramText: {
    version: {
      label: { zh: "目标版本号", en: "Target version" },
      hint: {
        zh: "要核对的发布版本，会与实际版本文件比对。",
        en: "The release version to verify against the version files.",
      },
    },
    scope: {
      label: { zh: "检查范围", en: "Check scope" },
      hint: {
        zh: "逗号分隔：tests、build、version、changes。",
        en: "Comma separated: tests, build, version, changes.",
      },
    },
    project_dir: {
      label: { zh: "项目目录", en: "Project directory" },
      hint: { zh: "工作区内的相对路径。", en: "A path inside the workspace." },
    },
    include_pending: {
      label: { zh: "包含待提交改动", en: "Include pending changes" },
      hint: { zh: "true 或 false。", en: "true or false." },
    },
  },
  steps: [
    {
      key: "checks",
      kind: "agent",
      label: { zh: "检查发布条件", en: "Check release readiness" },
      params: [
        { name: "version", type: "text", required: true },
        { name: "scope", type: "text", default: "tests,build,version,changes" },
        { name: "project_dir", type: "text", default: "." },
        { name: "include_pending", type: "boolean", default: "true" },
      ],
      outputNames: ["release-evidence", "release-blockers"],
      permission: "ask",
      prompt: {
        zh: "核对版本 {{param.version}}：在项目目录 {{param.project_dir}} 内逐项实际执行 {{param.scope}} 覆盖的检查（测试、构建、版本一致性、待提交改动；是否包含待提交改动：{{param.include_pending}}），逐项记录实际命令、退出码与原始输出。缺失、跳过或失败的检查原样报告，不得推断为通过。本步骤只做只读核对：不要修改版本文件，也不要运行发布、打标签或推送（npm publish / pnpm publish / git tag / git push 一律禁止）。",
        en: "Check version {{param.version}}: inside {{param.project_dir}}, actually run each check covered by {{param.scope}} (tests, build, version consistency, pending changes; include pending changes: {{param.include_pending}}), recording every command, exit code, and raw output. Report missing, skipped, or failing checks as they are; never infer a pass. This step is read-only inspection: do not edit version files and never publish, tag, or push (npm publish / pnpm publish / git tag / git push are forbidden).",
      },
    },
    {
      key: "risks",
      kind: "agent",
      label: { zh: "整理发布风险", en: "Summarize release risks" },
      outputNames: ["release-checklist"],
      permission: "ask",
      prompt: {
        zh: "根据 {{ref.release-evidence}} 与 {{ref.release-blockers}} 整理发布风险：列出阻断项、回退建议和需要人工确认的清单。每一条都引用上一步的命令证据；没有证据的项标注「未验证」，不得把未运行的检查写成通过。",
        en: "From {{ref.release-evidence}} and {{ref.release-blockers}}, summarise release risks: blockers, rollback considerations, and the checklist a human must confirm. Cite the command evidence from the previous step for every item; mark anything without evidence as unverified and never report an unrun check as passing.",
      },
    },
    {
      key: "confirm",
      kind: "approval",
      label: { zh: "人工确认发布条件", en: "Confirm release readiness" },
      prompt: {
        zh: "人工确认发布条件：只有阻断项已处理、且每项检查都能指出实际命令证据时才批准。批准只表示可以进入人工发布流程；本工作流不发布、不推送、不打标签。",
        en: "Confirm release readiness: approve only when every blocker is addressed and each check points to real command evidence. Approval only means a human may start the release; this workflow never publishes, pushes, or tags.",
      },
    },
  ],
  exampleInput: {
    zh: "发布 0.8.0-preview.2：按参数核对测试、构建、版本与待提交改动。",
    en: "Release 0.8.0-preview.2: verify tests, build, version, and pending changes.",
  },
  normal: {
    state: "succeeded",
    resultKnown: true,
    input: {
      zh: "发布 0.8.0-preview.2：按参数核对测试、构建、版本与待提交改动。",
      en: "Release 0.8.0-preview.2: verify tests, build, version, and pending changes.",
    },
    errorKind: "none",
    steps: [
      {
        key: "checks",
        status: "succeeded",
        resultKnown: true,
        version: STUDIO_OUTPUT_REF_VERSION,
        text: "pnpm test → 412 passed；pnpm build → exit 0；package.json 版本 0.8.0-preview.2 与目标一致。",
        outputs: [
          {
            kind: "text",
            name: "release-evidence",
            text: "pnpm test (exit 0, 412 passed); pnpm build (exit 0); version 0.8.0-preview.2 matches package.json.",
          },
          { kind: "text", name: "release-blockers", text: "none" },
        ],
      },
      {
        key: "risks",
        status: "succeeded",
        resultKnown: true,
        version: STUDIO_OUTPUT_REF_VERSION,
        text: "阻断项：无。回退：重新发布上一版本包并撤回变更说明。",
        outputs: [
          {
            kind: "text",
            name: "release-checklist",
            text: "1. 人工确认 CHANGELOG；2. 人工执行发布与打标签；3. 发布后核对下载源。",
          },
        ],
      },
      { key: "confirm", status: "succeeded", resultKnown: true, text: "approved" },
    ],
  },
  failure: {
    state: "failed",
    resultKnown: true,
    input: {
      zh: "发布 9.9.9：项目目录不存在。",
      en: "Release 9.9.9: the project directory does not exist.",
    },
    errorKind: "check-could-not-run",
    steps: [
      {
        key: "checks",
        status: "failed",
        resultKnown: true,
        error: "项目目录不存在：pnpm test 与 pnpm build 均未执行，无法给出证据。",
      },
      {
        key: "risks",
        status: "failed",
        resultKnown: true,
        error: "上游步骤失败，未产出风险清单。",
      },
      {
        key: "confirm",
        status: "failed",
        resultKnown: true,
        error: "上游步骤失败，无内容可确认。",
      },
    ],
  },
};

/** 代码审查：节点声明只读执行要求；内核不能保证只读时在排队前被拒绝。 */
export const codeReviewScenario: TemplateScenario = {
  id: "codeReview",
  paramText: {
    target_paths: {
      label: { zh: "审查路径", en: "Target paths" },
      hint: { zh: "逗号分隔的文件或目录。", en: "Comma separated files or directories." },
    },
    severity: {
      label: { zh: "最低严重程度", en: "Minimum severity" },
      hint: { zh: "low、medium 或 high。", en: "low, medium, or high." },
    },
  },
  steps: [
    {
      key: "inspect",
      kind: "agent",
      label: { zh: "审查代码改动", en: "Review code changes" },
      params: [
        { name: "target_paths", type: "text", required: true },
        { name: "severity", type: "text", default: "medium" },
      ],
      outputNames: ["review-findings", "review-gaps"],
      // 只读是执行要求：内核没有真实只读沙箱时在排队前拒绝整次运行，而不是派发后降级。
      permission: "read-only",
      prompt: {
        zh: "只读审查 {{param.target_paths}}，只报告不低于 {{param.severity}} 的问题：给出文件与行号、问题类别（正确性／安全／兼容性），以及能复现它的实际命令或工具调用与原始输出。不要修改、创建或删除任何文件，也不要在项目里写临时文件。无法复现的怀疑标注「未验证」，不得写成已确认缺陷。",
        en: "Review {{param.target_paths}} read-only and report only issues at or above {{param.severity}}: file and line, category (correctness/security/compatibility), and the actual command or tool call with raw output that reproduces it. Do not modify, create, or delete any file and do not write temporary files into the project. Mark anything you cannot reproduce as unverified; never present it as a confirmed defect.",
      },
    },
    {
      key: "summary",
      kind: "agent",
      label: { zh: "汇总审查结论", en: "Summarize findings" },
      outputNames: ["review-report"],
      permission: "read-only",
      prompt: {
        zh: "核对 {{ref.review-findings}} 与 {{ref.review-gaps}}：按严重程度整理问题、建议的测试和仍需人工确认的事项。保留每个问题的原始证据，无法复现的条目继续标注「未验证」。",
        en: "Check {{ref.review-findings}} and {{ref.review-gaps}}: organise issues by severity, plus suggested tests and open questions. Keep the original evidence for each issue and keep anything unreproduced marked as unverified.",
      },
    },
  ],
  exampleInput: {
    zh: "审查本次改动：src 与 packages/ui，只保留 medium 及以上的问题。",
    en: "Review the current changes in src and packages/ui, medium severity and above only.",
  },
  normal: {
    state: "succeeded",
    resultKnown: true,
    kernel: "codex",
    input: {
      zh: "审查本次改动：packages/ui/test，medium 及以上（内核 codex，具备只读沙箱）。",
      en: "Review packages/ui/test at medium and above (codex kernel with a read-only sandbox).",
    },
    errorKind: "none",
    steps: [
      {
        key: "inspect",
        status: "succeeded",
        resultKnown: true,
        version: STUDIO_OUTPUT_REF_VERSION,
        text: "2 处 medium：……（各附 git diff 与复现命令）。",
        outputs: [
          {
            kind: "text",
            name: "review-findings",
            text: "medium packages/ui/test/a.test.ts:42 — 断言未覆盖失败分支（复现：pnpm exec vitest run a.test.ts）。",
          },
          { kind: "text", name: "review-gaps", text: "无；未复现怀疑项：0。" },
        ],
      },
      {
        key: "summary",
        status: "succeeded",
        resultKnown: true,
        version: STUDIO_OUTPUT_REF_VERSION,
        text: "按严重程度排序的审查报告：2 条 medium，均含复现命令。",
        outputs: [
          {
            kind: "text",
            name: "review-report",
            text: "medium×2（均附复现命令）；建议测试：覆盖失败分支；未验证项：0。",
          },
        ],
      },
    ],
  },
  failure: {
    state: "failed",
    resultKnown: true,
    kernel: "knorvia",
    errorKind: "read-only-unsupported",
    // 由 validateStudioWorkflowPermissions 生成：只读要求不能排队，且不产生任何步骤记录。
    errorPattern: "requires read-only, but knorvia cannot guarantee it; the run was not queued\\.",
    input: {
      zh: "审查本次改动（内置 knorvia 内核，无强制只读沙箱）。",
      en: "Review the current changes (bundled knorvia kernel without a read-only sandbox).",
    },
    steps: [],
  },
};
