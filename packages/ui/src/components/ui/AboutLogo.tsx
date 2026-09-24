import knorviaLogo from "@/assets/knorvia-logo.png";
import { cn } from "@/components/lib/utils.js";

export function AboutLogo({ className }: { className?: string }) {
  return (
    <img
      src={knorviaLogo}
      className={cn("shrink-0", className)}
      alt="Knorvia Studio"
      draggable={false}
    />
  );
}

export function KnorviaWordmarkLogo({ className }: { className?: string }) {
  return (
    <span className={cn("shrink-0 text-current font-semibold", className)}>Knorvia Studio</span>
  );
}
