// SPDX-License-Identifier: Apache-2.0
import type { KnorviaCopy } from "../types.js";

/** en-US 目录。所有人类可读文案都是自写表述，参数位置与语义见 behavior.md B8。 */
export const enUS: KnorviaCopy = {
  locale: "en-US",
  cli: {
    errors: {
      localeUnsupported: (value) =>
        `The value "${value}" is not a locale this build knows. Pick one of: en-US, zh-CN, auto.`,
    },
    help: (version) => buildHelp(version),
  },
  tui: {
    copy: {
      copied: "The highlighted text is now on the clipboard.",
      failed: "The highlighted text could not be copied.",
      unavailable: "This terminal has no text clipboard integration.",
    },
    effort: {
      disabled: "off",
      enabled: "on",
    },
    input: {
      activeStatusHint: "press esc to stop",
      busyPlaceholder: "Write here to line up another message",
      placeholder: "Write a prompt",
      queuedMore: (count) => `and ${count} besides that`,
      queuedSubmitHint: "Goes out once the running tool returns.",
      queuedTitle: (count) => ` Waiting: ${count} `,
      title: "Prompt",
      noHistorySource: "No history provider is wired up.",
      noPreviousInput: "Nothing earlier was recorded for this workspace.",
      restoredPreviousInput: "Your previous prompt is back.",
      restoredPreviousInputWithAttachments: (count) =>
        `Your previous prompt is back, together with ${count} attachment(s).`,
      restorePreviousInputFailed: "The previous prompt could not be brought back.",
      typePrompt: "Write your question, then hit Enter.",
    },
    modelConfigurationRequired: {
      help: "An API key is still missing. Add one under the Knorvia Studio model settings, or run /model to see what is on offer.",
      message:
        "An API key is still missing. Add one under the Knorvia Studio model settings, or run /model to see what is on offer.",
      status:
        "An API key is still missing. Add one under the Knorvia Studio model settings, or run /model to see what is on offer.",
      title: "model credentials are missing",
    },
    model: {
      requestFailed: (message) => `The model call did not go through: ${message}`,
      responseReceived: "The model has answered.",
      responseReceivedWithTokens: (tokens) => `The model has answered, using ${tokens} tokens.`,
      retryScheduled: ({ attempt, delay, maxAttempts, reason }) =>
        `Attempt ${attempt}/${Math.max(1, maxAttempts - 1)} of the model call starts in ${delay}; reported cause: ${reason}`,
      streamStalled: "The model stream has gone quiet.",
    },
    sidebar: {
      subagents: {
        title: "Delegated agents",
        empty: "Nothing has been delegated yet.",
        emptyOutput: "This subagent has written nothing yet.",
        back: "← back to the main thread",
        readonly: "View only · press Esc to leave",
        loading: "Fetching the subagent's output…",
        unavailable: "The subagent's output cannot be read right now.",
        retry: "Try again",
        more: "fetch the rest",
        pendingMain: "The main thread is waiting on you — switch back to answer",
        ended: (count) => `Finished: ${count}`,
        status: {
          running: "working",
          waiting: "awaiting input",
          blocked: "held up",
          success: "finished",
          failed: "broke",
          cancelled: "called off",
          lost: "out of touch",
        },
      },
      api: {
        empty: "No provider calls have been made.",
        model: "Model id",
        more: (count) => `and ${count} besides`,
        requests: "Calls",
        server: "Endpoint",
      },
      cache: {
        hit: "served from cache",
        lastHit: "newest cache hit",
        lastMiss: "newest cache miss",
        readWrite: ({ read, write }) => `${read} taken from cache / ${write} put into it`,
        total: "in total",
      },
      context: {
        cache: "Cached",
        cacheReadWrite: "cache in/out",
        inputOutput: "in/out",
        reason: "Thinking",
        tokens: "Token count",
        used: "Occupied",
        window: "Capacity",
      },
      modifiedFiles: {
        empty: "The workspace has not changed yet.",
        more: (count) => `and ${count} besides`,
      },
      mcp: {
        empty: "No MCP servers are set up.",
        loadFailed: "The MCP status could not be read.",
        loading: "Reading MCP status…",
        more: (count) => `and ${count} besides`,
        servers: "MCP servers",
        status: {
          connected: "live",
          connecting: "dialling",
          disabled: "switched off",
          disconnected: "not live",
          failed: "broke",
          untrusted: "not trusted",
        },
        summary: ({ connected, total }) => `${connected}/${total} MCP servers live`,
        tools: (count) => (count === 1 ? `${count} available tool` : `${count} available tools`),
      },
      request: {
        complete: "done",
        error: "failed",
        errorWithStatus: (statusCode) => `failed with HTTP ${statusCode}`,
        pending: "in flight",
      },
      status: {
        last: "Newest",
      },
      run: {
        draft: "Unsent",
        draftChars: (count) => `${count} characters`,
        draftEmpty: "nothing written",
        messages: "Turns",
        mode: "Permissions",
        model: "Model name",
        provider: "Vendor",
        thought: "Reasoning",
        trace: "Trace id",
        turn: "Round",
        workspace: "Work folder",
      },
      sections: {
        apis: "Provider calls",
        context: "Window",
        mcp: "MCP servers",
        modifiedFiles: "Touched files",
        run: "This run",
        status: "State",
        todos: "Checklist",
      },
      shellSubtitle: "shell built on OpenTUI",
      title: "Side panel",
      todos: {
        empty: "The checklist is empty.",
        more: (count) => `and ${count} besides`,
        progress: "Done so far",
      },
    },
    status: {
      compactFailed: "The conversation could not be compressed.",
      compacted: "The conversation has been compressed.",
      compacting: "Compressing the conversation…",
      interruptedStreamDiscarded: "The half-arrived model stream was thrown away.",
      modelCalling: "Waiting on the model…",
      permissionRequested: (toolName) => `Approval is needed before ${toolName} can run.`,
      permissionResolved: (toolName) => `Approval for ${toolName} has been settled.`,
      ready: "Standing by.",
      recoveringStream: "Reconnecting to the interrupted model stream…",
      retryingStream: "Starting the model stream again…",
      sessionResumed: "The session continues where it left off.",
      targetChanged: (action) => `The goal was ${action}.`,
      thinking: "Reasoning…",
      toolCompleted: (toolName) => `${toolName} finished.`,
      toolFailed: (toolName) => `${toolName} failed.`,
      toolPending: (toolName) => `${toolName} is queued.`,
      toolRunning: (toolName) => `${toolName} is running.`,
      turnFailed: "This round did not finish.",
    },
    terminal: {
      requiresInteractive: "The TUI only runs inside an interactive terminal.",
      starting: "Bringing up Knorvia Studio… press Ctrl+C to leave",
    },
    transcript: {
      compact: {
        completed: "The conversation was compressed",
        failed: "Compression did not succeed",
        interrupted: "Compression was cut short",
        retry: (command) => `Press Ctrl-R to run ${command} again`,
        retrying: ({ attempt, maxAttempts }) =>
          maxAttempts > 0 ? `Compressing again (${attempt}/${maxAttempts})` : "Compressing again",
        skipped: "Nothing to compress: the conversation is already current",
        started: "Compression has started",
      },
      roles: {
        agent: "Assistant",
        system: "System",
        user: "You",
      },
      thought: {
        complete: "Reasoning",
        thinking: "Reasoning…",
      },
      title: "Conversation",
      workflow: {
        actors: "participants:",
        actorRow: ({ name, status }) => `${name} (${status})`,
        usage: ({ spentTokens }) => `${spentTokens} tokens spent`,
        collapsed: ({ label, status, nodesSettled, nodesTotal }) =>
          `Run "${label}" is ${status} (${nodesSettled}/${nodesTotal} steps settled)`,
        error: (message) => `failed with: ${message}`,
        expandHint: "press + to unfold",
        collapseHint: "press - to fold",
        log: "events:",
        nodes: ({ nodesSettled, nodesTotal }) =>
          `${nodesSettled}/${nodesTotal} steps settled so far`,
        result: (preview) => `output: ${preview}`,
        status: {
          completed: "finished",
          errored: "failed",
          pending: "not started",
          running: "in progress",
          stopped: "halted",
        },
        stopReason: {
          user: "halted by you",
          model: "halted by the assistant",
          provider: "vendor-side error",
          interrupted: "the process went away",
          superseded: "replaced by a newer run",
        },
        truncated: "(cut short — the run journal keeps the whole story)",
        interruptedNotice: ({ label, runId }) =>
          `Run "${label}" was cut short. To pick it up again: /dwf resume ${runId}`,
      },
    },
    selection: {
      defaultHelp: "Enter takes it, Esc backs out",
      disabled: (reason) => ` [not available: ${reason}]`,
      filterLine: ({ filter, help }) =>
        `narrowed by "${filter || "-"}" | ${help ?? "Enter takes it, Esc backs out"}`,
      noFilter: "-",
    },
    fileMention: {
      empty: "No workspace path fits that.",
      loading: "Reading workspace paths…",
      row: ({ path, selected }) => `${selected ? ">" : "·"} ${path}`,
      title: "Paths",
    },
    slash: {
      title: "Slash commands",
      row: ({ name, selected, summary }) => `${selected ? ">" : "·"} /${name} — ${summary}`,
    },
  },
};

