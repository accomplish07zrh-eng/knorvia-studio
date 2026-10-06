import type {
  CliProviderSwitchApplyRequest,
  CliProviderSwitchApplyResult,
  CliProviderSwitchView,
} from "@knorvia/shared";
import { ServiceChannels } from "@knorvia/shared";
import { createServiceDescriptor } from "../descriptors.js";

/**
 * Claude Code / Codex / Grok Build 全局模型配置切换（specs/knorvia-cli-provider-switch.md）。
 * 本机 Host 是这些配置文件的唯一写入者；界面只通过此服务读取状态和提交切换。
 */
export interface ICliProviderSwitchService {
  getView(): Promise<CliProviderSwitchView>;
  apply(request: CliProviderSwitchApplyRequest): Promise<CliProviderSwitchApplyResult>;
}

export const ICliProviderSwitchService = createServiceDescriptor<ICliProviderSwitchService>(
  ServiceChannels.CliProviderSwitch,
);
