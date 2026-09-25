import { KnorviaMark } from "@/components/knorvia/KnorviaMark.js";
import openaiLogo from "@/assets/provider-icons/model-provider-openai.png";
import kimiLogo from "@/assets/provider-icons/model-provider-moonshot-kimi.png";
import deepseekLogo from "@/assets/provider-icons/model-provider-deepseek.png";
import opencodeLightLogo from "@/assets/provider-icons/model-provider-opencode-light.svg";
import opencodeDarkLogo from "@/assets/provider-icons/model-provider-opencode-dark.svg";
import claudeLogo from "@/assets/cli-icons/kernel-claude.png";
import grokLogo from "@/assets/cli-icons/kernel-grok.png";
import qoderLogo from "@/assets/cli-icons/kernel-qoder.png";
import antigravityLogo from "@/assets/cli-icons/kernel-antigravity.png";
import qwenCodeLogo from "@/assets/cli-icons/kernel-qwen-code.png";
import geminiCliLogo from "@/assets/cli-icons/kernel-gemini-cli.png";
import gooseLogo from "@/assets/cli-icons/kernel-goose.png";
import hermesLogo from "@/assets/cli-icons/kernel-hermes.ico?url";
import mistralVibeLogo from "@/assets/cli-icons/kernel-mistral-vibe.svg";
import copilotLogo from "@/assets/cli-icons/kernel-copilot.svg";
import { cn } from "@/components/lib/utils.js";
import type { StudioKernelId } from "../types.js";

/** 此前将母公司标志和手绘示意图当成产品图标；统一映射官方标识，供所有入口复用。 */
const icons: Partial<Record<StudioKernelId, string>> = {
  codex: openaiLogo,
  "claude-code": claudeLogo,
  "grok-build": grokLogo,
  qoder: qoderLogo,
  "qoder-cn": qoderLogo,
  antigravity: antigravityLogo,
  "qwen-code": qwenCodeLogo,
  "gemini-cli": geminiCliLogo,
  goose: gooseLogo,
  hermes: hermesLogo,
  "mistral-vibe": mistralVibeLogo,
  copilot: copilotLogo,
  "kimi-cli": kimiLogo,
  "deepseek-harness": deepseekLogo,
};

/** 自定义 ACP 没有可验证的厂商标识，只显示中性缩写。 */
function CustomKernelMark({
  kernelId,
  className,
}: {
  kernelId: StudioKernelId;
  className?: string;
}) {
  const initials = kernelId.startsWith("acp:") ? kernelId.slice(4, 6).toUpperCase() : "AI";
  return (
    <svg
      aria-hidden="true"
      className={cn("size-5 shrink-0", className)}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.4" />
      <text
        x="12"
        y="15.2"
        textAnchor="middle"
        fill="currentColor"
        fontSize="8.5"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        {initials}
      </text>
    </svg>
  );
}

export function StudioKernelIcon({
  kernelId,
  className,
}: {
  kernelId: StudioKernelId;
  className?: string;
}) {
  const remote = /^ssh:[a-f0-9]{24}:(.+)$/.exec(kernelId);
  if (remote)
    return <StudioKernelIcon kernelId={remote[1]! as StudioKernelId} className={className} />;
  if (kernelId === "knorvia") return <KnorviaMark className={cn("size-5", className)} />;
  if (kernelId === "opencode")
    return (
      <span className={cn("relative inline-flex size-5 shrink-0", className)} aria-hidden="true">
        <img
          src={opencodeLightLogo}
          alt=""
          className="absolute inset-0 size-full object-contain dark:hidden"
        />
        <img
          src={opencodeDarkLogo}
          alt=""
          className="absolute inset-0 hidden size-full object-contain dark:block"
        />
      </span>
    );
  const source = icons[kernelId];
  if (!source) return <CustomKernelMark kernelId={kernelId} className={className} />;
  return (
    <img
      src={source}
      alt=""
      aria-hidden="true"
      className={cn(
        "size-5 shrink-0 object-contain",
        kernelId === "copilot" && "dark:invert",
        className,
      )}
    />
  );
}