/** 帮助正文按段落拼装，命令与选项清单与 CLI 实际注册表一致。 */
function buildHelp(version: string): string {
  return `Knorvia Studio Agent ${version}

How to call it:
  knorvia [command] [options]

Called without a command, knorvia takes over the screen with its TUI.

Commands you can run:
  app-server  Serve the Knorvia Studio Protocol over stdio
  commands    Show the custom slash commands you defined (\`commands list\`)
  doctor      Report on the runtime and how the build was packaged
  plugins     Handle plugins and marketplaces (\`plugins list|install|uninstall|enable|disable|update|validate|marketplace ...\`; also spelled plugin)
  skills      Show the skills installed here (\`skills list\`)
  tui         Take over the screen with the terminal UI
  version     Report the CLI version

Flags:
  -h, --help       Print this text
  -v, --version    Report the version
  -p, --prompt <text>  Send one prompt and exit instead of opening the TUI
  --memory-bench   Together with --prompt, run automatic Memory extraction and wait for it before exiting (Memory must be on)
  --browser-use <mode>  Choose the Browser Use backend (the supported value is headless)
  --surface <surface>  Where headless prompts and app-server render: terminal or desktop
  --browser-executable <path>  Chrome/Chromium binary used by headless Browser Use
  --attach <path>  Add a local file to --prompt; pass it again for more files
  --cwd <path>     Run the command as if started in this directory
  --disallowed-tools, --disallowedTools <tools...>
    Drop whole tools for this prompt/TUI run; nothing is written to saved settings.
    Separate names with commas or spaces, for example "Bash Edit".
    "Bash(git *)" still drops all of Bash; command patterns are never matched.
  --force-mcs      Force mid-conversation system projection for Anthropic vendors
  --locale <locale>  Language of the UI: en-US, zh-CN, or auto
  --mode <mode>    Permission mode for prompts: build, edit, plan, or yolo (yolo is the default for --prompt)
  --resume <sessionId>  Continue a stored session by its sessionId (sess_...)
  --target <text>  Run, or set, the session goal while headless
  --target-replace  Overwrite a goal that --target set earlier
  -c, --continue        Continue the newest session of this directory
  --json           Emit machine-readable JSON where a command supports it
  --no-color       Strip ANSI colours
  --verbose        Narrate what the CLI is doing

Slash commands:
  /help [command]       Print help for a slash command
  /compact [instructions]  Compress the conversation so far
  /expert [status|resume|stop|<task>]  Run, or steer, the expert workflow
  /dwf [list|cancel|resume]  List, cancel, or resume dynamic workflow runs
  /fork [latest|checkpointId]  Branch a new session off a workspace checkpoint
  /mcp [list|status|connect|disconnect]  Inspect or operate MCP servers
  /mode [mode]          Read or change the permission mode: build, edit, plan, or yolo
  /model [id]           Read or change the model of this session
  /new                  Begin a new session inside the TUI
  /resume [sessionId]   Continue a session by sessionId; leave it out for the newest one here
  /rewind [latest|checkpointId]  Show the newest checkpoint, or restore workspace files
  /skill [name] [task]  List skills, or make the next prompt load a particular one
  /goal [action]        Read or set the goal of this session
`;
}
