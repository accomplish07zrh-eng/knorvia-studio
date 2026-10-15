// SPDX-License-Identifier: Apache-2.0
// 遥测事件的主机名/错误/详情消毒与 renderer 上下文采集（B18）。
// 产品无遥测上报端点（env.ts 恒 false/空串）；本模块只做本地换算与脱敏。

export type TelemetryRendererContext = {
  clientTimezone: /* 客户端时区标识 */ string;
  clientLanguage: /* 客户端语言标识 */ string;
  screenResolution: /* "<宽>x<高>" 文本 */ string;
};

export type TelemetryEventPayload = {
  elementName: /* 触发元素名 */ string;
  eventRegion: /* 事件区域 */ string;
  eventType: /* 事件类型 */ string;
  eventText?: /* 事件文本（先脱敏） */ string;
  eventExtraDetail: /* 附加详情键值 */ Record<string, string>;
  userId?: /* 用户标识 */ string;
  talkId?: /* 会话标识 */ string;
  messageId?: /* 消息标识 */ string;
};

export type RendererTelemetryEventPayload = TelemetryEventPayload & {
  context: /* 采集时的渲染端环境 */ TelemetryRendererContext;
};

export type ArmsCustomEventPayload = {
  name: /* 事件名 */ string;
  group: /* 事件分组 */ string;
  value?: /* 数值载荷 */ number;
  properties?: /* 附加属性 */ Record<string, string | number | boolean | undefined>;
};

export type FinalArmsCustomEventPayload = {
  name: /* 事件名 */ string;
  type: /* 固定字面量：custom */ "custom";
  group: /* 事件分组 */ string;
  value: /* 数值载荷 */ number;
  properties: /* 附加属性（值全为字符串） */ Record<string, string>;
};

export type FinalArmsCustomEventE2EEntry = {
  sequence: /* 录制序号 */ number;
  recordedAt: /* 录制时刻毫秒 */ number;
  payload: /* 录制的事件载荷 */ FinalArmsCustomEventPayload;
};

export type ConfigureFinalArmsCustomEventE2ERequest = {
  suppressedEventNames: /* 被压制的事件名列表 */ string[];
};

export function resolveSafeTelemetryHostname(input: string | null | undefined): string {
  const candidate = input?.trim();
  if (!candidate) {
    return "";
  }

  let hostname = "";
  try {
    const parsedUrl = new URL(candidate);
    const protocolOk = parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
    hostname = protocolOk ? parsedUrl.hostname.toLowerCase() : "";
  } catch {
    hostname = ""; // 不是合法 URL 就没有可信主机名
  }
  return hostname;
}

export function sanitizeTelemetryErrorMessage(input: string | null | undefined): string {
  return input ? "[redacted]" : ""; // 消息正文永不外传
}

function sanitizeTelemetryLoginHostname(input: string): string {
  const hostText = resolveSafeTelemetryHostname(input);
  if (hostText) {
    return hostText;
  }

  const lowered = input.trim().toLowerCase();
  const bareHostAccepted =
    lowered !== "" && resolveSafeTelemetryHostname(`https://${lowered}`) === lowered;
  return bareHostAccepted ? lowered : "";
}

export function sanitizeTelemetryEventDetail(
  elementKey: string,
  detailMap: Readonly<Record<string, string>>,
): Record<string, string> {
  const cleaned: Array<[string, string]> = Object.entries(detailMap).map(
    ([detailKey, detailValue]) => {
      if (detailKey === "error_msg") {
        return [detailKey, sanitizeTelemetryErrorMessage(detailValue)];
      }
      if (elementKey === "app_login_ck" && detailKey === "login_url") {
        return [detailKey, sanitizeTelemetryLoginHostname(detailValue)];
      }
      return [detailKey, detailValue];
    },
  );
  return Object.fromEntries(cleaned);
}

type TelemetryScreenLike = {
  width: /* 屏幕宽 */ number;
  height: /* 屏幕高 */ number;
};

type TelemetryWindowLike = {
  intlLocale?: /* 显式语言标识 */ string;
  timeZone?: /* 显式时区标识 */ string;
  screen: /* 屏幕尺寸来源 */ TelemetryScreenLike;
};

export function collectTelemetryRendererContext(
  windowLike?: TelemetryWindowLike,
): TelemetryRendererContext {
  const intlFallback =
    typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions() : undefined;
  const timezone = windowLike?.timeZone ?? intlFallback?.timeZone ?? "UTC";
  const language = windowLike?.intlLocale ?? intlFallback?.locale ?? "en-US";
  const globalScreen = (globalThis as { screen?: TelemetryScreenLike }).screen;
  const activeScreen = windowLike?.screen ?? globalScreen ?? { width: 0, height: 0 };
  const context: TelemetryRendererContext = {
    clientTimezone: timezone,
    clientLanguage: language,
    screenResolution: `${activeScreen.width}x${activeScreen.height}`,
  };
  return context;
}
