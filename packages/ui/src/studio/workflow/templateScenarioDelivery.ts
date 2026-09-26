import { STUDIO_OUTPUT_REF_VERSION } from "@knorvia/services";
import type { TemplateScenario } from "./templateScenarioTypes.js";

/** 文档整理：先盘点，人工确认后才修正；删除与覆盖仍必须经逐文件差异审阅接受。 */
export const documentCleanupScenario: TemplateScenario = {
  id: "documentCleanup",
  paramText: {
    source_dir: {
      label: { zh: "文档来源目录", en: "Source directory" },
      hint: { zh: "工作区内的相对路径。", en: "A path inside the workspace." },
    },
    target_inventory: {
      label: { zh: "盘点目标清单", en: "Inventory target" },
      hint: { zh: "要盘点的目录或清单名。", en: "Directory or list name to inventory." },
    },
    max_items: {
      label: { zh: "盘点条目上限", en: "Inventory limit" },
      hint: {
        zh: "只盘点前 N 条，必须能解释成数字。",
        en: "Inventory at most N items; must be a number.",
      },
    },
  },
  steps: [
    {
      key: "inventory",
      kind: "agent",
      label: { zh: "盘点文档", en: "Inventory documentation" },
      params: [
        { name: "source_dir", type: "text", required: true },
        { name: "target_inventory", type: "text", default: "docs" },
        { name: "max_items", type: "number", default: "50" },
      ],
      outputNames: ["docs-inventory", "docs-deletions"],
      permission: "ask",
      prompt: {
        zh: "盘点 {{param.source_dir}} 里的文档，目标清单为 {{param.target_inventory}}，最多列出 {{param.max_items}} 条：找出重复、过期与断链，逐条给出具体文件路径、判断依据与实际执行过的检查命令。拟删除或覆盖的文件必须单独列出并说明理由；本步骤只盘点，不删除、不覆盖、不改名。",
        en: "Inventory documentation in {{param.source_dir}} against {{param.target_inventory}}, listing at most {{param.max_items}} items: duplicates, stale content, and broken links, each with the exact file path, the reason, and the command you actually ran. List any file you would delete or overwrite separately with its justification; this step only inventories — no deletes, overwrites, or renames.",
      },
    },
    {
      key: "acceptance",
      kind: "approval",
      label: { zh: "人工确认清单", en: "Confirm the inventory" },
      prompt: {
        zh: "人工确认盘点结果与删除清单：逐项检查 {{output}} 里的依据。只有批准后才进入修正步骤；即使批准，删除与覆盖仍必须在运行历史的逐文件差异审阅里单独「应用此文件」后才生效。",
        en: 'Confirm the inventory and deletion list: check each justification in {{output}}. Only approval admits the cleanup step; even then, deletes and overwrites take effect only after per-file "Apply this file" acceptance in the run history diff review.',
      },
    },
    {
      key: "cleanup",
      kind: "agent",
      label: { zh: "整理文档", en: "Clean up documentation" },
      outputNames: ["docs-changes", "docs-unverified"],
      permission: "ask",
      prompt: {
        zh: "依据已批准的 {{ref.docs-inventory}} 与 {{ref.docs-deletions}} 修正文档：只处理有证据支持的问题，保留事实来源与原始引用。删除或覆盖文件前必须说明它需要用户在运行历史的差异审阅里逐文件接受；不要把「已提出改动」写成「已应用」。无法核实的内容单独写入未核实清单。",
        en: "Apply the approved {{ref.docs-inventory}} and {{ref.docs-deletions}}: fix only issues with evidence, preserving sources and citations. Before deleting or overwriting a file, state that it requires per-file acceptance in the run history diff review; never describe a proposed change as applied. List anything unverifiable in the unverified list.",
      },
    },
  ],
  exampleInput: {
    zh: "整理 docs 目录：先盘点重复与断链，经我确认后再修正。",
    en: "Clean up the docs directory: inventory duplicates and broken links first, then fix after my confirmation.",
  },
  normal: {
    state: "succeeded",
    resultKnown: true,
    input: {
      zh: "整理 docs 目录：先盘点重复与断链，经我确认后再修正。",
      en: "Clean up the docs directory: inventory duplicates and broken links first, then fix after my confirmation.",
    },
    errorKind: "none",
    steps: [
      {
        key: "inventory",
        status: "succeeded",
        resultKnown: true,
        version: STUDIO_OUTPUT_REF_VERSION,
        text: "3 条：2 处重复段落，1 处断链；仅 1 个文件拟覆盖。",
        outputs: [
          {
            kind: "text",
            name: "docs-inventory",
            text: "docs/a.md:12 与 docs/b.md:8 重复（rg -n 取证）；docs/c.md:4 断链（链接检查命令输出）。",
          },
          {
            kind: "json",
            name: "docs-deletions",
            value: { overwrite: ["docs/a.md"], delete: [] },
          },
        ],
      },
      { key: "acceptance", status: "succeeded", resultKnown: true, text: "approved" },
      {
        key: "cleanup",
        status: "succeeded",
        resultKnown: true,
        version: STUDIO_OUTPUT_REF_VERSION,
        text: "已修正 docs/b.md 与 docs/c.md；docs/a.md 的覆盖需要在差异审阅里逐文件接受。",
        outputs: [
          {
            kind: "workspace-file",
            name: "docs-changes",
            runId: "fixture-run",
            stepId: "fixture-step",
            relativePath: "docs/b.md",
            sha256: "b".repeat(64),
          },
          {
            kind: "text",
            name: "docs-unverified",
            text: "docs/draft.md 的过期判断无命令证据，标注未验证。",
          },
        ],
      },
    ],
  },
  failure: {
    state: "failed",
    resultKnown: true,
    input: {
      zh: "整理 docs 目录：来源目录不存在。",
      en: "Clean up the docs directory: the source directory does not exist.",
    },
    errorKind: "inventory-could-not-run",
    steps: [
      {
        key: "inventory",
        status: "failed",
        resultKnown: true,
        error: "来源目录不存在，盘点命令未执行，无法给出清单依据。",
      },
      { key: "acceptance", status: "failed", resultKnown: true, error: "没有可确认的清单。" },
      { key: "cleanup", status: "failed", resultKnown: true, error: "未获批准，未修改任何文档。" },
    ],
  },
};

