// SPDX-License-Identifier: Apache-2.0
import type { KnorviaCopy } from "../types.js";

/** zh-CN 目录。与 en-US 逐键同构；文案为自写表述，语义见 behavior.md B8。 */
export const zhCN: KnorviaCopy = {
  locale: "zh-CN",
  cli: {
    errors: {
      localeUnsupported: (value) =>
        `「${value}」不是本版本认识的界面语言。可选：en-US、zh-CN、auto。`,
    },
    help: (version) => buildHelp(version),
  },
  tui: {
    copy: {
      copied: "已把选中的文本放进剪贴板。",
      failed: "选中的文本没能复制成。",
      unavailable: "这个终端不支持复制文本。",
    },
    effort: {
      disabled: "关",
      enabled: "开",
    },
    input: {
      activeStatusHint: "按 esc 中止",
      busyPlaceholder: "先写下来，排队等这一轮结束",
      placeholder: "写下提示词",
      queuedMore: (count) => `另外还有 ${count} 条`,
      queuedSubmitHint: "当前工具返回后就会发出。",
      queuedTitle: (count) => ` 待发：${count} `,
      title: "提示词",
      noHistorySource: "没有配置历史来源。",
      noPreviousInput: "这个工作区还没有更早的记录。",
      restoredPreviousInput: "上一条提示词已经取回。",
      restoredPreviousInputWithAttachments: (count) =>
        `上一条提示词已经取回，连带 ${count} 个附件。`,
      restorePreviousInputFailed: "上一条提示词没能取回。",
      typePrompt: "写完问题后按 Enter。",
    },
    modelConfigurationRequired: {
      help: "还缺 API Key。请到 Knorvia Studio 的模型设置里补一个，或输入 /model 看看有哪些可选。",
      message:
        "还缺 API Key。请到 Knorvia Studio 的模型设置里补一个，或输入 /model 看看有哪些可选。",
      status:
        "还缺 API Key。请到 Knorvia Studio 的模型设置里补一个，或输入 /model 看看有哪些可选。",
      title: "模型凭据还没配好",
    },
    model: {
      requestFailed: (message) => `模型请求没走通：${message}`,
      responseReceived: "模型已经作答。",
      responseReceivedWithTokens: (tokens) => `模型已经作答，用掉 ${tokens} tokens。`,
      retryScheduled: ({ attempt, delay, maxAttempts, reason }) =>
        `第 ${attempt}/${Math.max(1, maxAttempts - 1)} 次尝试将在 ${delay} 后开始；上报原因：${reason}`,
      streamStalled: "模型的流式输出停住了。",
    },
    sidebar: {
      subagents: {
        title: "委派的代理",
        empty: "还没有派出任何子代理。",
        emptyOutput: "这个子代理还没写出内容。",
        back: "← 回到主对话",
        readonly: "只读 · 按 Esc 离开",
        loading: "正在取子代理的输出…",
        unavailable: "暂时读不到子代理的输出。",
        retry: "再试一次",
        more: "取剩下的",
        pendingMain: "主对话在等你回话，切回去处理",
        ended: (count) => `已收尾：${count}`,
        status: {
          running: "干活中",
          waiting: "等输入",
          blocked: "卡住了",
          success: "已收尾",
          failed: "出错",
          cancelled: "被叫停",
          lost: "失去联系",
        },
      },
      api: {
        empty: "还没有发起供应商调用。",
        model: "模型 ID",
        more: (count) => `另外 ${count} 条`,
        requests: "调用",
        server: "接入点",
      },
      cache: {
        hit: "命中缓存",
        lastHit: "最近一次命中",
        lastMiss: "最近一次没命中",
        readWrite: ({ read, write }) => `从缓存取 ${read} / 写回 ${write}`,
        total: "合计",
      },
      context: {
        cache: "缓存情况",
        cacheReadWrite: "缓存进/出",
        inputOutput: "进/出",
        reason: "思考",
        tokens: "Token 数",
        used: "已占",
        window: "容量",
      },
      modifiedFiles: {
        empty: "工作区还没发生变化。",
        more: (count) => `另外 ${count} 个`,
      },
      mcp: {
        empty: "没有配置 MCP server。",
        loadFailed: "读不到 MCP 状态。",
        loading: "正在读 MCP 状态…",
        more: (count) => `另外 ${count} 个`,
        servers: "MCP 服务",
        status: {
          connected: "在线",
          connecting: "接入中",
          disabled: "已关掉",
          disconnected: "不在线",
          failed: "出错",
          untrusted: "未获信任",
        },
        summary: ({ connected, total }) => `${connected}/${total} 个 MCP 服务在线`,
        tools: (count) => `${count} 个可用工具`,
      },
      request: {
        complete: "已完成",
        error: "出错",
        errorWithStatus: (statusCode) => `出错，HTTP ${statusCode}`,
        pending: "等结果",
      },
      status: {
        last: "最近",
      },
      run: {
        draft: "未发出",
        draftChars: (count) => `${count} 字符`,
        draftEmpty: "还没写",
        messages: "轮次",
        mode: "权限",
        model: "模型名称",
        provider: "供应商",
        thought: "推理",
        trace: "Trace 号",
        turn: "轮",
        workspace: "工作目录",
      },
      sections: {
        apis: "供应商调用",
        context: "窗口",
        mcp: "MCP 服务",
        modifiedFiles: "改动文件",
        run: "本次运行",
        status: "当前状态",
        todos: "清单",
      },
      shellSubtitle: "基于 OpenTUI 的终端",
      title: "侧栏",
      todos: {
        empty: "清单还是空的。",
        more: (count) => `另外 ${count} 项`,
        progress: "已完成",
      },
    },
    status: {
      compactFailed: "对话没能压缩。",
      compacted: "对话已经压缩。",
      compacting: "正在压缩对话…",
      interruptedStreamDiscarded: "半截的模型流已经丢掉。",
      modelCalling: "正在等模型…",
      permissionRequested: (toolName) => `要跑 ${toolName} 得先获批。`,
      permissionResolved: (toolName) => `${toolName} 的批准已经处理。`,
      ready: "待命。",
      recoveringStream: "正在接回中断的模型流…",
      retryingStream: "正在重新开始模型流…",
      sessionResumed: "Session 从上次的地方接着走。",
      targetChanged: (action) => `目标已${action}。`,
      thinking: "推理中…",
      toolCompleted: (toolName) => `${toolName} 结束了。`,
      toolFailed: (toolName) => `${toolName} 失败了。`,
      toolPending: (toolName) => `${toolName} 在排队。`,
      toolRunning: (toolName) => `${toolName} 正在跑。`,
      turnFailed: "这一轮没走完。",
    },
    terminal: {
      requiresInteractive: "TUI 只能在交互式终端里跑。",
      starting: "正在启动 Knorvia Studio… 按 Ctrl+C 离开",
    },
    transcript: {
      compact: {
        completed: "对话已压缩",
        failed: "压缩没成功",
        interrupted: "压缩被打断了",
        retry: (command) => `按 Ctrl-R 再跑一次 ${command}`,
        retrying: ({ attempt, maxAttempts }) =>
          maxAttempts > 0 ? `再次压缩（${attempt}/${maxAttempts}）` : "再次压缩",
        skipped: "不用压缩：对话已经是最新的",
        started: "压缩已经开始",
      },
      roles: {
        agent: "助手",
        system: "系统",
        user: "你",
      },
      thought: {
        complete: "推理",
        thinking: "推理中…",
      },
      title: "对话",
      workflow: {
        actors: "参与者：",
        actorRow: ({ name, status }) => `${name}（${status}）`,
        usage: ({ spentTokens }) => `花掉 ${spentTokens} tokens`,
        collapsed: ({ label, status, nodesSettled, nodesTotal }) =>
          `运行「${label}」${status}（已结算 ${nodesSettled}/${nodesTotal} 步）`,
        error: (message) => `失败于：${message}`,
        expandHint: "按 + 展开",
        collapseHint: "按 - 收起",
        log: "事件：",
        nodes: ({ nodesSettled, nodesTotal }) => `已结算 ${nodesSettled}/${nodesTotal} 步`,
        result: (preview) => `输出：${preview}`,
        status: {
          completed: "已收尾",
          errored: "出错了",
          pending: "还没开始",
          running: "进行中",
          stopped: "已停",
        },
        stopReason: {
          user: "你叫停的",
          model: "助手叫停的",
          provider: "供应商侧出错",
          interrupted: "进程没了",
          superseded: "被更新的运行替代",
        },
        truncated: "（已截断——完整经过在运行日志里）",
        interruptedNotice: ({ label, runId }) =>
          `运行「${label}」被打断了。要继续：/dwf resume ${runId}`,
      },
    },
    selection: {
      defaultHelp: "Enter 选中，Esc 退出",
      disabled: (reason) => ` [不可用：${reason}]`,
      filterLine: ({ filter, help }) =>
        `筛选「${filter || "-"}」 | ${help ?? "Enter 选中，Esc 退出"}`,
      noFilter: "-",
    },
    fileMention: {
      empty: "没有合适的工作区路径。",
      loading: "正在读工作区路径…",
      row: ({ path, selected }) => `${selected ? ">" : "·"} ${path}`,
      title: "路径",
    },
    slash: {
      title: "斜杠命令",
      row: ({ name, selected, summary }) => `${selected ? ">" : "·"} /${name} — ${summary}`,
    },
  },
};

