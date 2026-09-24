import type { KnorviaProvider } from "@knorvia/shared";
import { KnorviaMark } from "@/components/knorvia/KnorviaMark.js";

export function renderProviderCliIcon(_provider: KnorviaProvider = "knorvia", className?: string) {
  // 这里表示内置 Agent 身份，模型供应商图标仍由各供应商自己的展示组件负责。
  return <KnorviaMark className={className} />;
}
