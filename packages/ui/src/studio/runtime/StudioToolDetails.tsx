import type { StudioMessage } from "@knorvia/services";

/** 只展示 Host 投影，不从整轮状态推断单个工具成功，也不把输入猜成输出。 */
export function StudioToolDetails({ message, zh }: { message: StudioMessage; zh: boolean }) {
  const states: Record<string, string> = zh
    ? {
        running: "执行中",
        succeeded: "已完成",
        completed: "已完成",
        failed: "失败",
        cancelled: "已停止",
        interrupted: "已中断",
        unknown: "未知",
        denied: "已拒绝",
        waiting: "等待确认",
        queued: "排队中",
      }
    : {
        running: "Running",
        succeeded: "Completed",
        completed: "Completed",
        failed: "Failed",
        cancelled: "Stopped",
        interrupted: "Interrupted",
        unknown: "Unknown",
        denied: "Denied",
        waiting: "Waiting",
        queued: "Queued",
      };
  const fields = [
    ["input", zh ? "输入" : "Input"],
    ["output", zh ? "输出" : "Output"],
    ["content", zh ? "内容（原生类型）" : "Content (native types)"],
    ["statusDetail", zh ? "状态说明" : "Status detail"],
  ] as const;
  const detailed = fields.some(([key]) => message[key] !== undefined);
  const legacy = !fields.slice(0, 3).some(([key]) => message[key] !== undefined) && message.text;
  return (
    <details
      data-studio-message-id={message.id}
      className="min-w-0 rounded-lg border border-border px-3 py-2 text-ui-sm"
    >
      <summary className="cursor-pointer break-words text-foreground-subtle">
        {message.name}
        {message.state
          ? ` · ${states[message.state] ?? `${zh ? "未知" : "Unknown"} (${message.state})`}`
          : ""}
      </summary>
      {detailed ? (
        fields.map(
          ([key, label]) =>
            message[key] !== undefined && (
              <section key={key} data-tool-field={key} className="mt-2 min-w-0">
                <p className="font-medium">{label}</p>
                <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words">
                  {message[key] || (zh ? "（空）" : "(empty)")}
                </pre>
              </section>
            ),
        )
      ) : (
        <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words">
          {message.text}
        </pre>
      )}
      {detailed && legacy && (
        <section data-tool-field="legacy" className="mt-2 min-w-0">
          <p className="font-medium">{zh ? "历史详情" : "Legacy detail"}</p>
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words">{legacy}</pre>
        </section>
      )}
    </details>
  );
}