/** 帮助正文：段落与 CLI 注册表一致，选项按字母序排列。 */
function buildHelp(version: string): string {
  return `Knorvia Studio Agent ${version}

调用方式:
  knorvia [command] [options]

不带 command 时，knorvia 会用全屏 TUI 接管终端。

可用命令:
  app-server  通过 stdio 提供 Knorvia Studio Protocol 服务
  commands    列出你自己定义的自定义斜杠命令（\`commands list\`）
  doctor      报告运行时与打包情况
  plugins     管理插件与市场（\`plugins list|install|uninstall|enable|disable|update|validate|marketplace ...\`；也可写作 plugin）
  skills      列出本机安装的 skills（\`skills list\`）
  tui         用终端界面接管屏幕
  version     报告 CLI 版本

可用选项:
  -h, --help       打印本段说明
  -v, --version    报告版本
  -p, --prompt <text>  只发一条提示词就退出，不打开 TUI
  --memory-bench   与 --prompt 同用，跑一次自动 Memory 提取并等它结束再退出（需已开启 Memory）
  --browser-use <mode>  选择 Browser Use 后端（当前支持 headless）
  --surface <surface>  无头提示词与 app-server 的呈现面：terminal 或 desktop
  --browser-executable <path>  无头 Browser Use 使用的 Chrome/Chromium 可执行文件
  --attach <path>  给 --prompt 附上一个本地文件；要多个就多传几次
  --cwd <path>     把命令当作在该目录下启动
  --disallowed-tools, --disallowedTools <tools...>
    只对本次提示词/TUI 运行移除整个工具，不写入已保存的设置。
    名字用逗号或空格分隔，例如 "Bash Edit"。
    "Bash(git *)" 仍然会移除整个 Bash；从不按命令内容匹配。
  --force-mcs      对 Anthropic 供应商强制启用 mid-conversation system 投影
  --locale <locale>  界面语言：en-US、zh-CN 或 auto
  --mode <mode>    提示词的权限模式：build、edit、plan 或 yolo（--prompt 默认 yolo）
  --resume <sessionId>  按 sessionId 接着已有的 session 走（sess_...）
  --target <text>  在无头模式下运行或设置 session 目标
  --target-replace  覆盖 --target 之前设置过的目标
  -c, --continue        接着本目录最新的 session
  --json           在支持的命令里输出机器可读的 JSON
  --no-color       去掉 ANSI 颜色
  --verbose        讲清 CLI 正在做什么

斜杠命令:
  /help [command]       打印某个斜杠命令的说明
  /compact [instructions]  压缩到目前为止的对话
  /expert [status|resume|stop|<task>]  运行或调整 expert workflow
  /dwf [list|cancel|resume]  列出、取消或恢复 dynamic workflow 运行
  /fork [latest|checkpointId]  从工作区 checkpoint 派生出新 session
  /mcp [list|status|connect|disconnect]  查看或操作 MCP server
  /mode [mode]          查看或修改权限模式：build、edit、plan 或 yolo
  /model [id]           查看或切换本 session 的模型
  /new                  在 TUI 里开始一个新 session
  /resume [sessionId]   按 sessionId 接着走；省略则用这里最新的
  /rewind [latest|checkpointId]  查看最新 checkpoint，或恢复工作区文件
  /skill [name] [task]  列出 skills，或让下一条提示词加载指定的那个
  /goal [action]        查看或设置本 session 的目标
`;
}
