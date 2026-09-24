import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Check, Copy, LoaderCircle } from "lucide-react";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageAction,
  MessageActions,
} from "@/components/ai-elements/message.js";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning.js";
import { useKnorviaIntl } from "@/i18n/IntlProvider.js";
import { getConversationContentWidthClassName } from "@/v4/conversationLayout.js";
import { StudioKernelIcon } from "../agents/StudioKernelIcon.js";
import { useStudioKernelCatalog } from "../agents/useStudioKernelCatalog.js";
import { studioKernelOption } from "../types.js";
import { StudioInteractions } from "./StudioInteractions.js";
import { StudioRunHistory } from "./StudioRunHistory.js";
import { useStudioRuntime } from "./useStudioRuntime.js";
import { Button } from "@/components/ui/button.js";
import {
  captureStudioScrollAnchor,
  restoreStudioScrollAnchor,
  type StudioScrollAnchor,
} from "./studioScrollAnchor.js";

type TimelineProps = { targetId: string; showHistory?: boolean; showInteractions?: boolean };

export function StudioTimeline(props: TimelineProps) {
  const { connectionKey } = useStudioRuntime();
  return <StudioTimelineContent key={`${connectionKey}:${props.targetId}`} {...props} />;
}

function CopyMessage({ text, zh }: { text: string; zh: boolean }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <>
      <MessageAction
        label={copied ? (zh ? "已复制" : "Copied") : zh ? "复制" : "Copy"}
        onClick={async () => {
          if (pending.current) return;
          pending.current = true;
          setError("");
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1800);
          } catch {
            setError(zh ? "复制失败，请重试" : "Could not copy. Please try again.");
          } finally {
            pending.current = false;
          }
        }}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </MessageAction>
      {error && (
        <span role="alert" className="text-ui-xs text-destructive">
          {error}
        </span>
      )}
    </>
  );
}

function StudioTimelineContent({
  targetId,
  showHistory = true,
  showInteractions = true,
}: TimelineProps) {
  const runtime = useStudioRuntime(targetId);
  const { statuses } = useStudioKernelCatalog();
  const { locale } = useKnorviaIntl();
  const zh = locale.startsWith("zh");
  const scroll = useRef<HTMLDivElement>(null);
  const anchor = useRef<StudioScrollAnchor | undefined>(undefined);
  const loading = useRef(false);
  const [follow, setFollow] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const messages = runtime.timeline?.messages ?? [];
  const active = runtime.timeline?.runs.filter((run) =>
    ["running", "waiting", "queued"].includes(run.state),
  );
  const activity = active?.some((run) => run.cancelRequested)
    ? zh
      ? "正在停止"
      : "Stopping"
    : active?.some((run) => run.state === "running")
      ? zh
        ? "正在处理"
        : "Working"
      : active?.some((run) => run.state === "waiting")
        ? zh
          ? "等待回答或确认"
          : "Waiting for an answer or confirmation"
        : active?.length
          ? zh
            ? "排队中"
            : "Queued"
          : undefined;
  const toolStates: Record<string, string> = zh
    ? {
        running: "执行中",
        succeeded: "已完成",
        completed: "已完成",
        failed: "失败",
        cancelled: "已停止",
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
        denied: "Denied",
        waiting: "Waiting for approval",
        queued: "Queued",
      };
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    if (anchor.current) {
      restoreStudioScrollAnchor(el, anchor.current);
      if (!loadingOlder) anchor.current = undefined;
    } else if (follow) el.scrollTop = el.scrollHeight;
  }, [runtime.timeline, follow, loadingOlder]);
  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroll}
        className="h-full overflow-y-auto [overflow-anchor:none] [scrollbar-gutter:stable]"
        onScroll={(event) => {
          const el = event.currentTarget;
          if (loading.current) anchor.current = captureStudioScrollAnchor(el);
          else setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 100);
        }}
      >
        <div
          className={`mx-auto space-y-5 px-4 py-5 ${getConversationContentWidthClassName({ centeredEmptyLayout: false, statusPanelLayout: "none" })}`}
        >
          {runtime.timeline?.nextBefore !== undefined && (
            <Button
              variant="ghost"
              size="sm"
              disabled={loadingOlder}
              onClick={() => {
                if (loading.current) return;
                loading.current = true;
                const el = scroll.current;
                if (el) anchor.current = captureStudioScrollAnchor(el);
                setFollow(false);
                setLoadingOlder(true);
                void runtime.loadOlder().finally(() => {
                  loading.current = false;
                  setLoadingOlder(false);
                });
              }}
            >
              {loadingOlder && <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />}
              {zh ? "加载更早消息" : "Load earlier messages"}
            </Button>
          )}
          {messages.map((message) =>
            message.kind === "reasoning" ? (
              <Reasoning key={message.id} data-studio-message-id={message.id}>
                <ReasoningTrigger />
                <ReasoningContent>{message.text}</ReasoningContent>
              </Reasoning>
            ) : message.kind === "tool" ? (
              <details
                key={message.id}
                data-studio-message-id={message.id}
                className="rounded-lg border border-border px-3 py-2 text-ui-sm"
              >
                <summary className="cursor-pointer text-foreground-subtle">
                  {message.name}
                  {message.state ? ` · ${toolStates[message.state] ?? message.state}` : ""}
                </summary>
                <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words">
                  {message.text}
                </pre>
              </details>
            ) : message.kind === "progress" ? (
              <p
                key={message.id}
                data-studio-message-id={message.id}
                className="text-ui-sm text-foreground-subtle"
              >
                {message.text}
              </p>
            ) : (
              <Message
                key={message.id}
                data-studio-message-id={message.id}
                from={message.sender === "user" ? "user" : "assistant"}
              >
                {message.sender !== "user" && message.sender !== "system" && (
                  <div className="flex items-center gap-2 text-ui-sm text-foreground-subtle">
                    <StudioKernelIcon kernelId={message.sender} className="size-4" />
                    <span>{studioKernelOption(message.sender, statuses).name}</span>
                  </div>
                )}
                <MessageContent>
                  {message.sender === "user" ? (
                    <div className="whitespace-pre-wrap break-words">{message.text}</div>
                  ) : (
                    <MessageResponse>{message.text}</MessageResponse>
                  )}
                </MessageContent>
                <MessageActions>
                  <CopyMessage text={message.text} zh={zh} />
                </MessageActions>
              </Message>
            ),
          )}
          {activity && (
            <p role="status" className="flex items-center gap-2 text-ui-sm text-foreground-subtle">
              <LoaderCircle className="size-3.5 animate-spin" />
              {activity}
            </p>
          )}
          {showInteractions && <StudioInteractions targetId={targetId} />}
          {showHistory && <StudioRunHistory targetId={targetId} compact />}
          {runtime.error && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-2 text-ui-sm text-destructive"
            >
              <span className="break-words">{runtime.error}</span>
              <Button variant="ghost" size="sm" onClick={runtime.refresh}>
                {zh ? "重试" : "Retry"}
              </Button>
            </div>
          )}
        </div>
      </div>
      {!follow && messages.length > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="absolute bottom-3 right-5 gap-1.5 rounded-full bg-background shadow-sm"
          onClick={() => {
            anchor.current = undefined;
            setFollow(true);
          }}
        >
          <ArrowDown className="size-3.5" />
          {zh ? "回到最新" : "Jump to latest"}
        </Button>
      )}
    </div>
  );
}
