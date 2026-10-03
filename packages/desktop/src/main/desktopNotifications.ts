import { app, BrowserWindow, Notification } from "electron";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { formatZodError, PlatformChannels, taskNotificationPayloadSchema } from "@knorvia/shared";

const recent = new Map<string, number>();
const retained = new Set<Notification>();
export function dispatchTaskNotification(options: {
  event: IpcMainEvent | IpcMainInvokeEvent;
  payload: unknown;
  logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
}): boolean {
  const parsed = taskNotificationPayloadSchema.safeParse(options.payload);
  if (!parsed.success) {
    options.logger.warn("[show-task-notification] invalid payload:", formatZodError(parsed.error));
    return false;
  }
  if (!Notification.isSupported()) {
    options.logger.warn("[show-task-notification] notification is not supported on this platform");
    return false;
  }
  if (BrowserWindow.getAllWindows().some((window) => !window.isDestroyed() && window.isFocused()))
    return false;
  const { taskId, status, requestId, title: rawTitle, body: rawBody } = parsed.data;
  const title = rawTitle.trim();
  const body = rawBody.trim();
  if (!title || !body) {
    options.logger.warn("[show-task-notification] missing localized notification copy", {
      taskId,
      status,
      hasTitle: !!title,
      hasBody: !!body,
    });
    return false;
  }
  const now = Date.now();
  for (const [key, time] of recent) if (now - time > 3000) recent.delete(key);
  const target =
    status === "permission_request" || status === "elicitation_request"
      ? requestId?.trim() || taskId
      : taskId;
  const key = `${status}:${target}`;
  const previous = recent.get(key);
  if (previous != null && now - previous < 3000) return false;
  recent.set(key, now);
  const senderWindow = BrowserWindow.fromWebContents(options.event.sender);
  const notification = new Notification({ title, body, silent: true });
  retained.add(notification);
  if (retained.size > 100) {
    const oldest = retained.values().next().value;
    if (oldest) retained.delete(oldest);
  }
  notification.once("click", () => {
    retained.delete(notification);
    if (!senderWindow || senderWindow.isDestroyed()) {
      options.logger.warn("[show-task-notification] click ignored: sender window is gone", {
        taskId,
      });
      return;
    }
    if (senderWindow.isMinimized()) senderWindow.restore();
    if (!senderWindow.isVisible()) senderWindow.show();
    if (process.platform === "darwin") {
      app.dock?.show();
      app.show();
      app.focus({ steal: true });
    }
    senderWindow.focus();
    senderWindow.webContents.send(PlatformChannels.TaskNotificationClick, taskId);
    options.logger.info("[show-task-notification] notification click handled", {
      taskId,
      windowId: senderWindow.id,
    });
  });
  notification.once("close", () => {
    retained.delete(notification);
  });
  notification.show();
  options.event.sender.send(PlatformChannels.TaskNotificationSound);
  return true;
}
