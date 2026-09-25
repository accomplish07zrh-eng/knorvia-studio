import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
  const settling = useRef(false);
  const [follow, setFollow] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const messages = runtime.timeline?.messages ?? [];
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const hasOlder = runtime.timeline?.nextBefore !== undefined;
  const hasOlderRef = useRef(hasOlder);
  hasOlderRef.current = hasOlder;
  const getItemKey = useCallback((index: number) => {
    if (hasOlderRef.current && index === 0) return "studio-history-button";
    return messagesRef.current[index - Number(hasOlderRef.current)]?.id ?? index;
  }, []);
  const virtualizer = useVirtualizer({
    count: messages.length + Number(hasOlder),
    getScrollElement: () => scroll.current,
    getItemKey,
    estimateSize: (index) => {
      if (hasOlder && index === 0) return 36;
      const kind = messages[index - Number(hasOlder)]?.kind;
      return kind === "progress" ? 36 : kind === "tool" ? 76 : 160;
    },
    overscan: 5,
    gap: 20,
    scrollMargin: 20,
  });
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item) =>
    !anchor.current && !follow && item.end < (scroll.current?.scrollTop ?? 0);
  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const virtualAnchor = useRef<{ key: string; offset: number } | undefined>(undefined);
  const rememberAnchor = () => {
    const el = scroll.current;
    if (!el) return;
    const current = captureStudioScrollAnchor(el);
    anchor.current = current;
    const key = current?.element.dataset.studioMessageId;
    virtualAnchor.current = key ? { key, offset: current.offset } : undefined;
  };
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
      const measurement = virtualizer.measurementsCache.find(
        (item) => item.key === virtualAnchor.current?.key,
      );
      if (measurement && virtualAnchor.current)
        el.scrollTop = measurement.start - virtualAnchor.current.offset;
      else if (el.contains(anchor.current.element)) restoreStudioScrollAnchor(el, anchor.current);
    } else if (follow) el.scrollTop = el.scrollHeight;
  }, [runtime.timeline, follow, loadingOlder, totalSize, virtualizer]);
  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroll}
        data-studio-timeline-scroll=""
        className="h-full overflow-y-auto [overflow-anchor:none] [scrollbar-gutter:stable]"
        onWheel={() => {
          if (loading.current) requestAnimationFrame(rememberAnchor);
          else {
            settling.current = false;
            anchor.current = undefined;
            virtualAnchor.current = undefined;
          }
        }}
        onTouchMove={() => {
          if (loading.current) requestAnimationFrame(rememberAnchor);
        }}
        onPointerMove={(event) => {
          if (loading.current && event.buttons) requestAnimationFrame(rememberAnchor);
        }}
        onScroll={(event) => {
          const el = event.currentTarget;
          if (!loading.current && !settling.current) {
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
            if (atBottom) {
              anchor.current = undefined;
              virtualAnchor.current = undefined;
            } else rememberAnchor();
            setFollow(atBottom);
          }
        }}
      >
        <div
          className={`mx-auto space-y-5 px-4 py-5 ${getConversationContentWidthClassName({ centeredEmptyLayout: false, statusPanelLayout: "none" })}`}
        >
          <div
            data-studio-virtual-list=""
            data-studio-count={messages.length}
            className="relative"
            style={{ height: totalSize }}
          >
            {virtualRows.map((row) => {
              const isHistoryButton = hasOlder && row.index === 0;
              const message = messages[row.index - Number(hasOlder)];
              if (!isHistoryButton && !message) return null;
              return (
                <div
                  key={row.key}
                  ref={virtualizer.measureElement}
                  data-index={row.index}
                  data-studio-virtual-row=""
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${row.start - 20}px)` }}
                >
                  {isHistoryButton ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={loadingOlder}
                      onClick={() => {
                        if (loading.current) return;
                        loading.current = true;
                        rememberAnchor();
                        setFollow(false);
                        setLoadingOlder(true);
                        void runtime.loadOlder().finally(() => {
                          loading.current = false;
                          settling.current = true;
                          setLoadingOlder(false);
                          // 顶部“加载更早消息”消失时，虚拟器的索引和动态测高会在
                          // 相邻绘制帧内收敛；以实际可见消息再对齐一次阅读锚点。
                          const settleAnchor = () => {
                            const el = scroll.current;
                            const key = virtualAnchor.current?.key;
                            if (!el || !key || !virtualAnchor.current) return;
                            const current = [
                              ...el.querySelectorAll<HTMLElement>("[data-studio-message-id]"),
                            ].find((item) => item.dataset.studioMessageId === key);
                            if (current)
                              restoreStudioScrollAnchor(el, {
                                element: current,
                                offset: virtualAnchor.current.offset,
                              });
                          };
                          requestAnimationFrame(() => {
                            settleAnchor();
                            requestAnimationFrame(() => {
                              settleAnchor();
                              settling.current = false;
                            });
                          });
                        });
                      }}
                    >
                      {loadingOlder && <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />}
                      {zh ? "加载更早消息" : "Load earlier messages"}
                    </Button>
                  ) : message?.kind === "reasoning" ? (
                    <Reasoning data-studio-message-id={message.id}>
                      <ReasoningTrigger />
                      <ReasoningContent>{message.text}</ReasoningContent>
                    </Reasoning>
                  ) : message?.kind === "tool" ? (
                    <details
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
                  ) : message?.kind === "progress" ? (
                    <p
                      data-studio-message-id={message.id}
                      className="text-ui-sm text-foreground-subtle"
                    >
                      {message.text}
                    </p>
                  ) : message ? (
                    <Message
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
                  ) : null}
                </div>
              );
            })}
          </div>
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
