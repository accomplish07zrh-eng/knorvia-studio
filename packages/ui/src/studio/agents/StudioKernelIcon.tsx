import { KnorviaMark } from "@/components/knorvia/KnorviaMark.js";
import openaiLogo from "@/assets/cli-icons/mark-openai.svg";
import kimiLogo from "@/assets/cli-icons/mark-kimi.svg";
import deepseekLogo from "@/assets/cli-icons/mark-deepseek.svg";
import opencodeLightLogo from "@/assets/provider-icons/model-provider-opencode-light.svg";
import opencodeDarkLogo from "@/assets/provider-icons/model-provider-opencode-dark.svg";
import claudeLogo from "@/assets/cli-icons/mark-claude.svg";
import grokLogo from "@/assets/cli-icons/mark-grok.svg";
import qoderLogo from "@/assets/cli-icons/mark-qoder.svg";
import antigravityLogo from "@/assets/cli-icons/mark-antigravity.svg";
import qwenCodeLogo from "@/assets/cli-icons/mark-qwen.svg";
import geminiCliLogo from "@/assets/cli-icons/mark-gemini.svg";
import gooseLogo from "@/assets/cli-icons/mark-goose.svg";
import hermesLogo from "@/assets/cli-icons/kernel-hermes.ico?url";
import mistralVibeLogo from "@/assets/cli-icons/kernel-mistral-vibe.svg";
import copilotLogo from "@/assets/cli-icons/kernel-copilot.svg";
import { cn } from "@/components/lib/utils.js";
import type { StudioKernelId } from "../types.js";

/** 位图的白/黑方底在玻璃和深色上很突兀；共用有来源记录的透明矢量产品标识。 */
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
        kernelId !== "hermes" && kernelId !== "mistral-vibe" && "dark:invert",
        className,
      )}
    />
  );
}