/**
 * 内容与插图交付包：文案/参考素材 → 创作节点 → 交付清单。
 * 创作节点出厂未选模型（`select-a-model`）：媒体无法真实产出时失败关闭，绝不发占位产物。
 */
export const contentPackScenario: TemplateScenario = {
  id: "contentPack",
  paramText: {
    topic: {
      label: { zh: "主题", en: "Topic" },
      hint: { zh: "这次交付要讲什么。", en: "What this delivery is about." },
    },
    audience: {
      label: { zh: "目标读者", en: "Audience" },
      hint: { zh: "例如 general 或 开发者。", en: "For example general or developers." },
    },
  },
  steps: [
    {
      key: "copy",
      kind: "agent",
      label: { zh: "写文案与参考素材", en: "Draft copy and references" },
      params: [
        { name: "topic", type: "text", required: true },
        { name: "audience", type: "text", default: "general" },
      ],
      outputNames: ["copy-draft", "reference-list"],
      permission: "ask",
      prompt: {
        zh: "为主题 {{param.topic}}（目标读者：{{param.audience}}）写一版文案草稿，并列出参考素材清单：每条素材给出真实文件路径或 URL，以及你实际用来读取它的命令或工具调用。找不到素材就写明缺失，不要编造来源或图片。产出草稿与清单两部分，作为交付包的输入。",
        en: "Draft the copy for {{param.topic}} (audience: {{param.audience}}) and list the reference material: every item with its real file path or URL plus the command or tool call you actually used to read it. If material is missing, say so; never invent sources or images. Produce both the draft and the list as inputs to the delivery pack.",
      },
    },
    {
      key: "illustration",
      kind: "creation",
      label: { zh: "生成插图", en: "Produce the illustration" },
      outputNames: ["illustration-output"],
      permission: "ask",
      // 出厂值刻意不是真实模型：未选择模型时创作步骤失败关闭，而不是产出假图。
      creationModelId: "select-a-model",
      prompt: {
        zh: "依据 {{ref.reference-list}} 生成插图，只使用创作服务返回的真实产物引用。若模型未配置、已停用或调用失败，本步骤必须失败并保留失败原因：不得用占位图、纯色块、内联 data: 图片或编造的文件路径冒充插图。需要参考图时，只在节点设置里指定项目内的真实图片路径。",
        en: "Produce the illustration from {{ref.reference-list}}, using only the real output returned by the creation service. If the model is missing, disabled, or fails, this step must fail with the reason — never substitute a placeholder, a colour block, an inline data: image, or an invented path. When a reference image is needed, set a real in-project image path in the node settings.",
      },
    },
    {
      key: "assembly",
      kind: "agent",
      label: { zh: "汇总交付包", en: "Assemble the delivery pack" },
      outputNames: ["delivery-pack", "pack-gaps"],
      permission: "ask",
      prompt: {
        zh: "汇总交付包：读取 {{ref.copy-draft}} 与 {{ref.illustration-output}}，产出最终文件清单与未核验项清单。只登记真实存在、能给出路径或哈希的产物；插图缺失或无法核验时把它标为「未验证（未产出）」，不得用占位内容代替，也不得把本次运行描述为完成的交付。",
        en: 'Assemble the delivery pack from {{ref.copy-draft}} and {{ref.illustration-output}} into a final file list plus an unverified list. Register only artefacts that exist and can be pointed to by path or hash; if the illustration is missing or unverifiable, mark it "unverified (not produced)" — never substitute placeholder content and never describe the run as a completed delivery.',
      },
    },
  ],
  exampleInput: {
    zh: "为新功能写一篇发布短文，配一张插图，交付可发布文件。",
    en: "Write a short release note for the new feature, add one illustration, and deliver publishable files.",
  },
  normal: {
    state: "succeeded",
    resultKnown: true,
    input: {
      zh: "为新功能写一篇发布短文，配一张插图，交付可发布文件（已配置图片模型）。",
      en: "Write a short release note for the new feature with one illustration (image model configured).",
    },
    errorKind: "none",
    steps: [
      {
        key: "copy",
        status: "succeeded",
        resultKnown: true,
        version: STUDIO_OUTPUT_REF_VERSION,
        text: "草稿 320 字；参考素材 2 条。",
        outputs: [
          { kind: "text", name: "copy-draft", text: "文案草稿：本次更新带来……" },
          {
            kind: "text",
            name: "reference-list",
            text: "docs/brief.md（读取：Get-Content docs/brief.md）；docs/brand.md（读取：Get-Content docs/brand.md）。",
          },
        ],
      },
      {
        key: "illustration",
        status: "succeeded",
        resultKnown: true,
        version: STUDIO_OUTPUT_REF_VERSION,
        text: "插图已产出。",
        outputs: [
          {
            kind: "creation-output",
            name: "illustration-output",
            runId: "run-fixture-1",
            creationJobId: "job-fixture-1",
            outputId: "out-fixture-1",
            fileName: "illustration.png",
            sha256: "c".repeat(64),
          },
        ],
      },
      {
        key: "assembly",
        status: "succeeded",
        resultKnown: true,
        version: STUDIO_OUTPUT_REF_VERSION,
        text: "交付包：文案 + 插图 + 使用说明。",
        outputs: [
          {
            kind: "text",
            name: "delivery-pack",
            text: "copy.md；illustration.png（sha256 已核验）；README.txt（使用说明）。",
          },
          { kind: "text", name: "pack-gaps", text: "无未核验项。" },
        ],
      },
    ],
  },
  failure: {
    state: "failed",
    resultKnown: true,
    input: {
      zh: "为新功能写一篇发布短文并配图（创作模型未配置，保持出厂设置）。",
      en: "Write a release note with an illustration (creation model unconfigured, factory settings kept).",
    },
    errorKind: "creation-model-unavailable",
    // 取自 `runExecutor.ts:71-73` 的创作前置检查；离线测试不执行该路径，故只锚定文案。
    errorPattern: "创作模型未配置或已停用",
    steps: [
      {
        key: "copy",
        status: "succeeded",
        resultKnown: true,
        version: STUDIO_OUTPUT_REF_VERSION,
        text: "草稿 300 字；参考素材 1 条。",
        outputs: [
          { kind: "text", name: "copy-draft", text: "文案草稿：本次更新带来……" },
          {
            kind: "text",
            name: "reference-list",
            text: "docs/brief.md（读取：Get-Content docs/brief.md）。",
          },
        ],
      },
      {
        key: "illustration",
        status: "failed",
        resultKnown: true,
        error: "创作模型未配置或已停用",
      },
      {
        key: "assembly",
        status: "failed",
        resultKnown: true,
        error: "插图未产出：本次运行没有交付包，插图标记为未验证（未产出）。",
      },
    ],
  },
};
